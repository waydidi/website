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
    hidden: "Stopped: this tab was hidden. Keep it in front while collecting.",
    left: "Stopped: you left the group.",
    touched: "Stopped: you used the page.",
    stopped: "Stopped.",
    problem: "Stopped: posts could not be sent. See the message above.",
    limit: "No more runs today (4 a day, to keep your account safe). Reading while you browse still works.",
    notgroup: "Open a Facebook group page first.",
  };

  function render() {
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
        text += " On the page: " + run.diag.articles + " posts, " + run.diag.withLink + " with a post link, " + run.diag.withText + " with text.";
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

  function tellTab(type) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: type }, function () {
        if (chrome.runtime.lastError) chrome.storage.local.set({ run: { state: "done", reason: "notgroup", posts: 0, leads: 0, at: Date.now() } });
      });
    });
  }
  // The outline has no words, names or ids: only the page's structure and link shapes, so it is safe to paste in a chat.
  document.getElementById("sample").addEventListener("click", function () {
    var note = document.getElementById("sampleNote");
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: "sample" }, function (res) {
        if (chrome.runtime.lastError || !res || !res.sample) { note.textContent = "Open a Facebook group page first."; return; }
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
