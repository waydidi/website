// Scrolls a group feed the way a person reads it, so more posts appear for extractor.js to read. It only scrolls: it
// never clicks, types or opens anything. It starts only when you press "Collect" in the popup, and it always stops:
// after enough posts or time, at the end of the feed, if you touch the page, switch tab or leave the group.
(function (root) {
  "use strict";

  var DEFAULTS = {
    maxPosts: 150,            // posts looked at in one run
    maxLeads: 30,             // posts that look like requests in one run
    maxMs: 12 * 60 * 1000,    // one run never lasts longer than this
    idleSteps: 5,             // this many screens in a row with nothing new = end of the feed
    readMs: [3000, 9000],     // normal pause on a screen, like reading
    longReadMs: [12000, 25000], // now and then a post is read for longer
    longReadChance: 0.12,
    backChance: 0.1,          // now and then scroll back up a little, as people do
  };

  function between(rng, range) { return range[0] + rng() * (range[1] - range[0]); }

  /**
   * options: scan() → Promise<{posts, leads} | null> (null = could not send), win (window), sleep(ms), rng(), now(),
   * onStep(progress), plus any DEFAULTS above. Resolves { reason, posts, leads, steps }.
   * reason: enough | time | end | hidden | left | touched | problem | stopped
   */
  async function collect(options) {
    var o = Object.assign({}, DEFAULTS, options);
    var win = o.win || window, sleep = o.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var rng = o.rng || Math.random, now = o.now || Date.now;
    var stop = "", posts = 0, leads = 0, steps = 0, idle = 0, started = now();
    function halt(reason) { if (!stop) stop = reason; }

    // Anything you do on the page hands control back to you. Our own scrolling fires none of these events.
    var touch = function () { halt("touched"); };
    var events = ["wheel", "keydown", "mousedown", "touchstart"];
    events.forEach(function (e) { win.document.addEventListener(e, touch, true); });
    if (o.signal) o.signal.addEventListener("abort", function () { halt("stopped"); });

    try {
      while (!stop) {
        if (now() - started > o.maxMs) { halt("time"); break; }
        if (win.document.hidden) { halt("hidden"); break; }
        if (win.location.pathname.indexOf("/groups/") !== 0) { halt("left"); break; }

        var seen = await o.scan();
        if (stop) break;
        if (!seen) { halt("problem"); break; }
        posts += seen.posts; leads += seen.leads;
        if (o.onStep) o.onStep({ posts: posts, leads: leads, steps: steps });
        if (leads >= o.maxLeads || posts >= o.maxPosts) { halt("enough"); break; }
        idle = seen.posts === 0 ? idle + 1 : 0;
        if (idle >= o.idleSteps) { halt("end"); break; }

        // Read for a while, then move on: a different distance and pause every time, sometimes back up a little.
        var height = win.innerHeight || 800;
        var back = steps > 0 && rng() < o.backChance;
        var distance = back ? -Math.round(height * (0.1 + rng() * 0.2)) : Math.round(height * (0.4 + rng() * 0.45));
        win.scrollBy({ top: distance, behavior: "smooth" });
        steps++;
        await sleep(rng() < o.longReadChance ? between(rng, o.longReadMs) : between(rng, o.readMs));
      }
    } finally {
      events.forEach(function (e) { win.document.removeEventListener(e, touch, true); });
    }
    return { reason: stop || "stopped", posts: posts, leads: leads, steps: steps };
  }

  root.WaydidiLeads = Object.assign(root.WaydidiLeads || {}, { collect: collect, collectDefaults: DEFAULTS });
})(typeof window !== "undefined" ? window : globalThis);
