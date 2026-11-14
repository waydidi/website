// Sends the posts the content script found to Waydidi. The token stays in this browser's extension storage and is
// only ever sent to the one address below.
var ENDPOINT = "https://waydidi.com/api/integrations/fb-leads";

function today() {
  var d = new Date(), two = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
}

function badge(text, color) {
  chrome.action.setBadgeText({ text: text });
  if (color) chrome.action.setBadgeBackgroundColor({ color: color });
}

async function problem(message) {
  await chrome.storage.local.set({ problem: message });
  badge("!", "#c0392b");
  return { ok: false, error: message };
}

async function send(posts) {
  var s = await chrome.storage.local.get({ token: "", enabled: true, stats: {} });
  if (!s.enabled) return { ok: false, error: "paused" };
  if (!s.token) return problem("No token yet. Open Settings and paste the token.");
  var res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: "Bearer " + s.token, "Content-Type": "application/json" },
      body: JSON.stringify({ posts: posts.slice(0, 25) }),
    });
  } catch {
    return problem("Could not reach waydidi.com. Check your internet connection.");
  }
  if (res.status === 401) return problem("Waydidi did not accept the token. Paste it again in Settings.");
  if (res.status === 404) return problem("Facebook leads is switched off on the website (FB_LEADS_ENABLED).");
  if (!res.ok) return problem("Waydidi answered with an error (" + res.status + "). It will retry.");
  var data = await res.json().catch(function () { return {}; });
  var stats = s.stats && s.stats.day === today() ? s.stats : { day: today(), accepted: 0, skipped: 0, duplicates: 0 };
  stats.accepted += data.accepted || 0;
  stats.skipped += data.skipped || 0;
  stats.duplicates += data.duplicates || 0;
  await chrome.storage.local.set({ stats: stats, problem: "" });
  badge(String(stats.accepted - stats.skipped), "#1f7a4d");
  return { ok: true, accepted: data.accepted || 0, skipped: data.skipped || 0, duplicates: data.duplicates || 0 };
}

// ---- Reply queue (off on the website until FB_LEADS_REPLY_QUEUE_ENABLED=true) ----
// Start in the popup: one drafted lead at a time is opened in a new tab, reply.js puts the comment in the comment box,
// and a person checks it and presses Post on Facebook. When the comment appears (or the person taps Posted / Skip in
// the Waydidi bar) the lead is marked, the tab is closed and the next one opens after the website's gap between
// comments. The website holds the daily cap and the gap, so they apply to every browser together. This file never
// presses anything on Facebook.
var REPLY_ENDPOINT = ENDPOINT + "/reply", ALARM = "reply-next";

async function replyCall(body) {
  var s = await chrome.storage.local.get({ token: "" });
  if (!s.token) return { status: 401, data: {} };
  try {
    var res = await fetch(REPLY_ENDPOINT, { method: "POST", headers: { Authorization: "Bearer " + s.token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, data: await res.json().catch(function () { return {}; }) };
  } catch {
    return { status: 0, data: {} };
  }
}

// Which tab answers which lead. Session storage: kept while the browser is open, even when this worker sleeps.
async function replyTabs() { return (await chrome.storage.session.get({ replyTabs: {} })).replyTabs; }
async function setReplyTab(tabId, entry) {
  var tabs = await replyTabs();
  if (entry) tabs[tabId] = entry; else delete tabs[tabId];
  await chrome.storage.session.set({ replyTabs: tabs });
}
async function setReplyRun(change) {
  var run = (await chrome.storage.local.get({ replyRun: {} })).replyRun || {};
  await chrome.storage.local.set({ replyRun: Object.assign({}, run, change, { at: Date.now() }) });
}
function replyProblem(status) {
  return status === 404 ? "The reply queue is switched off on the website (FB_LEADS_REPLY_QUEUE_ENABLED)."
    : status === 401 ? "Waydidi did not accept the token. Paste it again in Settings."
    : status === 0 ? "Could not reach waydidi.com. Check your internet connection."
    : "Waydidi answered with an error (" + status + "). Try again in a minute.";
}

async function openNext() {
  var run = (await chrome.storage.local.get({ replyRun: {} })).replyRun || {};
  if (!run.active) return;
  var r = await replyCall({ action: "next" });
  if (r.status !== 200) return setReplyRun({ active: false, message: replyProblem(r.status) });
  var d = r.data;
  if (d.lead) {
    var auto = (await chrome.storage.local.get({ autoPost: false })).autoPost === true;
    var tab = await chrome.tabs.create({ url: d.lead.url, active: true });
    await setReplyTab(tab.id, { id: d.lead.id, comment: d.lead.comment, auto: auto });
    return setReplyRun({ message: auto ? "The comment is in the open tab. Waiting for ส่ง Comment in Telegram." : "Check the comment in the open tab, then press Post on Facebook." });
  }
  if (d.wait === "gap") {
    // A little extra after the website's gap, different each time.
    var when = Math.max(Date.now() + 30000, new Date(d.retryAt).getTime() + 20000 + Math.random() * 70000);
    chrome.alarms.create(ALARM, { when: when });
    return setReplyRun({ message: "Next comment at " + new Date(when).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " (pause between comments)." });
  }
  setReplyRun({ active: false, message: d.wait === "limit" ? "Done: today's comment limit is reached." : "Done: no drafted comments are waiting." });
}

async function replyDone(tabId, action) {
  var entry = (await replyTabs())[tabId];
  if (!entry) return;
  await setReplyTab(tabId, null); // before closing, so onRemoved does not hand the lead back
  var r = await replyCall({ action: action, id: entry.id });
  // 409: someone already marked it in Telegram, which is fine.
  if (r.status !== 200 && r.status !== 409) await setReplyRun({ active: false, message: replyProblem(r.status) });
  var run = (await chrome.storage.local.get({ replyRun: {} })).replyRun || {};
  if (action === "posted" && r.status === 200) await setReplyRun({ posted: (run.day === today() ? run.posted || 0 : 0) + 1, day: today() });
  chrome.tabs.remove(tabId).catch(function () {});
  if (run.active) chrome.alarms.create(ALARM, { when: Date.now() + 30000 });
}

async function replyStop(tabId) {
  chrome.alarms.clear(ALARM);
  var entry = tabId !== undefined ? (await replyTabs())[tabId] : null;
  // Stop after ส่ง Comment was tapped: not sent, so the team is told to post it by hand. Before: back in the queue.
  if (entry) { await setReplyTab(tabId, null); await replyCall({ action: entry.sending ? "auto_failed" : "release", id: entry.id }); }
  await setReplyRun({ active: false, message: "Stopped." });
}

/** reply.js asks for the draft for its tab. A tab opened from the Telegram button asks for its lead by id. */
async function replyDraft(tabId, id) {
  var entry = (await replyTabs())[tabId];
  if (entry) return { lead: entry };
  if (!id) return null;
  var r = await replyCall({ action: "next", id: id });
  if (r.status !== 200) return { message: replyProblem(r.status) };
  if (r.data.lead) {
    var auto = (await chrome.storage.local.get({ autoPost: false })).autoPost === true, entry = { id: r.data.lead.id, comment: r.data.lead.comment, auto: auto };
    await setReplyTab(tabId, entry);
    return { lead: entry };
  }
  return { message: r.data.wait === "gap" ? "Wait a few minutes between comments, then open it again." : r.data.wait === "limit" ? "Today's comment limit is reached." : "This lead was already handled, or is open in another tab." };
}

// ---- Send from Telegram (off on the website until FB_LEADS_AUTO_POST_ENABLED=true) ----
// With "Send from Telegram (ส่ง Comment)" ticked in the popup, a reply tab does not wait for you to press Post: once the
// comment is in the box, reply.js tells the website ("ready"), the team gets a message under the lead with ส่ง Comment,
// and reply.js asks every few seconds ("status"). After the tap it waits 15 seconds and presses send itself.
async function replyReady(tabId) {
  var entry = (await replyTabs())[tabId];
  if (!entry) return { ok: false };
  var r = await replyCall({ action: "ready", id: entry.id });
  return { ok: r.status === 200, off: r.status === 409 && r.data && r.data.error === "off", message: r.status === 200 ? "" : replyProblem(r.status) };
}
async function replyStatus(tabId) {
  var entry = (await replyTabs())[tabId];
  if (!entry) return { ok: false };
  var r = await replyCall({ action: "status", id: entry.id });
  if (r.status !== 200) return { ok: false };
  return { ok: true, status: r.data.status, approved: Boolean(r.data.approved) };
}
async function replySending(tabId) {
  var entry = (await replyTabs())[tabId];
  if (entry) await setReplyTab(tabId, Object.assign({}, entry, { sending: true }));
  return { ok: true };
}

chrome.alarms.onAlarm.addListener(function (alarm) { if (alarm.name === ALARM) openNext(); });
// A reply tab closed by hand: the lead goes back to the queue and the queue pauses (the person has stepped away).
// Closed after ส่ง Comment was tapped (while Chrome was about to send): counted as failed, so the team posts it by hand.
chrome.tabs.onRemoved.addListener(async function (tabId) {
  var entry = (await replyTabs())[tabId];
  if (!entry) return;
  await setReplyTab(tabId, null);
  await replyCall({ action: entry.sending ? "auto_failed" : "release", id: entry.id });
  chrome.alarms.clear(ALARM);
  await setReplyRun({ active: false, message: "Paused: a reply tab was closed. The lead went back to the queue." });
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (sender.id !== chrome.runtime.id || !message) return;
  var tabId = sender.tab && sender.tab.id;
  var job = null;
  if (message.type === "posts" && Array.isArray(message.posts)) job = send(message.posts);
  else if (message.type === "reply-start") job = setReplyRun({ active: true, message: "Starting…" }).then(openNext).then(function () { return { ok: true }; });
  else if (message.type === "reply-stop") job = replyStop(tabId).then(function () { return { ok: true }; });
  else if (message.type === "reply-draft" && tabId !== undefined) job = replyDraft(tabId, typeof message.id === "string" ? message.id : "");
  else if (message.type === "reply-ready" && tabId !== undefined) job = replyReady(tabId);
  else if (message.type === "reply-status" && tabId !== undefined) job = replyStatus(tabId);
  else if (message.type === "reply-sending" && tabId !== undefined) job = replySending(tabId);
  else if (message.type === "reply-done" && tabId !== undefined && (message.action === "posted" || message.action === "skipped" || message.action === "auto_failed")) job = replyDone(tabId, message.action).then(function () { return { ok: true }; });
  if (!job) return;
  job.then(sendResponse, function () { sendResponse({ ok: false, error: "failed" }); });
  return true;
});
