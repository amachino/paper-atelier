'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {parseHTML} = require('linkedom');
const katex = require('katex');
const {inspect, RULES} = require('./math-compat.cjs');
const tex = String.raw;
function math(input, presentation, attrs = {}) {
  const {document} = parseHTML(`<math><semantics>${presentation}<annotation encoding="application/x-tex"></annotation></semantics></math>`);
  const node = document.querySelector('math');
  node.querySelector('annotation').textContent = input;
  node.setAttribute('alttext', input);
  for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,value);
  return node;
}
function q(value='12.5', unit='ms') {
  const number = /^[+-]/.test(value) ? `<mrow><mo>${value[0] === '-' ? '−' : '+'}</mo><mn>${value.slice(1)}</mn></mrow>` : `<mn>${value}</mn>`;
  return `<mrow>${number}<mtext>&#160;</mtext><mi class="ltx_unit">${unit}</mi></mrow>`;
}
function assigned(content, base='<mi>x</mi>') { return `<mrow>${base}<mo>=</mo>${content}</mrow>`; }
function render(result) {
  const markup = katex.renderToString(result.renderInput, {macros:{...result.macros}, strict:'error', throwOnError:true, trust:false, maxExpand:1000, output:'htmlAndMathml'});
  const {document} = parseHTML(`<span>${markup}</span>`);
  const span = document.querySelector('span');
  span.querySelector('annotation[encoding="application/x-tex"]').textContent = result.originalTex;
  return span;
}
function accepted(input, presentation, rule) {
  const source = math(input, presentation);
  const original = source.outerHTML;
  const checked = inspect(source);
  assert.equal(checked.reason,null);
  assert(checked.result);
  assert.equal(checked.result.ruleVersion,rule);
  assert.equal(checked.result.originalTex,input);
  assert.equal(checked.result.originalMathML,original);
  assert.equal(source.outerHTML,original,'recognition is read-only');
  const rendered = render(checked.result);
  assert.equal(rendered.querySelector('annotation').textContent,input,'original annotation restored');
  assert(!rendered.querySelector('.katex-error,merror'));
  return checked.result;
}

const positives = [
  ['assignment', tex`x=$12.5\text{\,}\mathrm{ms}$`, assigned(q()), tex`x=12.5\text{\,}\mathrm{ms}`],
  ['bare quantity', tex`$7\text{\,}\mathrm{GHz}$`, q('7','GHz'), tex`7\text{\,}\mathrm{GHz}`],
  ['negative Greek assignment', tex`\beta_{\mathrm{ab}}=$-4.2\text{\,}\mathrm{GHz}$`, assigned(q('-4.2','GHz'),'<msub><mi>β</mi><mi>ab</mi></msub>'), tex`\beta_{\mathrm{ab}}=-4.2\text{\,}\mathrm{GHz}`],
  ['single roman subscript', tex`\gamma_{\mathrm{z}}=$5\text{\,}\mathrm{Hz}$`, assigned(q('5','Hz'),'<msub><mi>γ</mi><mi>z</mi></msub>'), tex`\gamma_{\mathrm{z}}=5\text{\,}\mathrm{Hz}`],
  ['bare italic subscript', tex`v_{z}=$5\text{\,}\mathrm{Hz}$`, assigned(q('5','Hz'),'<msub><mi>v</mi><mi>z</mi></msub>'), tex`v_{z}=5\text{\,}\mathrm{Hz}`],
  ['numeric subscript', tex`v_{2}=$5\text{\,}\mathrm{Hz}$`, assigned(q('5','Hz'),'<msub><mi>v</mi><mn>2</mn></msub>'), tex`v_{2}=5\text{\,}\mathrm{Hz}`],
  ['plus minus', tex`\pm$0.5\text{\,}\mathrm{m}$`, `<mrow><mo>±</mo>${q('0.5','m')}</mrow>`, tex`\pm0.5\text{\,}\mathrm{m}`],
  ['minus plus', tex`\mp$.25\text{\,}\mathrm{s}$`, `<mrow><mo>∓</mo>${q('.25','s')}</mrow>`, tex`\mp.25\text{\,}\mathrm{s}`],
  ['explicit positive', tex`x=$+2.\text{\,}\mathrm{K}$`, assigned(q('+2.','K')), tex`x=+2.\text{\,}\mathrm{K}`],
];
for (const [name,input,presentation,expected] of positives) test(`accept: ${name}`, () => {
  const result = accepted(input,presentation,RULES.dollars);
  assert.equal(result.renderInput,expected);
  assert.deepEqual(result.macros,{});
});
for (const value of ['0.125','32','-8.4','.7']) test(`accept: independently matched degree ${value}`, () => {
  const input = `${value}${tex`\text{\,}\mathrm{\SIUnitSymbolDegree}`}`;
  const result = accepted(input,q(value,'°'),RULES.degree);
  assert.equal(result.renderInput,input,'degree supplies a local option, not source rewriting');
  assert.deepEqual(result.macros,{[tex`\SIUnitSymbolDegree`]:tex`\text{°}`});
  assert(Object.isFrozen(result.macros));
});

const rejected = [
  ['unbalanced dollar', tex`x=$12.5\text{\,}\mathrm{ms}`, assigned(q())],
  ['double delimiters', tex`x=$$12.5\text{\,}\mathrm{ms}$$`, assigned(q())],
  ['multiple pairs', tex`x=$12.5\text{\,}\mathrm{ms}$+$2$`, assigned(q())],
  ['escaped dollars', tex`x=\$12.5\text{\,}\mathrm{ms}\$`, assigned(q())],
  ['dollar text', tex`\text{price $12.5 ms$}`, assigned(q())],
  ['text inside delimiters', tex`x=$\text{12.5 ms}$`, assigned(q())],
  ['unknown prefix macro', tex`\foo=$12.5\text{\,}\mathrm{ms}$`, assigned(q())],
  ['macro definition', tex`\def\foo{x}\foo=$12.5\text{\,}\mathrm{ms}$`, assigned(q())],
  ['extra suffix', tex`x=$12.5\text{\,}\mathrm{ms}$+1`, assigned(q())],
  ['multiple bare subscript letters', tex`x_{ab}=$12.5\text{\,}\mathrm{ms}$`, assigned(q(),'<msub><mi>x</mi><mi>ab</mi></msub>')],
  ['exponential quantity', tex`x=$1.25e1\text{\,}\mathrm{ms}$`, assigned(q())],
  ['fraction quantity', tex`x=$\frac{25}{2}\text{\,}\mathrm{ms}$`, assigned(q())],
  ['quantity contains arithmetic', tex`x=$12+0.5\text{\,}\mathrm{ms}$`, assigned(q())],
  ['unknown unit command', tex`x=$12.5\text{\,}\mathrm{\foo}$`, assigned(q())],
  ['compound unit', tex`x=$12.5\text{\,}\mathrm{m/s}$`, assigned(q('12.5','m/s'))],
  ['commented grammar', tex`x=$12.5%comment`+'\n'+tex`\text{\,}\mathrm{ms}$`, assigned(q())],
  ['mismatched quantity', tex`x=$99\text{\,}\mathrm{ms}$`, assigned(q())],
  ['mismatched unit', tex`x=$12.5\text{\,}\mathrm{GHz}$`, assigned(q())],
  ['mismatched left label', tex`y=$12.5\text{\,}\mathrm{ms}$`, assigned(q())],
  ['mismatched relation', tex`x=$12.5\text{\,}\mathrm{ms}$`, assigned(q()).replace('<mo>=</mo>','<mo>≠</mo>')],
  ['mismatched sign', tex`\pm$12.5\text{\,}\mathrm{ms}$`, `<mrow><mo>∓</mo>${q()}</mrow>`],
  ['unmarked unit', tex`x=$12.5\text{\,}\mathrm{ms}$`, assigned(q()).replace(' class="ltx_unit"','')],
  ['italic unit', tex`x=$12.5\text{\,}\mathrm{ms}$`, assigned(q()).replace('class="ltx_unit"','class="ltx_unit" mathvariant="italic"')],
  ['bold number', tex`x=$12.5\text{\,}\mathrm{ms}$`, assigned(q()).replace('<mn>','<mn mathvariant="bold">')],
  ['embedded unit children', tex`x=$12.5\text{\,}\mathrm{ms}$`, assigned(q()).replace('>ms</mi>','><mi>ms</mi></mi>')],
  ['multiplication is not spacing', tex`x=$12.5\text{\,}\mathrm{ms}$`, assigned(q()).replace('<mtext>&#160;</mtext>','<mo>×</mo>')],
  ['nonblank separator', tex`x=$12.5\text{\,}\mathrm{ms}$`, assigned(q()).replace('&#160;','and')],
  ['extra expression element', tex`x=$12.5\text{\,}\mathrm{ms}$`, assigned(q()).replace('</mrow></mrow>','<mo>+</mo><mn>1</mn></mrow></mrow>')],
  ['degree in general expression', tex`x=12.5\text{\,}\mathrm{\SIUnitSymbolDegree}`, assigned(q('12.5','°'))],
  ['degree override attempt', tex`\def\SIUnitSymbolDegree{x}12.5\text{\,}\mathrm{\SIUnitSymbolDegree}`, q('12.5','°')],
  ['degree lacks semantic marker', tex`12.5\text{\,}\mathrm{\SIUnitSymbolDegree}`, q('12.5','°').replace(' class="ltx_unit"','')],
  ['degree mismatches original unit', tex`12.5\text{\,}\mathrm{\SIUnitSymbolDegree}`, q('12.5','K')],
  ['degree command suffix', tex`12.5\text{\,}\mathrm{\SIUnitSymbolDegrees}`, q('12.5','°')],
  ['degree with Celsius suffix', tex`12.5\text{\,}\mathrm{\SIUnitSymbolDegree C}`, q('12.5','°C')],
  ['ordinary supported TeX', tex`12.5\text{\,}\mathrm{ms}`, q()],
  ['vertical skip in cases', tex`f=\begin{cases}1&x<0,\\\vskip 4pt\cr 2&x>0.\end{cases}`, '<mi>f</mi>'],
  ['vertical glue outside cases', tex`a\vskip 4pt\cr b`, '<mi>a</mi>'],
];
for (const [name,input,presentation] of rejected) test(`reject without mutation: ${name}`, () => {
  const source = math(input,presentation);
  const before = source.outerHTML;
  const result = inspect(source);
  assert.equal(result.result,null);
  assert(result.reason);
  assert.equal(source.outerHTML,before);
});
test('reject conflicting alttext, ambiguous annotations, and extra semantics', () => {
  for (const change of [
    node => node.setAttribute('alttext','different source'),
    node => node.querySelector('semantics').append(node.querySelector('annotation').cloneNode(true)),
    node => node.querySelector('semantics').append(node.ownerDocument.createElement('annotation-xml')),
    node => node.append(node.ownerDocument.createElement('mi')),
    node => node.querySelector('semantics').append('unparsed trailing text'),
  ]) {
    const node = math(positives[0][1],positives[0][2]);
    change(node);
    const before=node.outerHTML;
    assert.equal(inspect(node).result,null);
    assert.equal(node.outerHTML,before);
  }
});
test('identities never influence recognition', () => {
  const node=math(positives[0][1],positives[0][2],{id:'some-never-before-seen-paper-equation'});
  const first=inspect(node).result;
  assert(first);
  node.id='another-id';
  assert.equal(inspect(node).result.renderInput,first.renderInput);
});
test('local degree macro does not leak to later renders', () => {
  const result=inspect(math(tex`2\text{\,}\mathrm{\SIUnitSymbolDegree}`,q('2','°'))).result;
  render(result);
  assert.throws(() => katex.renderToString(tex`\SIUnitSymbolDegree`,{strict:'error',throwOnError:true}), /Undefined control sequence/);
});

test('read-only corpus audit replaces 11 exact fixes with equivalent visual trees', {skip:!process.env.PAPER_READER_CORPUS}, () => {
  const root=process.env.PAPER_READER_CORPUS;
  const papers=JSON.parse(fs.readFileSync(path.join(root,'sources/provenance.json'),'utf8'));
  const legacy=JSON.parse(fs.readFileSync(path.join(root,'sources/math-repairs.json'),'utf8'));
  const acceptedRules=[];
  let untouchedLegacy=0;
  for (const paper of papers) {
    const {document}=parseHTML(fs.readFileSync(path.join(root,paper.snapshot),'utf8'));
    for (const node of document.querySelectorAll('math')) {
      const before=node.outerHTML;
      const inspected=inspect(node);
      assert.equal(node.outerHTML,before);
      if (!inspected.result) {
        if (legacy.some(item=>item.paper===paper.slug && item.id===node.id)) {
          assert.equal(inspected.reason,'vertical-skip-needs-explicit-layout-adapter');
          untouchedLegacy++;
        }
        continue;
      }
      const result=inspected.result;
      acceptedRules.push(result.ruleVersion);
      const old=legacy.find(item=>item.paper===paper.slug && item.id===node.id);
      assert(old,'no unexpected extra corpus normalization');
      const options={strict:'error',throwOnError:true,trust:false,maxExpand:1000,output:'htmlAndMathml',displayMode:node.getAttribute('display')==='block'};
      const a=parseHTML(katex.renderToString(old.renderInput,options)).document;
      const b=parseHTML(katex.renderToString(result.renderInput,{...options,macros:{...result.macros}})).document;
      assert.equal(a.querySelector('.katex-html').outerHTML,b.querySelector('.katex-html').outerHTML,'visual render unchanged');
      for (const doc of [a,b]) doc.querySelector('annotation').textContent=old.originalTex;
      assert.equal(a.querySelector('math').outerHTML,b.querySelector('math').outerHTML,'accessible rendered MathML unchanged');
    }
  }
  assert.equal(acceptedRules.filter(rule=>rule===RULES.dollars).length,7);
  assert.equal(acceptedRules.filter(rule=>rule===RULES.degree).length,4);
  assert.equal(untouchedLegacy,1);
});
