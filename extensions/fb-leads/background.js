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
  return { ok: true };
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (sender.id !== chrome.runtime.id || !message || message.type !== "posts" || !Array.isArray(message.posts)) return;
  send(message.posts).then(sendResponse, function () { sendResponse({ ok: false, error: "failed" }); });
  return true;
});
