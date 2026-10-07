'use strict';

// Guard recursive walkers before they consume untrusted patterns/ASTs.
// Parent/prev links are intentionally excluded: only nodes are walked by braces.
module.exports = input => {
  if (typeof input === 'string') {
    let depth = 0;
    for (let i = 0; i < input.length; i++) {
      if (input[i] === '\\') { i++; continue; }
      if (input[i] === '{' || input[i] === '(') {
        if (++depth > 100) throw new RangeError('Brace nesting exceeds 100 levels');
      } else if (input[i] === '}' || input[i] === ')') depth = Math.max(0, depth - 1);
    }
    return;
  }
  const pending = [[input, 0]], seen = new WeakSet();
  let count = 0;
  while (pending.length) {
    const [node, depth] = pending.pop();
    if (!node || typeof node !== 'object') continue;
    if (depth > 100 || ++count > 10000 || seen.has(node)) throw new RangeError('Brace AST exceeds safe depth or size');
    seen.add(node);
    if (Array.isArray(node.nodes)) for (const child of node.nodes) pending.push([child, depth + 1]);
  }
};
