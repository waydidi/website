// Runs on Facebook pages. When you are in a group, it reads the posts on screen (extractor.js) and hands the new ones
// to background.js, which sends them to Waydidi. By default it never scrolls, clicks or posts: you read the group, it
// takes notes. If you press "Collect" in the popup it also scrolls the feed at a human pace (runner.js) for a short,
// limited run.
(function () {
  "use strict";

  var BATCH = 25, MAX_REMEMBERED = 5000, RETRY_MS = 60000, SETTLE_MS = 1500, MAX_TEXT = 4000, MAX_RUNS_PER_DAY = 4;
  var seen = {}, loaded = false, timer = null, retryAt = 0, chain = Promise.resolve(), runAbort = null;
  // Everything sent so far by anyone (the page watcher sends posts too while a run scrolls), so a run counts them all.
  var sentPosts = 0, sentLeads = 0;

  function key(url) { return url.split("?")[0]; }

  function day() {
    var d = new Date(), two = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
  }

  function remember() {
    chrome.storage.local.set({ sent: Object.keys(seen).slice(-MAX_REMEMBERED) });
  }

  /**
   * Sends the new posts on screen. Resolves { posts, leads, visible }: posts = new posts sent, leads = those that look like
   * requests, visible = posts readable on screen now including ones sent before. Null if sending failed.
   */
  async function doScan() {
    if (!loaded || location.pathname.indexOf("/groups/") !== 0) return { posts: 0, leads: 0, visible: 0 };
    var all = window.WaydidiLeads.findPosts(document), visible = all.length;
    var fresh = all.filter(function (p) { return !seen[key(p.url)]; });
    if (!fresh.length) return { posts: 0, leads: 0, visible: visible };
    if (Date.now() < retryAt) return null;
    var posts = 0, leads = 0;
    try {
      for (var i = 0; i < fresh.length; i += BATCH) {
        var batch = fresh.slice(i, i + BATCH).map(function (p) { return { url: p.url, text: p.text.slice(0, MAX_TEXT), groupName: p.groupName }; });
        var res = await chrome.runtime.sendMessage({ type: "posts", posts: batch });
        if (!res || !res.ok) { retryAt = Date.now() + RETRY_MS; return posts ? { posts: posts, leads: leads, visible: visible } : null; }
        batch.forEach(function (p) { seen[key(p.url)] = true; });
        remember();
        posts += batch.length;
        leads += Math.max(0, (res.accepted || 0) - (res.skipped || 0));
        sentPosts += batch.length;
        sentLeads += Math.max(0, (res.accepted || 0) - (res.skipped || 0));
      }
    } catch {
      retryAt = Date.now() + RETRY_MS; // the extension was reloaded or the network is down: try again in a minute
      return posts ? { posts: posts, leads: leads, visible: visible } : null;
    }
    return { posts: posts, leads: leads, visible: visible };
  }

  // One scan at a time, in order (the page watcher and a Collect run never overlap).
  function scan() {
    var next = chain.then(doScan);
    chain = next.catch(function () {});
    return next;
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(scan, SETTLE_MS);
  }

  function setRun(run) { chrome.storage.local.set({ run: Object.assign({ at: Date.now() }, run) }); }

  async function startRun() {
    if (runAbort) return;
    if (location.pathname.indexOf("/groups/") !== 0) return setRun({ state: "done", reason: "notgroup", posts: 0, leads: 0 });
    var stored = await chrome.storage.local.get({ runs: {}, target: 50 });
    var target = Math.min(100, Math.max(10, parseInt(stored.target, 10) || 50));
    var runs = stored.runs && stored.runs.day === day() ? stored.runs : { day: day(), count: 0 };
    if (runs.count >= MAX_RUNS_PER_DAY) return setRun({ state: "done", reason: "limit", posts: 0, leads: 0 });
    runs.count++;
    chrome.storage.local.set({ runs: runs });
    runAbort = new AbortController();
    var lastPosts = sentPosts, lastLeads = sentLeads; // only posts sent after Collect was pressed count
    setRun({ state: "running", posts: 0, leads: 0, target: target });
    try {
      var result = await window.WaydidiLeads.collect({
        scan: async function () {
          var r = await scan();
          if (!r) return null;
          var out = { posts: sentPosts - lastPosts, leads: sentLeads - lastLeads, visible: r.visible };
          lastPosts = sentPosts; lastLeads = sentLeads;
          return out;
        },
        signal: runAbort.signal, maxPosts: target,
        onStep: function (p) { setRun({ state: "running", posts: p.posts, leads: p.leads, target: target }); },
      });
      setRun({ state: "done", reason: result.reason, posts: result.posts, leads: result.leads, target: target, diag: window.WaydidiLeads.diagnose(document) });
    } catch {
      setRun({ state: "done", reason: "problem", posts: 0, leads: 0 });
    } finally {
      runAbort = null;
    }
  }

  chrome.runtime.onMessage.addListener(function (message, sender) {
    if (sender.id !== chrome.runtime.id || !message) return;
    if (message.type === "collect") startRun();
    if (message.type === "stop" && runAbort) runAbort.abort();
  });

  chrome.storage.local.get({ sent: [] }, function (stored) {
    stored.sent.forEach(function (k) { seen[k] = true; });
    loaded = true;
    schedule();
  });
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
})();
