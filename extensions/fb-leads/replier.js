// Reply queue helpers for one Facebook post page: find the comment box, put a drafted comment in it, and notice when a
// comment by one of the Waydidi names (Settings) appears. tagName turns the page's name into a real tag (it clicks
// Facebook's suggestion), attachPicture adds the QR picture to a sales comment, likePost presses the post's own Like
// button (the popup's "Like the post first"). None of these press Post, Enter or send. submitComment does, and reply.js calls it only for a comment a team member approved in Telegram. Pure page
// functions so the browser tests can run them on a copied page.
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
   * Puts the text in the box once, as a paste (Facebook's editor takes pastes like typed text, and a paste never sends
   * the comment). Facebook's editor takes the paste (it cancels the browser's own handling) but writes the text into
   * the box a moment later, so an empty box right after the paste does not mean it was ignored: the text is typed in
   * only when no editor took the paste, with line breaks turned into spaces because a typed line break can send a
   * comment. Never both. Then waits up to 2 seconds for the text to show. Never fills a box that already has text.
   * Resolves "filled", "busy" or "failed".
   */
  function fillComment(doc, box, text) {
    if (norm(box.textContent)) return Promise.resolve("busy");
    box.focus();
    var taken = false;
    try {
      var data = new DataTransfer();
      data.setData("text/plain", text);
      var paste = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
      box.dispatchEvent(paste);
      taken = paste.defaultPrevented;
    } catch { /* no paste support: typed in below */ }
    if (!taken && !norm(box.textContent)) {
      try { doc.execCommand("insertText", false, String(text).replace(/\s*\n+\s*/g, " ")); } catch { /* reported below */ }
    }
    var want = norm(text).slice(0, 20), tries = 0;
    return new Promise(function (resolve) {
      (function check() {
        if (want && norm(box.textContent).indexOf(want) !== -1) return resolve("filled");
        if (++tries > 20) return resolve("failed");
        setTimeout(check, 100);
      })();
    });
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

  /** Letters and digits only (emoji, punctuation and spaces dropped): Facebook shows emoji as pictures with no text. */
  function letters(s) { return String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); }

  /**
   * How many comments on the page start with the same words as `text` (its first 30 letters and digits), by anyone.
   * This notices a posted comment whatever Facebook name it was posted under. Only innermost articles count, and never
   * one holding a comment box (the draft still waiting in the box is not a posted comment).
   */
  function commentsLike(doc, text) {
    var want = letters(text).slice(0, 30), count = 0;
    if (want.length < 15) return 0;
    var list = doc.querySelectorAll('[role="article"]');
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.querySelector('[role="article"]') || c.querySelector('[contenteditable="true"]')) continue;
      if (letters(c.textContent).indexOf(want) !== -1) count++;
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

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /** The text node and offset where `name` first appears in the box (case does not matter), or null. */
  function findText(box, name) {
    var want = name.toLowerCase(), walker = box.ownerDocument.createTreeWalker(box, NodeFilter.SHOW_TEXT), node;
    while ((node = walker.nextNode())) {
      var at = (node.nodeValue || "").toLowerCase().indexOf(want);
      if (at !== -1) return { node: node, at: at };
    }
    return null;
  }
  function selectText(doc, box, hit, length) {
    box.focus();
    var range = doc.createRange();
    range.setStart(hit.node, hit.at);
    range.setEnd(hit.node, hit.at + length);
    var sel = doc.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /**
   * Turns the page's name in the comment (for example "Waydidi Travel") into a real Facebook tag, the way a person does
   * it: the name is replaced by "@" and the name typed in, then the matching suggestion in Facebook's list is clicked
   * (a suggestion, never Post). If no suggestion appears within 4 seconds, the plain name is put back. Only the first
   * time the name appears. "tagged" is reported only once the "@" is really gone (Facebook turned it into a tag).
   * Resolves "tagged", "absent" (the name is not in the comment), "no_suggestion" or "not_selected" (Facebook showed
   * the suggestion but did not take the press; the plain name is put back).
   */
  async function tagName(doc, box, name) {
    name = String(name || "").trim();
    var hit = name && findText(box, name);
    if (!hit) return "absent";
    selectText(doc, box, hit, name.length);
    await wait(150); // the editor follows the selection a moment later
    doc.execCommand("insertText", false, "@" + name);
    var tagged = function () { return !findText(box, "@" + name); }; // Facebook removes the "@" once a tag is chosen
    var seen = false;
    for (var t = 0; t < 20 && !tagged(); t++) {
      await wait(200);
      var option = suggestion(doc, name);
      if (!option) continue;
      seen = true;
      // Facebook's list ignores a bare click: press it the way a mouse does, on the spot where it is drawn.
      press(doc, option);
      await wait(400);
      if (tagged()) return "tagged";
      // Still not chosen while the list is open: Tab chooses the highlighted suggestion (unlike Enter, Tab can never
      // send the comment if the list has just closed).
      if (suggestion(doc, name)) { key(box, "Tab", 9); await wait(400); }
      if (tagged()) return "tagged";
    }
    if (tagged()) return "tagged";
    // Not chosen: put the plain name back where "@name" was typed.
    var typed = findText(box, "@" + name);
    if (typed) { selectText(doc, box, typed, name.length + 1); await wait(150); doc.execCommand("insertText", false, name); }
    return seen ? "not_selected" : "no_suggestion";
  }

  /** A visible suggestion in Facebook's list whose text has the name, or null. */
  function suggestion(doc, name) {
    var list = doc.querySelectorAll('[role="option"], [role="listbox"] li, [role="menuitem"]');
    for (var i = 0; i < list.length; i++) if (shown(list[i]) && norm(list[i].textContent).indexOf(norm(name)) !== -1) return list[i];
    return null;
  }
  /** Mouse-like press on the middle of an element: pointer and mouse down and up, then click, with coordinates. */
  function press(doc, el) {
    var r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    var target = doc.elementFromPoint(x, y);
    if (!target || !el.contains(target)) target = el;
    var at = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, view: doc.defaultView };
    ["pointerover", "pointerenter", "mouseover", "pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(function (type) {
      var Ev = type.indexOf("pointer") === 0 && typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
      target.dispatchEvent(new Ev(type, Object.assign({ pointerType: "mouse", isPrimary: true, buttons: /down/.test(type) ? 1 : 0 }, at)));
    });
  }
  function key(el, name, code) {
    ["keydown", "keyup"].forEach(function (type) { el.dispatchEvent(new KeyboardEvent(type, { key: name, code: name, keyCode: code, which: code, bubbles: true, cancelable: true })); });
  }

  var LIKE_LABEL = /^(like|ถูกใจ|赞|讚|нравится|좋아요)$/i;
  var LIKED_LABEL = /remove|change|unlike|ยกเลิก|เปลี่ยน|取消|更改|убрать|취소/i;
  /**
   * The post's own Like button: Facebook's like_button marker inside the post the comment box belongs to (or the only
   * post on the page), else a button labelled "Like" in that post but never inside a comment under it. Or null.
   */
  function likeButton(doc, box) {
    var post = box;
    while (post.parentElement && post.getAttribute("role") !== "article") post = post.parentElement;
    var marked = post.querySelector('[data-ad-rendering-role="like_button"]') || doc.querySelector('[data-ad-rendering-role="like_button"]');
    if (marked) return marked.closest('[role="button"]') || marked;
    var buttons = post.querySelectorAll('[role="button"][aria-label], button[aria-label]');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i], inComment = b.parentElement && b.parentElement.closest('[role="article"]');
      if (inComment && inComment !== post) continue;
      if (LIKE_LABEL.test((b.getAttribute("aria-label") || "").trim()) && shown(b)) return b;
    }
    return null;
  }
  function liked(button) { return button.getAttribute("aria-pressed") === "true" || LIKED_LABEL.test(button.getAttribute("aria-label") || ""); }

  /**
   * Likes the post (the post itself, never a comment), the way a mouse does. Not pressed again when it is already
   * liked. Never presses Post or send. Resolves "liked", "already", "none" (no Like button found) or "not_taken".
   */
  async function likePost(doc, box) {
    var button = likeButton(doc, box);
    if (!button) return "none";
    if (liked(button)) return "already";
    press(doc, button);
    for (var t = 0; t < 10; t++) {
      await wait(200);
      var now = likeButton(doc, box) || button; // Facebook may redraw the button
      if (liked(now)) return "liked";
    }
    return "not_taken";
  }

  /** A sales comment: it gives Waydidi's WhatsApp number (the word WhatsApp and a phone number). */
  function isSalesComment(text) {
    return /whats\s?app/i.test(text || "") && /\+?\d[\d\s-]{7,}\d/.test(text || "");
  }

  /**
   * Adds a picture to the comment being written, as a person does with the photo button: the file is given to the
   * comment's own photo input (inside the same post), or pasted into the box when there is none. Waits up to 10
   * seconds for Facebook's preview of the picture. Never presses Post. Resolves "attached" or "failed".
   */
  async function attachPicture(doc, box, file) {
    var scope = box;
    while (scope.parentElement && scope.getAttribute("role") !== "article") scope = scope.parentElement;
    var previews = function () { return scope.querySelectorAll('img[src^="blob:"], img[src^="data:image"]').length; };
    var before = previews(), data = new DataTransfer();
    data.items.add(file);
    var input = scope.querySelector('input[type="file"][accept*="image"]') || scope.querySelector('input[type="file"]');
    if (input) {
      input.files = data.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      box.focus();
      box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }
    for (var t = 0; t < 50; t++) {
      if (previews() > before) return "attached";
      await wait(200);
    }
    return "failed";
  }

  root.WaydidiLeads = Object.assign(root.WaydidiLeads || {}, { findCommentBox: findCommentBox, fillComment: fillComment, ourComments: ourComments, commentsLike: commentsLike, submitComment: submitComment, tagName: tagName, isSalesComment: isSalesComment, attachPicture: attachPicture, likePost: likePost });
})(typeof window !== "undefined" ? window : globalThis);
