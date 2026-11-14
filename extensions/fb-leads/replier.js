// Reply queue helpers for one Facebook post page: find the comment box, put a drafted comment in it, and notice when a
// comment by one of the Waydidi names (Settings) appears. findCommentBox, fillComment and ourComments never press Post,
// Enter or any button on Facebook. submitComment does, and reply.js calls it only for a comment a team member approved
// in Telegram. Pure page functions so the browser tests can run them on a copied page.
(function (root) {
  "use strict";

  var BOX_LABEL = /comment|answer|reply|ความคิดเห็น|ตอบกลับ|评论|回复|留言|комментар|댓글/i;

  function norm(s) { return String(s || "").replace(/\s+/g, " ").trim().toLowerCase(); }
  function shown(el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }

  /** The first visible comment box on the page (Facebook's editor: a contenteditable textbox labelled "Comment…"). */
  function findCommentBox(doc) {
    var boxes = doc.querySelectorAll('[contenteditable="true"]');
    for (var i = 0; i < boxes.length; i++) {
      var el = boxes[i], label = (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("aria-placeholder") || "") + " " + (el.getAttribute("data-placeholder") || "");
      if (el.getAttribute("role") === "textbox" && BOX_LABEL.test(label) && shown(el)) return el;
    }
    return null;
  }

  /**
   * Puts the text in the box as a paste (Facebook's editor takes pastes like typed text, and a paste never sends the
   * comment). If the editor ignored the paste, the text is inserted with line breaks turned into spaces, because a
   * typed line break can send a comment. Never fills a box that already has text. Resolves "filled", "busy" or "failed".
   */
  function fillComment(doc, box, text) {
    if (norm(box.textContent)) return "busy";
    box.focus();
    try {
      var data = new DataTransfer();
      data.setData("text/plain", text);
      box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    } catch { /* no paste support: insert below */ }
    if (!norm(box.textContent)) {
      try { doc.execCommand("insertText", false, String(text).replace(/\s*\n+\s*/g, " ")); } catch { /* reported below */ }
    }
    var want = norm(text).slice(0, 20);
    return want && norm(box.textContent).indexOf(want) !== -1 ? "filled" : "failed";
  }

  /**
   * How many comments on the page are by one of the names. Only innermost articles count (a post's own article holds
   * every comment under it) and never the one holding the comment box, so the draft in the box is not counted.
   */
  function ourComments(doc, names, box) {
    var want = (names || []).map(function (n) { return norm(n); }).filter(Boolean), count = 0;
    if (!want.length) return 0;
    var list = doc.querySelectorAll('[role="article"]');
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.querySelector('[role="article"]') || (box && c.contains(box))) continue;
      var label = norm(c.getAttribute("aria-label"));
      var mine = want.some(function (n) { return label.indexOf(n) !== -1; });
      if (!mine) {
        var links = c.querySelectorAll("a");
        for (var j = 0; j < links.length && !mine; j++) mine = want.indexOf(norm(links[j].textContent)) !== -1;
      }
      if (mine) count++;
    }
    return count;
  }

  var SEND_LABEL = /^(comment|post|post comment|send|reply|แสดงความคิดเห็น|ความคิดเห็น|ส่ง|โพสต์|ตอบกลับ|评论|发布|发送|回复|留言)$/i;

  /**
   * Only for a comment a team member approved in Telegram ("Post to Facebook"): presses the send button next to this
   * comment box, or, when there is none, Enter in the box (Facebook sends a comment on Enter). It looks only inside the
   * box's own composer (a few levels up), never elsewhere on the page. Resolves "button", "enter" or "none".
   */
  function submitComment(doc, box) {
    var scope = box;
    // Up to 5 levels, and never past the post (or comment) the box belongs to.
    for (var up = 0; up < 5 && scope.parentElement && scope.getAttribute("role") !== "article"; up++) {
      scope = scope.parentElement;
      var buttons = scope.querySelectorAll('[role="button"][aria-label], button[aria-label]');
      for (var i = 0; i < buttons.length; i++) {
        var b = buttons[i];
        if (SEND_LABEL.test((b.getAttribute("aria-label") || "").trim()) && b.getAttribute("aria-disabled") !== "true" && !b.disabled && shown(b)) { b.click(); return "button"; }
      }
    }
    if (!norm(box.textContent)) return "none";
    box.focus();
    ["keydown", "keypress", "keyup"].forEach(function (type) {
      box.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    });
    return "enter";
  }

  root.WaydidiLeads = Object.assign(root.WaydidiLeads || {}, { findCommentBox: findCommentBox, fillComment: fillComment, ourComments: ourComments, submitComment: submitComment });
})(typeof window !== "undefined" ? window : globalThis);
