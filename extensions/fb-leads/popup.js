var enabled = document.getElementById("enabled");

chrome.storage.local.get({ enabled: true, problem: "", stats: {} }, function (s) {
  enabled.checked = s.enabled;
  document.getElementById("problem").textContent = s.problem || "";
  var n = s.stats || {};
  var d = new Date(), two = function (x) { return String(x).padStart(2, "0"); };
  var today = d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
  document.getElementById("stats").textContent = n.day === today
    ? "Today: " + (n.accepted - n.skipped) + " new posts sent, " + n.skipped + " ignored (not a question), " + n.duplicates + " already known."
    : "Nothing sent yet today. Open a Facebook group and scroll.";
});

enabled.addEventListener("change", function () { chrome.storage.local.set({ enabled: enabled.checked }); });
document.getElementById("settings").addEventListener("click", function () { chrome.runtime.openOptionsPage(); });
