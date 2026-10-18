'use strict';

// A deliberately small LaTeXML MathML adapter, not a TeX parser. Recognition
// requires publisher-provided unit semantics and a validated SI token. Unknown
// structures are left to the normal math renderer/fallback without mutation.
const RULE_VERSION = 'latexml-simple-si-unit/v1';
const SI_UNITS = new Set([
  'm', 's', 'A', 'K', 'mol', 'cd', 'g', 'kg',
  'rad', 'sr', 'Hz', 'N', 'Pa', 'J', 'W', 'C', 'V', 'F',
  'Ω', 'Ω', 'S', 'Wb', 'T', 'H', '°C', 'lm', 'lx', 'Bq', 'Gy', 'Sv', 'kat'
]);
// SI prefixes (including the source's two Unicode spellings of micro).
const PREFIXES = ['da', 'Q', 'R', 'Y', 'Z', 'E', 'P', 'T', 'G', 'M', 'k', 'h', 'd', 'c', 'm', 'µ', 'μ', 'n', 'p', 'f', 'a', 'z', 'y', 'r', 'q'];
const DECIMAL = /^[+\-−]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const BLANK = /^[\s\u00a0\u2009\u202f]*$/u;
const ZERO_JOIN = /^\u200b$/u;
const tag = node => (node?.localName || node?.tagName || '').toLowerCase();
const children = node => {
  const result = [];
  for (const child of node.childNodes || []) {
    if (child.nodeType === 1) result.push(child);
    else if (child.nodeType !== 3 || !BLANK.test(child.textContent)) return null;
  }
  return result;
};
const failure = reason => ({ result: null, reason, ruleVersion: RULE_VERSION });
function validUnit(token) {
  if (SI_UNITS.has(token)) return true;
  return PREFIXES.some(prefix => token.startsWith(prefix) &&
    SI_UNITS.has(token.slice(prefix.length)) && token.slice(prefix.length) !== 'kg');
}
function unitText(node) {
  if (!node?.classList?.contains('ltx_unit')) return null;
  if (node.getAttribute('mathvariant') && node.getAttribute('mathvariant') !== 'normal') return null;
  const type = tag(node);
  let token = '';
  if (type === 'mi') {
    if ([...node.children].length) return null;
    token = node.textContent;
  } else if (type === 'mrow') {
    const parts = children(node);
    // LaTeXML's split prefix+unit form uses ZERO WIDTH SPACE, not
    // INVISIBLE TIMES (U+2062). Never reinterpret a product as a prefix.
    if (parts?.length !== 3 || tag(parts[0]) !== 'mi' || tag(parts[1]) !== 'mo' ||
        tag(parts[2]) !== 'mi' || !ZERO_JOIN.test(parts[1].textContent) ||
        !PREFIXES.includes(parts[0].textContent) || !SI_UNITS.has(parts[2].textContent) ||
        parts[2].textContent === 'kg') return null;
    for (const part of parts) {
      if ([...part.children].length) return null;
      if (part.getAttribute('mathvariant') && part.getAttribute('mathvariant') !== 'normal') return null;
    }
    token = parts[0].textContent + parts[2].textContent;
  } else return null;
  return validUnit(token) ? token : null;
}
function inspect(mathNode) {
  if (tag(mathNode) !== 'math') return failure('not-math');
  let nodes = children(mathNode);
  if (nodes?.length !== 1) return failure('unsupported-math-structure');
  let presentation = nodes[0];
  if (tag(presentation) === 'semantics') {
    nodes = children(presentation);
    if (!nodes?.length || nodes.slice(1).some(node => tag(node) !== 'annotation')) return failure('unsupported-semantics');
    presentation = nodes[0];
  }
  let unit = unitText(presentation);
  if (unit) return {result: {text: unit, unit, quantity: null, ruleVersion: RULE_VERSION}, reason: null, ruleVersion: RULE_VERSION};
  if (tag(presentation) !== 'mrow' || presentation.classList.contains('ltx_unit')) return failure('unsupported-unit-or-expression');
  nodes = children(presentation);
  if (!nodes || (nodes.length !== 2 && nodes.length !== 3)) return failure('unsupported-quantity-structure');
  const number = nodes[0];
  if (tag(number) !== 'mn' || [...number.children].length || !DECIMAL.test(number.textContent)) return failure('not-simple-decimal-quantity');
  if (nodes.length === 3 && (tag(nodes[1]) !== 'mtext' || [...nodes[1].children].length || !BLANK.test(nodes[1].textContent))) return failure('unsupported-number-unit-separator');
  unit = unitText(nodes.at(-1));
  if (!unit) return failure('unit-not-semantically-marked-or-unsupported');
  const quantity = number.textContent;
  return {result: {text: `${quantity}\u2009${unit}`, quantity, unit, ruleVersion: RULE_VERSION}, reason: null, ruleVersion: RULE_VERSION};
}
function normalize(mathNode) { return inspect(mathNode).result; }
module.exports = { normalize, inspect, RULE_VERSION };
