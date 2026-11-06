// Runs on Facebook pages. When you are in a group, it reads the posts on screen (extractor.js) and hands the new ones
// to background.js, which sends them to Waydidi. It never scrolls, clicks or posts: you read the group, it takes notes.
(function () {
  "use strict";

  var BATCH = 25, MAX_REMEMBERED = 5000, RETRY_MS = 60000, SETTLE_MS = 1500, MAX_TEXT = 4000;
  var seen = {}, loaded = false, busy = false, timer = null, retryAt = 0;

  function key(url) { return url.split("?")[0]; }

  function remember() {
    var keys = Object.keys(seen);
    chrome.storage.local.set({ sent: keys.slice(-MAX_REMEMBERED) });
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(scan, SETTLE_MS);
  }

  async function scan() {
    if (!loaded || busy || location.pathname.indexOf("/groups/") !== 0 || Date.now() < retryAt) return;
    var fresh = window.WaydidiLeads.findPosts(document).filter(function (p) { return !seen[key(p.url)]; });
    if (!fresh.length) return;
    busy = true;
    try {
      for (var i = 0; i < fresh.length; i += BATCH) {
        var batch = fresh.slice(i, i + BATCH).map(function (p) { return { url: p.url, text: p.text.slice(0, MAX_TEXT), groupName: p.groupName }; });
        var res = await chrome.runtime.sendMessage({ type: "posts", posts: batch });
        if (!res || !res.ok) { retryAt = Date.now() + RETRY_MS; break; }
        batch.forEach(function (p) { seen[key(p.url)] = true; });
        remember();
      }
    } catch {
      retryAt = Date.now() + RETRY_MS; // the extension was reloaded or the network is down: try again in a minute
    } finally {
      busy = false;
    }
  }

  chrome.storage.local.get({ sent: [] }, function (stored) {
    stored.sent.forEach(function (k) { seen[k] = true; });
    loaded = true;
    schedule();
  });
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
})();
