// Reads the posts that are already on screen in a Facebook group page. It only reads: no clicking, scrolling or
// requests. It returns the link and text of each post, plus the group name. It never reads who wrote a post (names
// and profile links are personal data we do not need). The server checks every link again (lib/fb-leads-rules.ts).
(function (root) {
  "use strict";

  var POST_LINK = /\/groups\/[^/]+\/(?:posts|permalink)\/(?:\d+|pfbid[A-Za-z0-9]+)/;
  var MIN_TEXT = 15;
  // Facebook changes its page markup often. These attributes have been stable for years; the last resort is the
  // longest piece of text in the post, outside comments and buttons.
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

  function isTopLevel(article) {
    return !(article.parentElement && article.parentElement.closest('[role="article"]'));
  }

  function postUrl(article, doc) {
    var links = article.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href") || "";
      if (!POST_LINK.test(href) || /[?&](?:reply_)?comment_id=/.test(href)) continue;
      var base = /^https?:\/\//.test(doc.baseURI || "") ? doc.baseURI : "https://www.facebook.com/";
      try { return new URL(href, base).href; } catch { /* next link */ }
    }
    return "";
  }

  function postText(article) {
    var best = "";
    function consider(el) {
      if (el.closest('[role="article"]') !== article) return; // inside a comment
      if (el.closest('a, [role="button"], [role="toolbar"], [role="navigation"]')) return;
      var text = (el.innerText || el.textContent || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
      if (text.length > best.length) best = text;
    }
    var marked = article.querySelectorAll(MESSAGE);
    for (var i = 0; i < marked.length; i++) consider(marked[i]);
    if (best) return best;
    var blocks = article.querySelectorAll('div[dir="auto"]');
    for (var j = 0; j < blocks.length; j++) consider(blocks[j]);
    return best;
  }

  /** The posts on the page now: [{ url, text, groupName }]. Posts without a link or with very little text are left out. */
  function findPosts(doc) {
    var name = groupName(doc), seen = {}, posts = [];
    var articles = doc.querySelectorAll('[role="article"]');
    for (var i = 0; i < articles.length; i++) {
      var article = articles[i];
      if (!isTopLevel(article)) continue;
      var url = postUrl(article, doc), text = postText(article);
      if (!url || text.length < MIN_TEXT || seen[url]) continue;
      seen[url] = true;
      posts.push({ url: url, text: text, groupName: name });
    }
    return posts;
  }

  root.WaydidiLeads = { findPosts: findPosts };
})(typeof window !== "undefined" ? window : globalThis);
