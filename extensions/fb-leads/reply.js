// Reply queue, inside a Facebook post tab the extension opened (or opened from the Telegram "Open in Chrome" button).
// It asks background.js for the drafted comment, puts it in the comment box and shows a small Waydidi bar. A person
// reads and edits the draft and presses Facebook's own Post button. The one exception is a comment a team member
// approved in Telegram with "Post to Facebook" (lead.auto): then this script presses send itself. When a new comment by
// one of the Waydidi names appears, it tells background.js, which marks the lead Posted and closes the tab.
(function () {
  "use strict";
  if (window.__waydidiReply) return;
  window.__waydidiReply = true;

  // Read now (run_at document_start): Facebook may rewrite the address once its page starts.
  var hash = /#waydidi-reply=([a-f0-9]{16})/.exec(location.hash || "");
  var hashId = hash ? hash[1] : "";
  var FIND_MS = 20000, WATCH_MS = 1500, POSTED_MS = 30000;

  function ask(message) {
    return chrome.runtime.sendMessage(message).catch(function () { return null; });
  }

  function bar(text, buttons) {
    var host = document.getElementById("waydidi-reply-bar");
    if (!host) {
      host = document.createElement("div");
      host.id = "waydidi-reply-bar";
      host.attachShadow({ mode: "open" });
      document.documentElement.appendChild(host);
    }
    var root = host.shadowRoot;
    root.innerHTML = "<style>div{position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:360px;background:#fff;color:#1c2b24;border:2px solid #1f7a4d;border-radius:12px;padding:12px 14px;font:14px/1.45 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.18)}b{color:#1f7a4d}p{margin:0 0 10px}button{font:inherit;border:0;border-radius:8px;padding:7px 12px;margin:0 6px 0 0;cursor:pointer;background:#e4ece7;color:#1c2b24}button.main{background:#1f7a4d;color:#fff}</style><div><p><b>Waydidi</b> · <span></span></p><nav></nav></div>";
    root.querySelector("span").textContent = text;
    var nav = root.querySelector("nav");
    buttons.forEach(function (b) {
      var el = document.createElement("button");
      el.textContent = b.text;
      if (b.main) el.className = "main";
      el.addEventListener("click", b.run);
      nav.appendChild(el);
    });
  }
  function closeBar() { var host = document.getElementById("waydidi-reply-bar"); if (host) host.remove(); }

  var finished = false;
  function done(action) {
    if (finished) return;
    finished = true;
    bar(action === "posted" ? "Marked as posted. Closing this tab…" : action === "auto_failed" ? "Could not post it. The team is told in Telegram. Closing this tab…" : "Skipped. Closing this tab…", []);
    ask({ type: "reply-done", action: action });
  }
  function stop() {
    finished = true;
    closeBar();
    ask({ type: "reply-stop" });
  }

  function whenReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once: true });
    else fn();
  }

  whenReady(async function () {
    var res = await ask({ type: "reply-draft", id: hashId });
    if (!res || !res.lead) {
      if (hashId && res && res.message) bar(res.message, [{ text: "Close", run: closeBar }]);
      return;
    }
    var lead = res.lead, names = (await chrome.storage.local.get({ names: ["Waydidi Travel"] })).names || [];
    var common = [
      { text: "Posted", run: function () { done("posted"); } },
      { text: "Skip", run: function () { done("skipped"); } },
      { text: "Stop queue", run: stop },
    ];
    var box = null, baseline = 0, waited = 0, sendBy = 0, lastText = "", likeBase = 0;

    // Approved in Telegram ("Post to Facebook"): put the comment in, wait a few seconds like a person, press send, and
    // report Posted only once the comment shows on the page. Anything unexpected is reported as failed (the team is
    // told in Telegram to post it by hand); it is never retried by itself.
    function autoPost(filled) {
      // A Waydidi comment, or one with these words, is already here (an earlier try did post): never twice.
      if (baseline > 0 || window.WaydidiLeads.commentsLike(document, lead.comment) > 0) return done("posted");
      if (filled !== "filled") return done("auto_failed");
      bar("Posting the comment approved in Telegram…", [{ text: "Stop", run: stop }]);
      setTimeout(function () {
        if (finished) return;
        if (window.WaydidiLeads.submitComment(document, box) === "none") return done("auto_failed");
        sendBy = Date.now() + POSTED_MS;
      }, 3000 + Math.random() * 3000);
    }

    function fill() {
      box = window.WaydidiLeads.findCommentBox(document);
      if (!box) return false;
      baseline = window.WaydidiLeads.ourComments(document, names, box);
      // Filled once only: box is set above, so the timer below never tries again while the editor is still writing.
      window.WaydidiLeads.fillComment(document, box, lead.comment).then(function (r) {
        if (finished) return;
        if (lead.auto) autoPost(r);
        else if (r === "filled") bar("The draft is in the comment box. Read it, change it if needed, then press Post on Facebook yourself.", common);
        else bar(r === "busy" ? "The comment box already has text, so the draft was not added." : "The draft could not be added here.", [{ text: "Copy draft", main: true, run: copy }].concat(common));
      });
      return true;
    }
    function copy() {
      navigator.clipboard.writeText(lead.comment).then(function () {
        bar("Draft copied. Paste it in the comment box, check it, then press Post yourself.", common);
      });
    }

    bar("Looking for the comment box…", [{ text: "Copy draft", run: copy }].concat(common));
    var timer = setInterval(function () {
      if (finished) return clearInterval(timer);
      if (!box) {
        if (fill()) return;
        waited += WATCH_MS;
        if (waited >= FIND_MS && lead.auto) return done("auto_failed");
        if (waited >= FIND_MS) bar("No comment box found on this page (comments may be off).", [{ text: "Copy draft", main: true, run: copy }].concat(common));
        return;
      }
      // What is in the comment box now (the person may have edited the draft). Facebook may redraw the box, so it is
      // looked up again; once the comment is sent the box is empty and the last text seen is kept.
      var now = window.WaydidiLeads.findCommentBox(document) || box, text = (now.textContent || "").trim();
      if (text && text !== lastText) { lastText = text; likeBase = window.WaydidiLeads.commentsLike(document, text); }
      // Posted: a new comment by a Waydidi name, or a new comment starting with the same words as the draft (whatever
      // Facebook name it was posted under, so a staff member's own profile works too).
      if (window.WaydidiLeads.ourComments(document, names, box) > baseline) return done("posted");
      if (lastText && window.WaydidiLeads.commentsLike(document, lastText) > likeBase) return done("posted");
      if (sendBy && Date.now() > sendBy) done("auto_failed"); // sent, but the comment never appeared
    }, WATCH_MS);
  });
})();
