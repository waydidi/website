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

  function postUrl(unit, doc) {
    var links = unit.querySelectorAll("a[href]"), fromComment = "";
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href") || "";
      if (!POST_LINK.test(href)) continue;
      // A comment's link is the post's link plus ?comment_id=…: use it only when the post's own link is missing.
      if (COMMENT.test(href)) { if (!fromComment) fromComment = absolute(href.split("?")[0], doc); continue; }
      var url = absolute(href, doc);
      if (url) return url;
    }
    return fromComment;
  }

  function postText(unit) {
    var best = "";
    function consider(el) {
      if (inComment(el, unit)) return;
      if (el.closest('a, [role="button"], [role="toolbar"], [role="navigation"]')) return;
      var text = (el.innerText || el.textContent || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
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
  function findPosts(doc) {
    var name = groupName(doc), seen = {}, posts = [], list = units(doc);
    for (var i = 0; i < list.length; i++) {
      var url = postUrl(list[i], doc), text = postText(list[i]);
      if (!url || text.length < MIN_TEXT || seen[url]) continue;
      seen[url] = true;
      posts.push({ url: url, text: text, groupName: name });
    }
    return posts;
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

  root.WaydidiLeads = Object.assign(root.WaydidiLeads || {}, { findPosts: findPosts, diagnose: diagnose, sample: sample });
})(typeof window !== "undefined" ? window : globalThis);
