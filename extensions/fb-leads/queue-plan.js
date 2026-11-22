// The reply queue's group order (pure, no Chrome calls, so it is tested on its own). The popup keeps a list of the
// Facebook groups in the order chosen, each ticked or not, and how many comments to post in a group before switching.
// background.js turns that into a plan and walks it: the first ticked group until `per` comments are posted there (or it
// has none left), then the next, and after the last back to the first.
(function (root) {
  "use strict";
  var PER_MIN = 1, PER_MAX = 50, PER_DEFAULT = 10;

  function perOf(value) {
    var n = parseInt(value, 10);
    return Number.isFinite(n) ? Math.min(PER_MAX, Math.max(PER_MIN, n)) : PER_DEFAULT;
  }

  /**
   * The popup's saved list merged with the groups that have comments waiting now: saved groups keep their place and
   * tick; a group not seen before is added at the end, ticked. Each row: { key, name, on, waiting, keys }. A Facebook
   * group can have two addresses (its name and its number): the website sends them together as one group ("keys"), and
   * a saved row under either address is that group, so two saved rows of the same group become one.
   */
  function mergeGroups(saved, waiting) {
    var byKey = {}, out = [], seen = {};
    (waiting || []).forEach(function (g) {
      if (!g || typeof g.key !== "string") return;
      var keys = Array.isArray(g.keys) && g.keys.length ? g.keys : [g.key];
      keys.forEach(function (k) { byKey[k] = { key: g.key, name: g.name || g.key, waiting: g.waiting || 0, keys: keys }; });
    });
    function add(row, on) {
      if (seen[row.key]) return;
      row.keys.forEach(function (k) { seen[k] = true; });
      seen[row.key] = true;
      out.push({ key: row.key, name: row.name, on: on, waiting: row.waiting, keys: row.keys });
    }
    (saved || []).forEach(function (g) {
      if (!g || typeof g.key !== "string") return;
      var live = byKey[g.key];
      add(live || { key: g.key, name: g.name || g.key, waiting: 0, keys: Array.isArray(g.keys) && g.keys.length ? g.keys : [g.key] }, g.on !== false);
    });
    (waiting || []).forEach(function (g) { if (g && byKey[g.key]) add(byKey[g.key], true); });
    return out;
  }

  /** What identifies a plan: the ticked groups in order and the number per group. Changing either starts again. */
  function signature(groups, per) {
    return groups.map(function (g) { return g.key; }).join("|") + "#" + per;
  }

  /**
   * A plan from the popup's settings. Pressing Start again with the same groups and number carries on where the last
   * run stopped (same group, same count); anything changed starts from the first group.
   */
  function makePlan(settings, previous) {
    var groups = ((settings && settings.groups) || []).filter(function (g) { return g && g.on !== false && typeof g.key === "string"; })
      .map(function (g) { return { key: g.key, name: g.name || g.key, keys: Array.isArray(g.keys) && g.keys.length ? g.keys.slice(0, 10) : [g.key] }; });
    var per = perOf(settings && settings.per), sig = signature(groups, per);
    if (previous && previous.sig === sig && previous.at < groups.length) return Object.assign({}, previous, { groups: groups });
    return { groups: groups, per: per, at: 0, count: 0, round: 1, sig: sig };
  }

  /** The next group: count back to 0, and a new round after the last group. */
  function nextGroup(plan) {
    var at = plan.at + 1, wrap = at >= plan.groups.length;
    return Object.assign({}, plan, { at: wrap ? 0 : at, count: 0, round: plan.round + (wrap ? 1 : 0) });
  }

  /** A comment was posted in the current group: count it, and switch once the group has had its number. */
  function afterPosted(plan) {
    var counted = Object.assign({}, plan, { count: plan.count + 1 });
    return counted.count >= plan.per ? nextGroup(counted) : counted;
  }

  function current(plan) { return plan && plan.groups.length ? plan.groups[plan.at] : null; }

  /** "Round 1 · Khao Lak Community 3 of 10" */
  function describe(plan) {
    var g = current(plan);
    return g ? "Round " + plan.round + " · " + g.name + " " + plan.count + " of " + plan.per : "";
  }

  root.WaydidiPlan = { perOf: perOf, mergeGroups: mergeGroups, makePlan: makePlan, nextGroup: nextGroup, afterPosted: afterPosted, current: current, describe: describe, PER_DEFAULT: PER_DEFAULT };
})(typeof self !== "undefined" ? self : globalThis);
