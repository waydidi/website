// Sends the posts the content script found to Waydidi. The token stays in this browser's extension storage and is
// only ever sent to the one address below.
var ENDPOINT = "https://waydidi.com/api/integrations/fb-leads";
importScripts("queue-plan.js"); // WaydidiPlan: the reply queue's group order

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
// Start in the popup: one drafted lead at a time is opened in a new tab, reply.js likes the post, puts the comment in
// the comment box and the team approves it in Telegram (ส่ง Comment). When the comment appears (or someone taps Posted /
// Skip) the lead is marked, the tab is closed and the next one opens after the website's gap between comments. The
// website holds the daily cap and the gap, so they apply to every browser together.
// Groups: the popup's ticked groups are worked in their order, a set number of posted comments in each before the next,
// looping (queue-plan.js). With no groups listed, any group's lead is taken, strongest first, as before.
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
  var plan = run.plan && run.plan.groups && run.plan.groups.length ? run.plan : null;
  var where = function () { return plan ? WaydidiPlan.describe(plan) + ". " : ""; };
  // Each ticked group is asked in turn; one with nothing ready is passed over. All of them empty: the run is done.
  for (var tries = 0; tries < (plan ? plan.groups.length : 1); tries++) {
    var group = plan ? WaydidiPlan.current(plan) : null;
    var r = await replyCall(group ? { action: "next", groups: group.keys && group.keys.length ? group.keys : [group.key] } : { action: "next" });
    if (r.status !== 200) return setReplyRun({ active: false, plan: plan, message: replyProblem(r.status) });
    var d = r.data;
    if (d.lead) {
      var tab = await chrome.tabs.create({ url: d.lead.url, active: true });
      await setReplyTab(tab.id, { id: d.lead.id, comment: d.lead.comment, auto: true });
      return setReplyRun({ plan: plan, message: where() + "The comment is in the open tab. Waiting for ส่ง Comment in Telegram." });
    }
    if (d.wait === "gap") {
      // A little extra after the website's gap, different each time.
      var when = Math.max(Date.now() + 30000, new Date(d.retryAt).getTime() + 20000 + Math.random() * 70000);
      chrome.alarms.create(ALARM, { when: when });
      return setReplyRun({ plan: plan, message: where() + "Next comment at " + new Date(when).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " (pause between comments)." });
    }
    if (d.wait === "limit") return setReplyRun({ active: false, plan: plan, message: "Done: today's comment limit is reached." });
    if (plan) plan = WaydidiPlan.nextGroup(plan); // this group has nothing ready: the next one
  }
  setReplyRun({ active: false, plan: plan, message: plan ? "Done: no drafted comments are waiting in the chosen groups." : "Done: no drafted comments are waiting." });
}

/** Start: the plan from the popup's group order; the same groups and number carry on where the last run stopped. */
async function replyStart() {
  var s = await chrome.storage.local.get({ replyRun: {}, replyGroups: {} });
  var plan = WaydidiPlan.makePlan(s.replyGroups, (s.replyRun || {}).plan);
  await setReplyRun({ active: true, plan: plan, message: "Starting…" });
  await openNext();
}

/** The groups with comments waiting, for the popup's list. */
async function replyGroups() {
  var r = await replyCall({ action: "groups" });
  return r.status === 200 && Array.isArray(r.data.groups) ? { ok: true, groups: r.data.groups } : { ok: false, message: replyProblem(r.status) };
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
  // The comment is on Facebook (409: someone also marked it in Telegram): it counts towards this group's number.
  if (action === "posted" && (r.status === 200 || r.status === 409) && run.plan && run.plan.groups && run.plan.groups.length) await setReplyRun({ plan: WaydidiPlan.afterPosted(run.plan) });
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
    var entry = { id: r.data.lead.id, comment: r.data.lead.comment, auto: true };
    await setReplyTab(tabId, entry);
    return { lead: entry };
  }
  return { message: r.data.wait === "gap" ? "Wait a few minutes between comments, then open it again." : r.data.wait === "limit" ? "Today's comment limit is reached." : "This lead was already handled, or is open in another tab." };
}

// ---- Send from Telegram (off on the website until FB_LEADS_AUTO_POST_ENABLED=true) ----
// Always on in the extension: a reply tab does not wait for you to press Post: once the
// comment is in the box, reply.js tells the website ("ready"), the team gets a message under the lead with ส่ง Comment,
// and reply.js asks every few seconds ("status"). After the tap it waits 15 seconds and presses send itself.
async function replyReady(tabId) {
  var entry = (await replyTabs())[tabId];
  if (!entry) return { ok: false };
  var r = await replyCall({ action: "ready", id: entry.id });
  return { ok: r.status === 200, off: r.status === 409 && r.data && r.data.error === "off", message: r.status === 200 ? "" : replyProblem(r.status) };
}
/** Chrome cannot send this comment itself (the QR picture could not be added): the team is told in Telegram. */
async function replyHand(tabId, reason) {
  var entry = (await replyTabs())[tabId];
  if (!entry || reason !== "qr") return { ok: false };
  var r = await replyCall({ action: "needs_hand", id: entry.id, reason: reason });
  var off = r.status === 409 && r.data && r.data.error === "off";
  return { ok: r.status === 200, off: off, message: r.status === 200 ? "" : off ? "Sending from Telegram is switched off on the website." : r.status === 409 ? "This lead is no longer open in this tab." : replyProblem(r.status) };
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
  else if (message.type === "reply-start") job = replyStart().then(function () { return { ok: true }; });
  else if (message.type === "reply-groups") job = replyGroups();
  else if (message.type === "reply-stop") job = replyStop(tabId).then(function () { return { ok: true }; });
  else if (message.type === "reply-draft" && tabId !== undefined) job = replyDraft(tabId, typeof message.id === "string" ? message.id : "");
  else if (message.type === "reply-ready" && tabId !== undefined) job = replyReady(tabId);
  else if (message.type === "reply-status" && tabId !== undefined) job = replyStatus(tabId);
  else if (message.type === "reply-hand" && tabId !== undefined) job = replyHand(tabId, message.reason);
  else if (message.type === "reply-sending" && tabId !== undefined) job = replySending(tabId);
  else if (message.type === "is-reply-tab" && tabId !== undefined) job = replyTabs().then(function (tabs) { return { reply: Boolean(tabs[tabId]) }; });
  else if (message.type === "reply-done" && tabId !== undefined && (message.action === "posted" || message.action === "skipped" || message.action === "auto_failed")) job = replyDone(tabId, message.action).then(function () { return { ok: true }; });
  if (!job) return;
  job.then(sendResponse, function () { sendResponse({ ok: false, error: "failed" }); });
  return true;
});
