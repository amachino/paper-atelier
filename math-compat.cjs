'use strict';

/*
 * Deliberately small, read-only LaTeXML compatibility recognizer.
 * This is not a TeX parser. It requires BOTH a complete, closed TeX grammar
 * and an independently matching MathML shape. No paper names, IDs, or corpus
 * strings participate in recognition. See README.md for the exact grammar.
 */
const VERSION = 'latexml-quantity-compat/v1';
const RULES = Object.freeze({
  dollars: 'latexml-redundant-quantity-delimiters/v1',
  degree: 'latexml-semantic-degree-macro/v1',
});
const GREEK = Object.freeze({
  alpha:'α', beta:'β', gamma:'γ', delta:'δ', zeta:'ζ', eta:'η',
  theta:'θ', iota:'ι', kappa:'κ', lambda:'λ', mu:'μ', nu:'ν',
  xi:'ξ', pi:'π', rho:'ρ', sigma:'σ', tau:'τ', upsilon:'υ',
  phi:'ϕ', chi:'χ', psi:'ψ', omega:'ω',
  Gamma:'Γ', Delta:'Δ', Theta:'Θ', Lambda:'Λ', Xi:'Ξ', Pi:'Π',
  Sigma:'Σ', Upsilon:'Υ', Phi:'Φ', Psi:'Ψ', Omega:'Ω',
});
const DECIMAL = '[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)';
const QUANTITY = new RegExp(`^(${DECIMAL})\\\\text\\{\\\\,\\}\\\\mathrm\\{([A-Za-zµμΩΩ°]+)\\}$`, 'u');
const DEGREE = new RegExp(`^(${DECIMAL})\\\\text\\{\\\\,\\}\\\\mathrm\\{\\\\SIUnitSymbolDegree\\}$`);
const LABEL = /^([A-Za-z]|\\[A-Za-z]+)(?:_\{(?:\\mathrm\{([A-Za-z]+)\}|([A-Za-z0-9]))\})?=$/;
const BLANK = /^[\s\u00a0\u2009\u202f]*$/u;
const tag = node => (node?.localName || node?.tagName || '').toLowerCase();

function children(node) {
  const result = [];
  for (const child of node?.childNodes || []) {
    if (child.nodeType === 1) result.push(child);
    else if (child.nodeType !== 3 || !BLANK.test(child.textContent)) return null;
  }
  return result;
}
function fail(reason) { return {result:null, reason, version:VERSION}; }
function flatText(node, expectedTag, expectedText) {
  return tag(node) === expectedTag && [...node.children].length === 0 &&
    node.textContent === expectedText;
}
function ordinaryVariant(node, allowed = ['normal']) {
  const variant = node?.getAttribute('mathvariant');
  return !variant || allowed.includes(variant);
}
function parsePrefix(prefix) {
  if (prefix === '') return {kind:'quantity'};
  if (prefix === '\\pm' || prefix === '\\mp') return {kind:'sign', sign:prefix === '\\pm' ? '±' : '∓'};
  const match = LABEL.exec(prefix);
  if (!match) return null;
  const symbol = match[1];
  const greek = symbol.startsWith('\\') ? symbol.slice(1) : null;
  if (greek && !Object.hasOwn(GREEK, greek)) return null;
  const letter = greek ? GREEK[greek] : symbol;
  const subscript = match[2] || match[3] || null;
  // A bare alphabetic subscript is italic; a roman subscript is upright.
  const subscriptKind = match[2] ? 'roman' : match[3] ? (/^[0-9]$/.test(match[3]) ? 'number' : 'italic') : null;
  return {kind:'assignment', letter, symbol, greek, subscript, subscriptKind};
}
function matchLabel(node, prefix) {
  let base = node;
  if (prefix.subscript) {
    const parts = children(node);
    if (tag(node) !== 'msub' || !parts || parts.length !== 2) return false;
    [base] = parts;
    const sub = parts[1];
    if (prefix.subscriptKind === 'number') {
      if (!flatText(sub, 'mn', prefix.subscript) || !ordinaryVariant(sub)) return false;
    } else if (prefix.subscriptKind === 'italic') {
      if (!flatText(sub, 'mi', prefix.subscript) || !ordinaryVariant(sub, ['italic'])) return false;
    } else {
      if (!flatText(sub, 'mi', prefix.subscript) || !ordinaryVariant(sub)) return false;
      // Some LaTeXML exports omit an explicit variant for roman subscripts.
      // Reject a conflicting explicit variant; preserve the TeX's styling.
    }
  }
  if (!flatText(base, 'mi', prefix.letter)) return false;
  const uppercaseGreek = prefix.greek && /^[A-Z]/.test(prefix.greek);
  return ordinaryVariant(base, uppercaseGreek ? ['normal'] : ['italic']);
}
function matchDecimal(node, value) {
  if (flatText(node, 'mn', value) && ordinaryVariant(node)) return true;
  const sign = value[0];
  if (sign !== '+' && sign !== '-') return false;
  const parts = children(node);
  return tag(node) === 'mrow' && parts?.length === 2 &&
    flatText(parts[0], 'mo', sign === '-' ? '−' : '+') &&
    ordinaryVariant(parts[0]) && flatText(parts[1], 'mn', value.slice(1)) && ordinaryVariant(parts[1]);
}
function matchQuantity(node, quantity, unit) {
  const parts = children(node);
  if (tag(node) !== 'mrow' || !parts || parts.length !== 3) return false;
  const [number, space, token] = parts;
  if (!matchDecimal(number, quantity)) return false;
  if (tag(space) !== 'mtext' || [...space.children].length ||
      !space.textContent.length || !BLANK.test(space.textContent)) return false;
  return flatText(token, 'mi', unit) && ordinaryVariant(token) && token.classList.contains('ltx_unit');
}
function matchPresentation(node, parsed) {
  const {prefix, quantity, unit} = parsed;
  if (prefix.kind === 'quantity') return matchQuantity(node, quantity, unit);
  const parts = children(node);
  if (tag(node) !== 'mrow' || !parts) return false;
  if (prefix.kind === 'sign') return parts.length === 2 &&
    flatText(parts[0], 'mo', prefix.sign) && ordinaryVariant(parts[0]) &&
    matchQuantity(parts[1], quantity, unit);
  return parts.length === 3 && matchLabel(parts[0], prefix) &&
    flatText(parts[1], 'mo', '=') && ordinaryVariant(parts[1]) &&
    matchQuantity(parts[2], quantity, unit);
}
function source(mathNode) {
  if (tag(mathNode) !== 'math') return {reason:'not-math'};
  const root = children(mathNode);
  if (!root || root.length !== 1 || tag(root[0]) !== 'semantics') return {reason:'unsupported-math-structure'};
  const semantic = children(root[0]);
  if (!semantic || semantic.length !== 2 || tag(semantic[1]) !== 'annotation' ||
      semantic[1].getAttribute('encoding') !== 'application/x-tex' || [...semantic[1].children].length) {
    return {reason:'requires-single-tex-annotation'};
  }
  const originalTex = semantic[1].textContent;
  if (!originalTex) return {reason:'missing-source-tex'};
  const alttext = mathNode.getAttribute('alttext');
  if (alttext !== null && alttext !== originalTex) return {reason:'conflicting-source-tex'};
  return {originalTex, presentation:semantic[0]};
}
function inspect(mathNode) {
  const input = source(mathNode);
  if (input.reason) return fail(input.reason);
  const {originalTex, presentation} = input;
  let parsed;
  let ruleVersion;
  let renderInput;
  let macros = {};
  if (originalTex.includes('$')) {
    // Exactly two literal dollars, one terminal. Escaped dollars, $$,
    // nested text mode, multiple pairs, and definitions all fail the grammar.
    const delimiters = [...originalTex.matchAll(/\$/g)].map(match => match.index);
    if (delimiters.length !== 2 || delimiters[1] !== originalTex.length - 1 ||
        delimiters[0] + 1 >= delimiters[1]) return fail('dollars-outside-closed-quantity-grammar');
    const prefixTex = originalTex.slice(0, delimiters[0]);
    const body = originalTex.slice(delimiters[0] + 1, delimiters[1]);
    const prefix = parsePrefix(prefixTex);
    const quantity = QUANTITY.exec(body);
    if (!prefix || !quantity) return fail('dollars-outside-closed-quantity-grammar');
    parsed = {prefix, quantity:quantity[1], unit:quantity[2]};
    renderInput = prefixTex + body;
    ruleVersion = RULES.dollars;
  } else if (originalTex.includes('\\SIUnitSymbolDegree')) {
    const quantity = DEGREE.exec(originalTex);
    if (!quantity) return fail('degree-outside-closed-quantity-grammar');
    parsed = {prefix:{kind:'quantity'}, quantity:quantity[1], unit:'°'};
    renderInput = originalTex;
    // Per-call options, not a global definition or \def in the source string.
    macros = {'\\SIUnitSymbolDegree':'\\text{°}'};
    ruleVersion = RULES.degree;
  } else if (/\\vskip\b/.test(originalTex)) {
    return fail('vertical-skip-needs-explicit-layout-adapter');
  } else {
    return fail('no-supported-compatibility-rule');
  }
  if (!matchPresentation(presentation, parsed)) return fail('tex-mathml-semantics-mismatch');
  return {result:{
    ruleVersion, renderInput, macros:Object.freeze(macros),
    originalTex, originalMathML:mathNode.outerHTML,
    evidence:{quantity:parsed.quantity, unit:parsed.unit, prefix:parsed.prefix.kind},
  }, reason:null, version:VERSION};
}
module.exports = {inspect, normalize:node => inspect(node).result, VERSION, RULES};
