'use strict';
const katex=require('katex');
const {inspect:inspectUnit}=require('./semantic-units.cjs');
const {inspect:inspectCompatibility}=require('./math-compat.cjs');
const {lookup:lookupLegacy}=require('./legacy-math-adapter.cjs');
module.exports=function renderMathematics(document,article,paper){
  const report = {paper: paper.slug, source: paper.url, mathCount: article.querySelectorAll('math').length, converted: 0, repaired: 0, nativeFallbacks: 0, semanticUnits: 0, normalizations: [], repairs: [], fallbacks: [], layoutAdjustments: []};
  for (const math of [...article.querySelectorAll('math')]) {
    const originalTex = math.querySelector('annotation[encoding="application/x-tex"]')?.textContent || math.getAttribute('alttext');
    const compatibility = inspectCompatibility(math);
    const generic = compatibility.result;
    const repair = generic ? {...generic, reason:generic.ruleVersion, legacy:false} : lookupLegacy(paper.slug,math,originalTex);
    const renderInput = repair ? repair.renderInput : originalTex;
    try {
      if (!renderInput) throw new Error('No source TeX annotation');
      const markup = katex.renderToString(renderInput, {macros:{...(repair?.macros || {})}, throwOnError: true, strict: 'error', output: 'htmlAndMathml', displayMode: math.getAttribute('display') === 'block', trust: false, maxExpand: 1000});
      const span = document.createElement('span');
      span.className = 'rendered-math';
      if (math.id) span.id = math.id;
      span.innerHTML = markup;
      // Recover the relation spacing omitted when LaTeXML splits the LHS and
      // RHS into separate cells. Inspect the rendered atom; never rewrite TeX.
      const firstBase = span.querySelector('.katex-html > .katex-base');
      const firstAtom = firstBase && [...firstBase.children].find(child => !child.classList.contains('katex-strut'));
      if (math.closest('.ltx_eqn_table') && math.closest('td.ltx_align_left') && firstAtom?.classList.contains('mrel')) {
        span.classList.add('relation-start');
        report.layoutAdjustments.push({id: math.id, kind: 'split-cell-leading-relation-spacing', space: '0.2778em'});
      }

      // Accessibility/source annotation remains the exact original, even when
      // rendering requires an explicitly audited compatibility adjustment.
      span.querySelector('annotation[encoding="application/x-tex"]').textContent = originalTex;
      if (repair) {
        span.setAttribute('data-render-input', renderInput);
        span.setAttribute('data-math-repair', repair.reason);
        report.repairs.push({id: math.id, originalTex, renderInput, reason: repair.reason, ruleVersion:repair.ruleVersion, legacy:!!repair.legacy, macros:repair.macros || {}, evidence:repair.evidence || null});
        report.repaired++;
      }
      math.replaceWith(span);
      report.converted++;
    } catch (error) {
      if (repair) throw new Error(`Approved repair did not render (${math.id}): ${error.message}`);
      const normalized = inspectUnit(math);
      if(normalized.result){
        const unit = normalized.result;
        const span=document.createElement('span');span.className='semantic-unit';
        span.setAttribute('data-unit-rule',unit.ruleVersion);
        const text=document.createElement('span');text.className='semantic-unit-text';text.textContent=unit.text;
        const source=document.createElement('span');source.hidden=true;source.setAttribute('aria-hidden','true');source.className='semantic-unit-source';
        const originalMathML=math.outerHTML;
        math.parentNode.insertBefore(span,math);span.appendChild(text);span.appendChild(source);source.appendChild(math);
        report.normalizations.push({id:math.id,originalTex,originalMathML,text:unit.text,unit:unit.unit,quantity:unit.quantity,ruleVersion:unit.ruleVersion,renderer:'semantic HTML text',trigger:'KaTeX unsupported input'});
        report.semanticUnits++;continue;
      }
      const span = document.createElement('span');
      span.className = 'fallback-math';
      span.setAttribute('title', 'Original MathML retained');
      span.setAttribute('data-fallback', 'Original MathML');
      math.parentNode.insertBefore(span, math);
      span.appendChild(math);
      report.fallbacks.push({id: math.id, originalTex, renderInput, reason: error.message, semanticUnitReason: normalized.reason, compatibilityReason:compatibility.reason});
      report.nativeFallbacks++;
    }
  }
  return report;
};
