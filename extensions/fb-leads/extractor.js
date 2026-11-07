// Reads the posts that are already on screen in a Facebook group page. It only reads: no clicking, scrolling or
// requests. It returns the link and text of each post, plus the group name. It never reads who wrote a post (names
// and profile links are personal data we do not need). The server checks every link again (lib/fb-leads-rules.ts).
(function (root) {
  "use strict";

  var POST_LINK = /\/groups\/[^/?#]+\/(?:posts|permalink)\/(?:\d+|pfbid[A-Za-z0-9]+)/;
  var COMMENT = /[?&](?:reply_)?comment_id=/;
  var MIN_TEXT = 15;
  // Facebook marks a feed post in different ways depending on the version a person is shown: a numbered feed item
  // (aria-posinset), a direct child of the feed, or role="article" (which newer versions use for comments). A post is
  // the outermost of these; anything of these inside it is a comment.
  var UNIT = '[role="feed"] > div, [aria-posinset], [role="article"]';
  // These attributes have been stable for years; the last resort is the longest text in the post, outside comments.
  var MESSAGE = '[data-ad-rendering-role="story_message"], [data-ad-comet-preview="message"], [data-ad-preview="message"]';

  function groupName(doc) {
    // The joined-groups feed mixes many groups; its page title is not a group name (the server uses the group id).
    if (doc.location && /^\/groups\/(?:feed|discover|joins|search|create)(?:\/|$)/.test(doc.location.pathname)) return "";
    var name = (doc.title || "")
      .replace(/^\(\d+\+?\)\s*/, "")
      .replace(/\s*[|–-]\s*Facebook\s*$/i, "")
      .trim();
    return /^facebook$/i.test(name) ? "" : name; // a page that is still loading is titled just "Facebook"
  }

  /** The posts on the page: the outermost feed items (an item inside another one is a comment). */
  function units(doc) {
    var all = doc.querySelectorAll(UNIT), out = [];
    for (var i = 0; i < all.length; i++) {
      var parent = all[i].parentElement && all[i].parentElement.closest(UNIT);
      if (!parent) out.push(all[i]);
    }
    return out;
  }

  /**
   * Inside a comment of this post, not the post itself. Newer layout (numbered feed items): every role="article" in the
   * post is a comment. Older layout: the post is the outermost role="article" and comments are articles inside it.
   */
  function inComment(el, unit) {
    var c = el.closest('[role="article"]');
    if (!c || c === unit || !unit.contains(c)) return false;
    if (unit.matches("[aria-posinset]") || unit.querySelector("[aria-posinset]")) return true;
    var outer = c.parentElement && c.parentElement.closest('[role="article"]');
    return Boolean(outer && (outer === unit || unit.contains(outer)));
  }

  function absolute(href, doc) {
    var base = /^https?:\/\//.test(doc.baseURI || "") ? doc.baseURI : "https://www.facebook.com/";
    try { return new URL(href, base).href; } catch { return ""; }
  }

  /** The group in the page address (/groups/<id or name>/), for links built from a post number. */
  function groupKey(doc) {
    var m = doc.location && /^\/groups\/([A-Za-z0-9._-]+)\/?/.exec(doc.location.pathname);
    return m && !/^(?:feed|discover|joins|search|create)$/.test(m[1]) ? m[1] : "";
  }

  function postUrl(unit, doc) {
    var links = unit.querySelectorAll("a[href]"), fromComment = "", fromPhoto = "";
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href") || "";
      // A photo in a group post links to /photo/?fbid=…&set=gm.<post> (or pcb.<post>): the post number, as a backup.
      var set = /[?&]set=(?:gm|pcb)\.(\d{5,25})(?:&|$)/.exec(href);
      if (set && !fromPhoto && groupKey(doc)) fromPhoto = "https://www.facebook.com/groups/" + groupKey(doc) + "/posts/" + set[1] + "/";
      if (!POST_LINK.test(href)) continue;
      // A comment's link is the post's link plus ?comment_id=…: use it only when the post's own link is missing.
      if (COMMENT.test(href)) { if (!fromComment) fromComment = absolute(href.split("?")[0], doc); continue; }
      var url = absolute(href, doc);
      if (url) return url;
    }
    return fromComment || fromPhoto;
  }

  // Facebook hides a post's link: the time next to the author's name is a link with no address ("?__cft__…") until a
  // mouse moves over it, and then Facebook fills in the real address. These are the links that may be it.
  function hiddenTimeLinks(unit) {
    var name = unit.querySelector('[data-ad-rendering-role="profile_name"]');
    var header = name && name.closest("span[dir]") && name.closest("span[dir]").parentElement;
    var scope = header || unit, out = [];
    var links = scope.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href") || "";
      if (/^(?:\?|#|\/\?)/.test(href) && !links[i].closest(MESSAGE) && !(name && name.contains(links[i]))) out.push(links[i]);
    }
    return out;
  }

  var hovered = typeof WeakSet === "function" ? new WeakSet() : null;
  /**
   * For each post on screen whose link is hidden, moves a simulated mouse over its time link once, so Facebook fills
   * in the address. Only hover events: it never clicks, focuses or scrolls. Returns how many links were hovered
   * (the caller waits a moment before reading the page again).
   */
  function revealLinks(doc) {
    var list = units(doc), count = 0, win = doc.defaultView;
    if (!hovered || !win) return 0;
    for (var i = 0; i < list.length; i++) {
      if (postUrl(list[i], doc) || postText(list[i]).length < MIN_TEXT) continue;
      hiddenTimeLinks(list[i]).forEach(function (a) {
        if (hovered.has(a)) return;
        hovered.add(a);
        count++;
        ["pointerover", "pointerenter", "mouseover", "mouseenter", "mousemove"].forEach(function (type) {
          var Ctor = type.indexOf("pointer") === 0 && win.PointerEvent ? win.PointerEvent : win.MouseEvent;
          a.dispatchEvent(new Ctor(type, { bubbles: type !== "mouseenter" && type !== "pointerenter", cancelable: true, view: win }));
        });
      });
    }
    return count;
  }

  function postText(unit) {
    var best = "";
    function consider(el) {
      if (inComment(el, unit)) return;
      if (el.closest('a, [role="button"], [role="toolbar"], [role="navigation"]')) return;
      var text = (el.innerText || el.textContent || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim()
        .replace(/(?:…|\.\.\.)?\s*(?:See more|ดูเพิ่มเติม|查看更多|显示更多|展开)\s*$/i, "").trim(); // the "See more" button's label
      if (text.length > best.length) best = text;
    }
    var marked = unit.querySelectorAll(MESSAGE);
    for (var i = 0; i < marked.length; i++) consider(marked[i]);
    if (best) return best;
    var blocks = unit.querySelectorAll('div[dir="auto"], span[dir="auto"]');
    for (var j = 0; j < blocks.length; j++) consider(blocks[j]);
    return best;
  }

  /** The posts on the page now: [{ url, text, groupName }]. Posts without a link or with very little text are left out. */
  function findPosts(doc, options) {
    var name = groupName(doc), seen = {}, posts = [], list = units(doc), names = (options && options.names) || [];
    for (var i = 0; i < list.length; i++) {
      var url = postUrl(list[i], doc), text = postText(list[i]);
      if (!url || text.length < MIN_TEXT || seen[url]) continue;
      seen[url] = true;
      var skip = pageSkip(list[i], names), post = { url: url, text: text, groupName: name };
      if (skip) post.skip = skip;
      posts.push(post);
    }
    return posts;
  }

  // The "See more" button at the end of a long post's text (English, Thai, Chinese, Russian, Korean).
  var SEE_MORE = /^(?:see more|ดูเพิ่มเติม|查看更多|显示更多|展开|ещё|еще|показать полностью|더 보기)$/i;
  var expanded = typeof WeakSet === "function" ? new WeakSet() : null;
  /**
   * Owner's choice: during a Collect run, taps the "See more" button inside each post's text once, so the whole post is
   * read (contact details and conditions are often at the end). Only a button inside the message, never a link, so it
   * opens nothing. Returns how many were tapped (the caller waits a moment before reading).
   */
  function expandPosts(doc) {
    var list = units(doc), count = 0;
    if (!expanded) return 0;
    for (var i = 0; i < list.length; i++) {
      var buttons = list[i].querySelectorAll(MESSAGE.split(", ").map(function (m) { return m + ' [role="button"]'; }).join(", ") + ', div[dir="auto"] [role="button"]');
      for (var j = 0; j < buttons.length; j++) {
        var b = buttons[j];
        if (expanded.has(b) || b.closest("a") || inComment(b, list[i]) || !SEE_MORE.test((b.textContent || "").trim())) continue;
        expanded.add(b);
        b.click();
        count++;
        break; // one per post
      }
    }
    return count;
  }

  // Facebook's note when the author or an admin closed the comments (English, Thai, Chinese, Russian, Korean).
  var COMMENTS_OFF = /turned off commenting for this post|commenting has been turned off|ปิดการแสดงความคิดเห็นสำหรับโพสต์นี้|ปิดการแสดงความคิดเห็น|关闭了(?:此帖的)?评论|已关闭评论|отключил[аи]? комментари|댓글 기능을 해제/i;

  /**
   * Why Waydidi should not comment, from the page itself: comments are turned off, or Waydidi already commented (a
   * visible comment by one of the names in Settings) or reacted (the reaction button is already pressed by the account
   * that is browsing). Names are only compared here; they are never sent. Comments hidden behind "View more comments"
   * cannot be seen.
   */
  function pageSkip(unit, names) {
    if (COMMENTS_OFF.test(unit.textContent || "")) return "commenting_disabled";
    var want = names.map(function (n) { return String(n).trim().toLowerCase(); }).filter(Boolean);
    if (want.length) {
      var comments = unit.querySelectorAll('[role="article"]');
      for (var i = 0; i < comments.length; i++) {
        if (comments[i] === unit) continue;
        var label = (comments[i].getAttribute("aria-label") || "").toLowerCase();
        if (want.some(function (n) { return label.indexOf(n) !== -1; })) return "already_engaged";
        var links = comments[i].querySelectorAll("a");
        for (var j = 0; j < links.length; j++) if (want.indexOf((links[j].textContent || "").trim().toLowerCase()) !== -1) return "already_engaged";
      }
    }
    var like = unit.querySelector('[data-ad-rendering-role="like_button"]');
    var button = like && like.closest('[role="button"]');
    if (button && (button.getAttribute("aria-pressed") === "true" || /remove|change|unlike|ยกเลิก|เปลี่ยน|取消|更改|убрать|취소/i.test(button.getAttribute("aria-label") || ""))) return "already_engaged";
    return "";
  }

  /** What the page shows, for the popup when no post can be read: posts on screen, with a post link, with text. */
  function diagnose(doc) {
    var d = { articles: 0, withLink: 0, withText: 0, readable: 0 }, list = units(doc);
    for (var i = 0; i < list.length; i++) {
      d.articles++;
      var link = Boolean(postUrl(list[i], doc)), text = postText(list[i]).length >= MIN_TEXT;
      if (link) d.withLink++;
      if (text) d.withText++;
      if (link && text) d.readable++;
    }
    return d;
  }

  /**
   * An anonymous outline of the feed for the developer, when posts cannot be read: element names, roles and the few
   * attributes the reader uses, link shapes with every number and id replaced, and text replaced by its length.
   * No words, names or ids leave the page.
   */
  function sample(doc) {
    var KEEP = ["role", "aria-posinset", "dir", "data-ad-rendering-role", "data-ad-comet-preview", "data-ad-preview", "data-pagelet"];
    var VALUE = { role: true, dir: true, "data-ad-rendering-role": true, "data-ad-comet-preview": true, "data-ad-preview": true, "data-pagelet": true };
    var lines = [], budget = 1500;
    function shapeHref(h) {
      return h.replace(/^https?:\/\/[^/]+/, "")
        .replace(/pfbid[A-Za-z0-9]+/g, "pfbidX")
        .replace(/\d+/g, "N")
        .replace(/\?.*$/, function (q) { return "?" + q.slice(1).split("&").map(function (kv) { return kv.split("=")[0]; }).join("&"); })
        .replace(/\/groups\/[^/?#]+/, function (g) { return /\/groups\/N$/.test(g) ? g : "/groups/NAME"; })
        .replace(/^\/(?!groups|photo|watch|reel|permalink|story|share|hashtag|profile)[^/?#]+/, "/NAME");
    }
    function walk(el, depth) {
      if (budget-- <= 0 || depth > 40) return;
      var attrs = [];
      KEEP.forEach(function (a) {
        if (el.hasAttribute(a)) attrs.push(VALUE[a] ? a + "=" + String(el.getAttribute(a)).replace(/\d+/g, "N").slice(0, 40) : a);
      });
      if (el.tagName === "A") attrs.push("href=" + shapeHref(el.getAttribute("href") || "(none)"));
      var own = 0;
      for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) own += n.textContent.trim().length;
      var kids = el.children;
      // Plain wrappers with one child and nothing of interest are folded away to keep the outline short.
      if (!attrs.length && !own && kids.length === 1 && el.tagName === "DIV") return walk(kids[0], depth);
      if (el.tagName === "SVG" || el.tagName === "svg" || el.tagName === "IMG" || el.tagName === "VIDEO") { lines.push(new Array(depth + 1).join(" ") + el.tagName.toLowerCase()); return; }
      lines.push(new Array(depth + 1).join(" ") + el.tagName.toLowerCase() + (attrs.length ? " [" + attrs.join(" ") + "]" : "") + (own ? " (text " + own + ")" : ""));
      for (var i = 0; i < kids.length; i++) walk(kids[i], depth + 1);
    }
    var feed = doc.querySelector('[role="feed"]');
    lines.push("page=" + shapeHref(doc.location ? doc.location.pathname : "") + " feed=" + Boolean(feed) + " " + JSON.stringify(diagnose(doc)));
    var list = units(doc).slice(0, 3);
    if (!list.length) list = [feed || doc.querySelector('[role="main"]') || doc.body];
    list.forEach(function (el) { walk(el, 0); lines.push("----"); });
    return lines.join("\n").slice(0, 20000);
  }

  root.WaydidiLeads = Object.assign(root.WaydidiLeads || {}, { findPosts: findPosts, diagnose: diagnose, sample: sample, revealLinks: revealLinks, expandPosts: expandPosts });
})(typeof window !== "undefined" ? window : globalThis);
