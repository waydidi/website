// Popup. Wrapped in a function so its names cannot clash with browser globals such as window.stop.
(function () {
  "use strict";
  var enabled = document.getElementById("enabled"), collect = document.getElementById("collect"), stopButton = document.getElementById("stop");
  var target = document.getElementById("target");
  var REASONS = {
    enough: "Done: reached your lead target.",
    looked: "Stopped: looked at 1,000 posts in this run without reaching the target (safety stop).",
    end: "Done: reached the end of the feed (the page stopped loading more posts).",
    time: "Done: the time limit for one run was reached.",
    steps: "Done: the screen limit for one run was reached.",
    unreadable: "Stopped: no post on this page could be read. Facebook may have changed its layout.",
    hidden: "Stopped: this tab stayed hidden too long (over 2 minutes). A quick check elsewhere is fine.",
    left: "Stopped: you left the group.",
    touched: "Stopped: you used the page.",
    stopped: "Stopped.",
    problem: "Stopped: posts could not be sent. See the message above.",
    limit: "No runs left today.",
    notgroup: "Open a Facebook group page first.",
  };

  var replyStart = document.getElementById("replyStart"), replyStop = document.getElementById("replyStop");
  var groupsBox = document.getElementById("groups"), per = document.getElementById("per");
  var Plan = window.WaydidiPlan;
  // The group list: saved order and ticks (chrome.storage "replyGroups"), merged with the groups the website says have
  // comments waiting. Changes are saved at once; Start uses what is saved.
  var rows = [], waiting = null, waitingNote = "", running = false, plan = null;

  function saveGroups(then) {
    chrome.storage.local.set({ replyGroups: { groups: rows.map(function (g) { return { key: g.key, name: g.name, on: g.on }; }), per: Plan.perOf(per.value) } }, then);
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function drawGroups() {
    groupsBox.textContent = "";
    if (!rows.length) { groupsBox.appendChild(el("div", "hint", waitingNote || (waiting ? "No drafted comments are waiting in any group." : "Loading…"))).style.padding = "6px 8px"; return; }
    var now = running && plan ? Plan.current(plan) : null, n = 0;
    var ticked = rows.filter(function (g) { return g.on; }), nowAt = now ? ticked.findIndex(function (g) { return g.key === now.key; }) : -1;
    var next = nowAt >= 0 && ticked.length > 1 ? ticked[(nowAt + 1) % ticked.length] : null;
    rows.forEach(function (g, i) {
      var row = el("label", "g" + (g.on ? "" : " off") + (now && now.key === g.key ? " now" : ""));
      var box = el("input"); box.type = "checkbox"; box.checked = g.on; box.disabled = running;
      box.addEventListener("change", function () { g.on = box.checked; saveGroups(); drawGroups(); });
      row.appendChild(box);
      row.appendChild(el("span", "n", g.on ? String(++n) : "–"));
      var name = el("span", "name", g.name);
      var left = g.waiting + " waiting";
      var sub = now && now.key === g.key ? "▶ Now · " + plan.count + " of " + plan.per + " posted" : next && next.key === g.key ? "Next · " + left : g.on ? left : left + " · not in this run";
      name.appendChild(el("small", "", sub));
      row.appendChild(name);
      if (!running) {
        [["▲", -1], ["▼", 1]].forEach(function (m) {
          var b = el("button", "move", m[0]); b.type = "button"; b.title = m[1] < 0 ? "Earlier" : "Later";
          b.disabled = i + m[1] < 0 || i + m[1] >= rows.length;
          b.addEventListener("click", function (e) { e.preventDefault(); var j = i + m[1], t = rows[i]; rows[i] = rows[j]; rows[j] = t; saveGroups(); drawGroups(); });
          row.appendChild(b);
        });
      }
      groupsBox.appendChild(row);
    });
  }
  function loadGroups() {
    chrome.runtime.sendMessage({ type: "reply-groups" }, function (res) {
      if (chrome.runtime.lastError || !res) { waiting = []; waitingNote = "Could not load the groups. Reload the extension in chrome://extensions."; }
      else if (!res.ok) { waiting = []; waitingNote = res.message; }
      else { waiting = res.groups; waitingNote = ""; }
      chrome.storage.local.get({ replyGroups: {} }, function (s) {
        rows = Plan.mergeGroups((s.replyGroups || {}).groups, waiting);
        drawGroups();
      });
    });
  }
  per.addEventListener("change", function () { per.value = Plan.perOf(per.value); saveGroups(); });

  function renderReply() {
    chrome.storage.local.get({ replyRun: {}, replyGroups: {} }, function (s) {
      var r = s.replyRun || {}, d = new Date(), two = function (x) { return String(x).padStart(2, "0"); };
      var today = d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
      running = Boolean(r.active); plan = r.plan && r.plan.groups && r.plan.groups.length ? r.plan : null;
      replyStart.hidden = running; replyStop.hidden = !running;
      per.disabled = running;
      if (document.activeElement !== per) per.value = Plan.perOf((s.replyGroups || {}).per);
      document.getElementById("reply").textContent = (r.message || "") + (r.day === today && r.posted ? " Posted today through the queue: " + r.posted + "." : "");
      drawGroups();
    });
  }
  replyStart.addEventListener("click", function () {
    if (rows.length && !rows.some(function (g) { return g.on; })) { document.getElementById("reply").textContent = "Tick at least one group first."; return; }
    saveGroups(function () { chrome.runtime.sendMessage({ type: "reply-start" }); });
  });
  loadGroups();
  replyStop.addEventListener("click", function () { chrome.runtime.sendMessage({ type: "reply-stop" }); });

  function render() {
    renderReply();
    chrome.storage.local.get({ enabled: true, problem: "", stats: {}, run: null, target: 50 }, function (s) {
      enabled.checked = s.enabled;
      if (document.activeElement !== target) target.value = s.target;
      document.getElementById("problem").textContent = s.problem || "";
      var n = s.stats || {};
      var d = new Date(), two = function (x) { return String(x).padStart(2, "0"); };
      var today = d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
      document.getElementById("stats").textContent = n.day === today
        ? "Today: " + (n.accepted - n.skipped) + " new posts sent, " + n.skipped + " ignored (not a request, an advert or a long stay), " + n.duplicates + " already known."
        : "Nothing sent yet today.";
      var run = s.run, running = Boolean(run && run.state === "running" && Date.now() - run.at < 5 * 60000);
      collect.hidden = running; stopButton.hidden = !running;
      target.disabled = running;
      // Leads are posts the website's free filter keeps; the rest of the posts looked at were ignored.
      // While running: "7 of 50 leads"; at the end: "52 leads (target 50)" (the last batch can go a little past it).
      var leadText = run ? (running ? run.leads + (run.target ? " of " + run.target : "") + " leads" : run.leads + " leads" + (run.target ? " (target " + run.target + ")" : "")) : "";
      var progress = run ? leadText + " · " + run.posts + " posts looked at · " + Math.max(0, run.posts - run.leads) + " ignored" : "";
      var text = !run ? "" : running ? "Collecting… " + progress
        : (REASONS[run.reason] || "Done.") + (run.posts ? " " + progress + "." : "");
      if (run && !running && run.free) text += " This run did not count towards today's 4.";
      if (run && !running && run.diag && (run.reason === "unreadable" || run.reason === "end") && run.posts === 0) {
        text += " On the page: " + run.diag.articles + " posts, " + run.diag.withLink + " with a post link, " + run.diag.withText + " with text" +
          (run.diag.hidden !== undefined ? ", " + run.diag.hidden + " hidden links, " + run.diag.tried + " tries, " + run.diag.pageData + " found in page data" : "") + ".";
      }
      document.getElementById("run").textContent = text;
    });
  }

  target.addEventListener("change", function () {
    var value = Math.min(100, Math.max(5, parseInt(target.value, 10) || 50));
    target.value = value;
    chrome.storage.local.set({ target: value });
  });
  enabled.addEventListener("change", function () { chrome.storage.local.set({ enabled: enabled.checked }); });
  document.getElementById("settings").addEventListener("click", function () { chrome.runtime.openOptionsPage(); });

  var FB_URL = /^https:\/\/(?:www|web)\.facebook\.com\//;
  // Any tab left open from before the extension's last reload has no content script (reloading kills the old one),
  // so the first message to it fails. When that happens on a Facebook tab, the scripts are injected again on the
  // spot (host_permissions in the manifest cover facebook.com, so this needs no click gesture) and the message is
  // retried once; content.js and page-world.js each guard against running twice.
  function withTab(onReady) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs[0];
      if (!tab || !tab.id) return onReady(null);
      onReady(tab);
    });
  }
  function reinject(tab, then) {
    if (!FB_URL.test(tab.url || "")) return then(false);
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["extractor.js", "runner.js", "content.js"] }, function () {
      if (chrome.runtime.lastError) return then(false);
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["page-world.js"], world: "MAIN" }, function () {
        then(!chrome.runtime.lastError);
      });
    });
  }
  function sendToTab(tab, message, callback) {
    chrome.tabs.sendMessage(tab.id, message, function (res) {
      if (!chrome.runtime.lastError) return callback(res);
      reinject(tab, function (ok) {
        if (!ok) return callback(undefined, true);
        chrome.tabs.sendMessage(tab.id, message, function (res2) { callback(res2, Boolean(chrome.runtime.lastError)); });
      });
    });
  }

  function tellTab(type) {
    withTab(function (tab) {
      if (!tab) return;
      sendToTab(tab, { type: type }, function (res, failed) {
        if (failed) chrome.storage.local.set({ run: { state: "done", reason: "notgroup", posts: 0, leads: 0, at: Date.now() } });
      });
    });
  }
  // The outline has no words, names or ids: only the page's structure and link shapes, so it is safe to paste in a chat.
  document.getElementById("sample").addEventListener("click", function () {
    var note = document.getElementById("sampleNote");
    withTab(function (tab) {
      if (!tab) return;
      sendToTab(tab, { type: "sample" }, function (res, failed) {
        if (failed || !res || !res.sample) { note.textContent = "Open a Facebook group page first."; return; }
        navigator.clipboard.writeText(res.sample).then(
          function () { note.textContent = "Copied (no words, names or ids). Paste it to the developer."; },
          function () { note.textContent = "Could not copy. Try again."; });
      });
    });
  });
  collect.addEventListener("click", function () { tellTab("collect"); });
  stopButton.addEventListener("click", function () { tellTab("stop"); });
  chrome.storage.onChanged.addListener(render);
  render();
})();
