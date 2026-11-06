var enabled = document.getElementById("enabled"), collect = document.getElementById("collect"), stop = document.getElementById("stop");
var REASONS = {
  enough: "Done: collected enough posts for one run.",
  time: "Done: the time limit for one run was reached.",
  end: "Done: reached the end of the feed.",
  hidden: "Stopped: this tab was hidden. Keep it in front while collecting.",
  left: "Stopped: you left the group.",
  touched: "Stopped: you used the page.",
  stopped: "Stopped.",
  problem: "Stopped: posts could not be sent. See the message above.",
  limit: "No more runs today (4 a day, to keep your account safe). Reading while you browse still works.",
  notgroup: "Open a Facebook group page first.",
};

function render() {
  chrome.storage.local.get({ enabled: true, problem: "", stats: {}, run: null }, function (s) {
    enabled.checked = s.enabled;
    document.getElementById("problem").textContent = s.problem || "";
    var n = s.stats || {};
    var d = new Date(), two = function (x) { return String(x).padStart(2, "0"); };
    var today = d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
    document.getElementById("stats").textContent = n.day === today
      ? "Today: " + (n.accepted - n.skipped) + " new posts sent, " + n.skipped + " ignored (not a request, an advert or a long stay), " + n.duplicates + " already known."
      : "Nothing sent yet today.";
    var run = s.run, running = Boolean(run && run.state === "running" && Date.now() - run.at < 5 * 60000);
    collect.hidden = running; stop.hidden = !running;
    document.getElementById("run").textContent = !run ? ""
      : running ? "Collecting… " + run.posts + " posts looked at, " + run.leads + " look like requests."
      : (REASONS[run.reason] || "Done.") + (run.posts ? " " + run.posts + " posts looked at, " + run.leads + " look like requests." : "");
  });
}

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
collect.addEventListener("click", function () { tellTab("collect"); });
stop.addEventListener("click", function () { tellTab("stop"); });
chrome.storage.onChanged.addListener(render);
render();
