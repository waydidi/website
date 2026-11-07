// Runs on Facebook pages. When you are in a group, it reads the posts on screen (extractor.js) and hands the new ones
// to background.js, which sends them to Waydidi. By default it never scrolls, clicks or posts: you read the group, it
// takes notes. If you press "Collect" in the popup it also scrolls the feed at a human pace (runner.js) for a short,
// limited run.
(function () {
  "use strict";

  var BATCH = 25, MAX_REMEMBERED = 5000, RETRY_MS = 60000, SETTLE_MS = 1500, MAX_TEXT = 4000, MAX_RUNS_PER_DAY = 4;
  var seen = {}, loaded = false, timer = null, retryAt = 0, chain = Promise.resolve(), runAbort = null;
  var DEFAULT_NAMES = ["Waydidi Travel"], names = DEFAULT_NAMES;
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
  async function doScan(expand) {
    if (!loaded || location.pathname.indexOf("/groups/") !== 0) return { posts: 0, leads: 0, visible: 0 };
    // Facebook fills in a post's hidden link when a mouse moves over its time: hover those once, give it a moment.
    // During a Collect run (only), "See more" is tapped too, so the whole post is read before it is judged.
    var waited = window.WaydidiLeads.revealLinks(document) + (expand === true ? window.WaydidiLeads.expandPosts(document) : 0);
    if (waited) await new Promise(function (r) { setTimeout(r, 700); });
    var all = window.WaydidiLeads.findPosts(document, { names: names }), visible = all.length;
    var fresh = all.filter(function (p) { return !seen[key(p.url)]; });
    if (!fresh.length) return { posts: 0, leads: 0, visible: visible };
    if (Date.now() < retryAt) return null;
    var posts = 0, leads = 0;
    try {
      for (var i = 0; i < fresh.length; i += BATCH) {
        var batch = fresh.slice(i, i + BATCH).map(function (p) { return { url: p.url, text: p.text.slice(0, MAX_TEXT), groupName: p.groupName, skip: p.skip }; });
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
  function scan(expand) {
    var next = chain.then(function () { return doScan(expand === true); });
    chain = next.catch(function () {});
    return next;
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(scan, SETTLE_MS);
  }

  function setRun(run) { chrome.storage.local.set({ run: Object.assign({ at: Date.now() }, run) }); }

  async function giveRunBack(dayKey) {
    var stored = await chrome.storage.local.get({ runs: {} });
    if (stored.runs && stored.runs.day === dayKey && stored.runs.count > 0) await chrome.storage.local.set({ runs: { day: dayKey, count: stored.runs.count - 1 } });
  }

  async function startRun() {
    if (runAbort) return;
    if (location.pathname.indexOf("/groups/") !== 0) return setRun({ state: "done", reason: "notgroup", posts: 0, leads: 0 });
    // The target is lead posts: posts the website's free filter keeps (adverts, long stays and chat do not count).
    var stored = await chrome.storage.local.get({ runs: {}, target: 50 });
    var target = Math.min(100, Math.max(5, parseInt(stored.target, 10) || 50));
    var runs = stored.runs && stored.runs.day === day() ? stored.runs : { day: day(), count: 0 };
    if (runs.count >= MAX_RUNS_PER_DAY) return setRun({ state: "done", reason: "limit", posts: 0, leads: 0 });
    runs.count++;
    chrome.storage.local.set({ runs: runs });
    var read = false;
    runAbort = new AbortController();
    var lastPosts = sentPosts, lastLeads = sentLeads; // only posts sent after Collect was pressed count
    setRun({ state: "running", posts: 0, leads: 0, target: target });
    try {
      var result = await window.WaydidiLeads.collect({
        scan: async function () {
          var r = await scan(true); // a Collect run taps "See more"
          if (!r) return null;
          var out = { posts: sentPosts - lastPosts, leads: sentLeads - lastLeads, visible: r.visible };
          lastPosts = sentPosts; lastLeads = sentLeads;
          return out;
        },
        signal: runAbort.signal, maxLeads: target,
        onStep: function (p) { setRun({ state: "running", posts: p.posts, leads: p.leads, target: target }); },
      });
      read = Boolean(result.read);
      setRun({ state: "done", reason: result.reason, posts: result.posts, leads: result.leads, target: target, diag: window.WaydidiLeads.diagnose(document), free: !read });
    } catch {
      setRun({ state: "done", reason: "problem", posts: 0, leads: 0, free: true });
    } finally {
      runAbort = null;
      // A run that could not read a single post (unreadable page, sending refused at once, stopped straight away) did not
      // scroll through anyone's posts, so it does not use up one of the day's runs.
      if (!read) await giveRunBack(runs.day);
    }
  }

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (sender.id !== chrome.runtime.id || !message) return;
    if (message.type === "collect") startRun();
    if (message.type === "stop" && runAbort) runAbort.abort();
    // An anonymous outline of the posts on screen (no words, names or ids), for the developer to fix the reader.
    if (message.type === "sample") sendResponse({ sample: window.WaydidiLeads.sample(document) });
  });

  // The Facebook names Waydidi comments with (Settings), to skip posts it already commented on.
  chrome.storage.local.get({ names: DEFAULT_NAMES }, function (s) { names = s.names; });
  chrome.storage.onChanged.addListener(function (changes) { if (changes.names) names = changes.names.newValue || []; });

  chrome.storage.local.get({ sent: [] }, function (stored) {
    stored.sent.forEach(function (k) { seen[k] = true; });
    loaded = true;
    schedule();
  });
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
})();
