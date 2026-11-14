// Reply queue, inside a Facebook post tab the extension opened (or opened from the Telegram "Open in Chrome" button).
// It asks background.js for the drafted comment, puts it in the comment box and shows a small Waydidi bar. A person
// reads and edits the draft and presses Facebook's own Post button. The one exception is "Send from Telegram"
// (lead.auto): the team gets a message under the lead with ส่ง Comment, and 15 seconds after a team member taps it this
// script presses send itself. When the comment appears (by a Waydidi name, or with the same words), it tells
// background.js, which marks the lead Posted and closes the tab.
(function () {
  "use strict";
  if (window.__waydidiReply) return;
  window.__waydidiReply = true;

  // Read now (run_at document_start): Facebook may rewrite the address once its page starts.
  var hash = /#waydidi-reply=([a-f0-9]{16})/.exec(location.hash || "");
  var hashId = hash ? hash[1] : "";
  var FIND_MS = 20000, WATCH_MS = 1500, POSTED_MS = 30000, POLL_MS = 4000, SEND_DELAY_MS = 15000; // 15 s after ส่ง Comment (owner choice)

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

    // Send from Telegram (the popup's "Send from Telegram" box): once the comment is in the box, the team gets a message
    // under the lead with ส่ง Comment, and this tab asks every few seconds whether someone tapped it. After the tap it
    // waits SEND_DELAY_MS, presses send, and reports Posted only once the comment shows on the page. Anything that goes
    // wrong after the tap is reported as failed (the team is told to post it by hand); it is never retried by itself.
    // Until the tap, pressing Post on Facebook yourself works as usual.
    function sendFromTelegram(filled, note) {
      // A Waydidi comment, or one with these words, is already here (an earlier try did post): never twice.
      if (baseline > 0 || window.WaydidiLeads.commentsLike(document, lead.comment) > 0) return done("posted");
      if (filled !== "filled") return manualBar(filled);
      ask({ type: "reply-ready" }).then(function (r) {
        if (finished) return;
        if (!r || !r.ok) return bar(r && r.off ? "Sending from Telegram is switched off on the website. Press Post on Facebook yourself." : "Telegram could not be told. Press Post on Facebook yourself.", common);
        bar((note ? note + " " : "") + "Waiting for ส่ง Comment in Telegram. You can also press Post on Facebook yourself.", common);
        var poll = setInterval(function () {
          if (finished) return clearInterval(poll);
          ask({ type: "reply-status" }).then(function (s) {
            if (finished || !s || !s.ok) return;
            // Someone tapped Posted or Skip (ข้าม) in Telegram instead: nothing to send here.
            if (s.status !== "sent") { clearInterval(poll); return done(s.status === "posted" ? "posted" : "skipped"); }
            if (!s.approved) return;
            clearInterval(poll);
            ask({ type: "reply-sending" });
            bar("ส่ง Comment was tapped. Sending in " + SEND_DELAY_MS / 1000 + " seconds…", [{ text: "Stop", run: stop }]);
            setTimeout(function () {
              if (finished) return;
              if (window.WaydidiLeads.submitComment(document, window.WaydidiLeads.findCommentBox(document) || box) === "none") return done("auto_failed");
              sendBy = Date.now() + POSTED_MS;
            }, SEND_DELAY_MS);
          });
        }, POLL_MS);
      });
    }
    function manualBar(r, note) {
      if (r === "filled") bar((note ? note + " " : "") + "The draft is in the comment box. Read it, change it if needed, then press Post on Facebook yourself.", common);
      else bar(r === "busy" ? "The comment box already has text, so the draft was not added." : "The draft could not be added here.", [{ text: "Copy draft", main: true, run: copy }].concat(common));
    }

    function fill() {
      box = window.WaydidiLeads.findCommentBox(document);
      if (!box) return false;
      baseline = window.WaydidiLeads.ourComments(document, names, box);
      // Filled once only: box is set above, so the timer below never tries again while the editor is still writing.
      window.WaydidiLeads.fillComment(document, box, lead.comment).then(async function (r) {
        if (finished) return;
        var extra = r === "filled" ? await tagAndPicture() : { ok: true, note: "" };
        if (finished) return;
        // A sales comment without its QR picture is never sent by Chrome: the person adds it and presses Post.
        if (lead.auto && !extra.ok) return bar(extra.note + " Add it, then press Post on Facebook yourself.", common);
        if (lead.auto) sendFromTelegram(r, extra.note);
        else manualBar(r, extra.note);
      });
      return true;
    }

    // After the text is in: the page's name becomes a real tag (@ and Facebook's suggestion), and a sales comment (one
    // with the WhatsApp number) gets the QR picture chosen in Settings. Resolves { ok, note }: ok is false when a sales
    // comment is missing its picture; note says what could not be done.
    async function tagAndPicture() {
      var W = window.WaydidiLeads, notes = [];
      bar("Adding the page tag" + (W.isSalesComment(lead.comment) ? " and the QR picture…" : "…"), []);
      for (var i = 0; i < names.length; i++) {
        var tagged = await W.tagName(document, box, names[i]);
        if (tagged === "absent") continue;
        if (tagged === "no_suggestion") notes.push("The tag for " + names[i] + " could not be added (Facebook showed no suggestion).");
        break;
      }
      if (!W.isSalesComment(lead.comment)) return { ok: true, note: notes.join(" ") };
      var qr = (await chrome.storage.local.get({ qr: null })).qr;
      if (!qr || !qr.data) return { ok: false, note: notes.concat("No QR picture is set in Settings.").join(" ") };
      // Decoded here rather than fetched, so the Facebook page's own rules cannot block it.
      var parts = /^data:([^;,]+);base64,(.*)$/.exec(qr.data);
      if (!parts) return { ok: false, note: notes.concat("The QR picture in Settings could not be read. Pick it again.").join(" ") };
      var raw = atob(parts[2]), bytes = new Uint8Array(raw.length);
      for (var b = 0; b < raw.length; b++) bytes[b] = raw.charCodeAt(b);
      var file = new File([bytes], qr.name || "waydidi-qr.jpg", { type: parts[1] });
      if ((await W.attachPicture(document, box, file)) !== "attached") return { ok: false, note: notes.concat("The QR picture could not be added.").join(" ") };
      return { ok: true, note: notes.join(" ") };
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
