// Scrolls a group feed the way a person reads it, so more posts appear for extractor.js to read. It only scrolls: it
// never clicks, types or opens anything. It starts only when you press "Collect" in the popup, and it always stops:
// at your target number of lead posts, at the end of the feed, or if you touch the page, switch tab, leave the group,
// or no post on the page can be read. There is no time limit unless one is given.
(function (root) {
  "use strict";

  var DEFAULTS = {
    maxLeads: 50,             // lead posts to collect in one run (the popup's "Lead posts to collect"); ignored posts do not count
    maxPosts: 1000,           // safety stop: new posts looked at in one run, leads or not
    maxMs: Infinity,          // no time limit by default: a run goes until it has its leads
    maxSteps: 1500,           // safety stop: screens scrolled in one run
    stuckSteps: 3,            // this many scrolls in a row where the page neither moves nor grows = end of the feed
    blankSteps: 4,            // this many screens in a row with no readable post at all = we cannot read this page
    readMs: [3000, 9000],     // normal pause on a screen, like reading
    longReadMs: [12000, 25000], // now and then a post is read for longer
    longReadChance: 0.12,
    backChance: 0.1,          // now and then scroll back up a little, as people do
  };

  function between(rng, range) { return range[0] + rng() * (range[1] - range[0]); }

  /**
   * options: scan() → Promise<{posts, leads, visible} | null> (posts = new posts sent, visible = posts readable on screen
   * including ones sent before; null = could not send), win (window), sleep(ms), rng(), now(), signal, onStep(progress),
   * plus any DEFAULTS above. Resolves { reason, posts, leads, steps }.
   * reason: enough (lead target) | looked (safety stop on posts) | end | time | steps | unreadable | hidden | left |
   * touched | problem | stopped
   */
  async function collect(options) {
    // Options left undefined keep their default (so a missing value never switches a limit off).
    var o = Object.assign({}, DEFAULTS);
    Object.keys(options || {}).forEach(function (k) { if (options[k] !== undefined) o[k] = options[k]; });
    var win = o.win || window, doc = win.document;
    var sleep = o.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var rng = o.rng || Math.random, now = o.now || Date.now;
    var stop = "", posts = 0, leads = 0, steps = 0, started = now(), stuck = 0, blank = 0, everRead = false;
    var lastY = win.scrollY || 0, lastH = doc.documentElement.scrollHeight;
    function halt(reason) { if (!stop) stop = reason; }

    // Anything you do on the page hands control back to you. Our own scrolling fires none of these events.
    var touch = function () { halt("touched"); };
    var events = ["wheel", "keydown", "mousedown", "touchstart"];
    events.forEach(function (e) { doc.addEventListener(e, touch, true); });
    if (o.signal) o.signal.addEventListener("abort", function () { halt("stopped"); });

    try {
      while (!stop) {
        if (now() - started > o.maxMs) { halt("time"); break; }
        if (steps >= o.maxSteps) { halt("steps"); break; }
        if (doc.hidden) { halt("hidden"); break; }
        if (win.location.pathname.indexOf("/groups/") !== 0) { halt("left"); break; }

        var seen = await o.scan();
        if (stop) break;
        if (!seen) { halt("problem"); break; }
        posts += seen.posts; leads += seen.leads;
        if (o.onStep) o.onStep({ posts: posts, leads: leads, steps: steps });
        if (leads >= o.maxLeads) { halt("enough"); break; }
        if (posts >= o.maxPosts) { halt("looked"); break; }

        // Posts already sent earlier still count as "readable": scrolling past them to reach new ones is the job.
        if (seen.visible > 0) { everRead = true; blank = 0; } else if (!everRead) blank++;
        if (blank >= o.blankSteps) { halt("unreadable"); break; }

        // Read for a while, then move on: a different distance and pause every time, sometimes back up a little.
        var height = win.innerHeight || 800;
        var back = steps > 0 && rng() < o.backChance;
        var distance = back ? -Math.round(height * (0.1 + rng() * 0.2)) : Math.round(height * (0.4 + rng() * 0.45));
        win.scrollBy({ top: distance, behavior: "smooth" });
        steps++;
        await sleep(rng() < o.longReadChance ? between(rng, o.longReadMs) : between(rng, o.readMs));

        // The end of the feed is when the page stops moving and stops growing, not when there is nothing new to send.
        var y = win.scrollY || 0, h = doc.documentElement.scrollHeight;
        if (!back) stuck = y <= lastY + 5 && h <= lastH + 5 ? stuck + 1 : 0;
        lastY = y; lastH = h;
        if (stuck >= o.stuckSteps) { halt(everRead ? "end" : "unreadable"); break; }
      }
    } finally {
      events.forEach(function (e) { doc.removeEventListener(e, touch, true); });
    }
    return { reason: stop || "stopped", posts: posts, leads: leads, steps: steps };
  }

  root.WaydidiLeads = Object.assign(root.WaydidiLeads || {}, { collect: collect, collectDefaults: DEFAULTS });
})(typeof window !== "undefined" ? window : globalThis);
