var ENDPOINT = "https://waydidi.com/api/integrations/fb-leads";
var input = document.getElementById("token"), status = document.getElementById("status");

chrome.storage.local.get({ token: "" }, function (s) { input.value = s.token; });

function say(text) { status.textContent = text; }

document.getElementById("save").addEventListener("click", function () {
  chrome.storage.local.set({ token: input.value.trim(), problem: "" }, function () {
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
