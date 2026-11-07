// Settings page. Wrapped in a function so its names cannot clash with browser globals such as window.status.
(function () {
  "use strict";
  var ENDPOINT = "https://waydidi.com/api/integrations/fb-leads";
  var input = document.getElementById("token"), message = document.getElementById("status");

  var namesBox = document.getElementById("names");

  chrome.storage.local.get({ token: "", names: ["Waydidi Travel"] }, function (s) { input.value = s.token; namesBox.value = s.names.join("\n"); });

  function say(text) { message.textContent = text; }

  document.getElementById("save").addEventListener("click", function () {
    var names = namesBox.value.split("\n").map(function (n) { return n.trim(); }).filter(Boolean).slice(0, 10);
    chrome.storage.local.set({ token: input.value.trim(), names: names, problem: "" }, function () {
      chrome.action.setBadgeText({ text: "" });
      say("Saved.");
    });
  });

  // An empty list of posts is refused with 400 only after the token is accepted, so 400 means "connected".
  document.getElementById("test").addEventListener("click", async function () {
    say("Testing…");
    try {
      var res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: "Bearer " + input.value.trim(), "Content-Type": "application/json" },
        body: JSON.stringify({ posts: [] }),
      });
      say(res.status === 400 ? "Connected. The token works."
        : res.status === 401 ? "Waydidi did not accept this token."
        : res.status === 404 ? "Facebook leads is switched off on the website (FB_LEADS_ENABLED)."
        : "Unexpected answer (" + res.status + ").");
    } catch {
      say("Could not reach waydidi.com.");
    }
  });
})();
