// Runs inside the Facebook page itself ("MAIN" world), because only there can the page's own data be read; it has no
// extension permissions and sends nothing anywhere. When extractor.js asks ("waydidi:reveal"), it looks for each post
// whose time link Facebook keeps hidden ("?__cft__…") and searches the page's data for that post's address, never
// further up than the post itself (so it cannot pick up another post's address). If found, it marks the link with
// data-waydidi-href, which extractor.js reads. Nothing else on the page is changed.
(function () {
  "use strict";

  var POST_LINK = /(?:https:\/\/(?:www|web|m)\.facebook\.com)?\/groups\/[^/?#"\s\\]+\/(?:posts|permalink)\/(?:\d+|pfbid[A-Za-z0-9]+)\/?/;
  var ID_KEYS = { post_id: true, postID: true, postId: true, top_level_post_id: true };

  function groupKey() {
    var m = /^\/groups\/([A-Za-z0-9._-]+)/.exec(location.pathname);
    return m && !/^(?:feed|discover|joins|search|create)$/.test(m[1]) ? m[1] : "";
  }
  function internal(el, prefix) {
    for (var k in el) if (k.indexOf(prefix) === 0) return el[k];
    return null;
  }

  /** A post address in a value of the page's data: a /groups/…/posts/… string, or a post id under a known key. */
  function search(value, depth, budget) {
    if (value === null || value === undefined || budget.n-- <= 0) return "";
    if (typeof value === "string") { var m = POST_LINK.exec(value); return m ? m[0] : ""; }
    if (typeof value !== "object" || depth > 4 || value.nodeType || value.$$typeof) return "";
    var keys;
    try { keys = Object.keys(value); } catch { return ""; }
    for (var i = 0; i < keys.length && budget.n > 0; i++) {
      var k = keys[i];
      if (k === "children" || k.charAt(0) === "_") continue;
      var v;
      try { v = value[k]; } catch { continue; }
      if (ID_KEYS[k] && /^\d{6,25}$/.test(String(v)) && groupKey()) return "/groups/" + groupKey() + "/posts/" + v + "/";
      var found = search(v, depth + 1, budget);
      if (found) return found;
    }
    return "";
  }

  // The post's own element: the walk up the page's data stops there, so it never reads the feed's list of other posts.
  var POST_BOUNDARY = '[aria-posinset], [role="feed"] > div';

  function addressFor(link) {
    var budget = { n: 3000 };
    var found = search(internal(link, "__reactProps$"), 0, budget);
    if (found) return found;
    var fiber = internal(link, "__reactFiber$") || internal(link, "__reactInternalInstance$");
    for (var level = 0; fiber && level < 60; level++, fiber = fiber.return) {
      var node = fiber.stateNode, element = node && node.nodeType === 1 ? node : null;
      if (element && element.matches('[role="feed"]')) break; // the feed itself: never
      found = search(fiber.memoizedProps, 0, budget);
      if (found) return found;
      if (element && element.matches(POST_BOUNDARY)) break; // reached the post: stop
    }
    return "";
  }

  function reveal() {
    var links = document.querySelectorAll('[aria-posinset] a[href], [role="feed"] > div a[href], [role="article"] a[href]');
    var done = 0;
    for (var i = 0; i < links.length && done < 60; i++) {
      var a = links[i], href = a.getAttribute("href") || "";
      if (a.hasAttribute("data-waydidi-href") || !/^(?:\?|#|\/\?)/.test(href)) continue;
      done++;
      var url = addressFor(a);
      if (url) a.setAttribute("data-waydidi-href", url.indexOf("http") === 0 ? url : "https://www.facebook.com" + url);
    }
  }

  document.addEventListener("waydidi:reveal", function () { try { reveal(); } catch { /* never break the page */ } });
})();
