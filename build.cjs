'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseHTML } = require('linkedom');
const katex = require('katex');
const root = __dirname;
process.chdir(root);
const provenance = JSON.parse(fs.readFileSync('sources/provenance.json', 'utf8'));
const tableLayout = JSON.parse(fs.readFileSync('sources/table-layout.json', 'utf8'));
const figureLayout = JSON.parse(fs.readFileSync('sources/figure-layout.json', 'utf8'));
const repairs = JSON.parse(fs.readFileSync('sources/math-repairs.json', 'utf8'));
const repairMap = new Map(repairs.map(r => [`${r.paper}:${r.id}`, r]));
const reports = [];
const settingsMarkup = fs.readFileSync('settings.html', 'utf8').trim();
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const readerSettingsVersion = sha256(fs.readFileSync('settings.js')).slice(0,12);
const readerTocVersion = sha256(fs.readFileSync('toc.js')).slice(0,12);
const readerCssVersion = sha256(fs.readFileSync('reader.css')).slice(0,12);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), {recursive:true}); fs.copyFileSync(from, to); };

// No downloads during a build. The immutable source figures live in docs so
// they are versioned once, and are already at their final static asset URLs.
for (const paper of provenance) {
  const source = fs.readFileSync(paper.snapshot, 'utf8');
  if (sha256(source) !== paper.snapshotSha256) throw new Error(`Source snapshot changed: ${paper.slug}`);
  const { document } = parseHTML(source);
  const article = document.querySelector('article');
  for (const script of article.querySelectorAll('script')) script.remove();
  for (const element of article.querySelectorAll('[style]')) element.removeAttribute('style');
  for (const object of article.querySelectorAll('object[data]')) {
    const img = document.createElement('img');
    img.setAttribute('src', object.getAttribute('data'));
    img.setAttribute('alt', object.textContent.trim() || 'Scientific figure; see caption');
    for (const key of ['id', 'width', 'height', 'class']) if (object.hasAttribute(key)) img.setAttribute(key, object.getAttribute(key));
    object.replaceWith(img);
  }
  for (const img of article.querySelectorAll('img')) {
    const figure = paper.figures.find(f => f.source === img.getAttribute('src'));
    if (!figure) throw new Error(`Unregistered source figure: ${img.getAttribute('src')}`);
    const bytes = fs.readFileSync(`docs/${figure.file}`);
    if (sha256(bytes) !== figure.sha256) throw new Error(`Figure changed: ${figure.file}`);
    img.setAttribute('src', figure.file);
    let dimensions;
    if (figure.file.endsWith('.svg')) {
      const viewBox = bytes.toString().match(/viewBox=["']([^"']+)/);
      if (viewBox) dimensions = viewBox[1].trim().split(/[ ,]+/).map(Number).slice(2).map(v => Math.round(v * 100));
    } else if (figure.file.endsWith('.png')) dimensions = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
    if (!dimensions || !dimensions.every(n => Number.isFinite(n) && n > 0)) throw new Error(`Missing image dimensions: ${figure.file}`);
    img.setAttribute('width', String(dimensions[0]));
    img.setAttribute('height', String(dimensions[1]));
    img.setAttribute('data-intrinsic-ratio', dimensions.join('/'));
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
  }
  for (const table of article.querySelectorAll('table')) {
    const wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    wrap.setAttribute('tabindex', '0');
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', table.className.includes('eqn') ? 'Equation; scroll horizontally if needed' : 'Table; scroll horizontally if needed');
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
  }
  require('./header-format.cjs')(document, article, paper.slug);
  const figurePlan = figureLayout.papers[paper.slug];
  for (const figure of figurePlan.figures) {
    const node = article.querySelector(`[id="${figure.html_id}"]`);
    if (!node || !node.classList.contains('ltx_figure')) throw new Error(`Missing classified figure: ${paper.slug}:${figure.html_id}`);
    node.classList.add(figure.classification === 'two-column' ? 'figure-wide' : 'figure-single');
    node.setAttribute('data-original-column-span', figure.classification === 'two-column' ? '2' : '1');
  }
  for (const group of figurePlan.groups) article.querySelector(`[id="${group.html_id}"]`).classList.add('figure-pair');
  for(const table of tableLayout.papers[paper.slug].tables){
    const node=article.querySelector(`[id="${table.html_id}"]`);
    if(!node||!node.classList.contains('ltx_table'))throw new Error(`Missing classified table: ${table.html_id}`);
    node.classList.add(table.classification==='single-column'?'table-single':'table-wide');
    node.setAttribute('data-original-column-span',table.classification==='single-column'?'1':'2');
  }
  const titleNode = article.querySelector('h1').cloneNode(true);
  for (const br of titleNode.querySelectorAll('br')) br.replaceWith(document.createTextNode(' '));
  const title = titleNode.textContent.replace(/\s+/g, ' ').trim();
  const nav = [...article.querySelectorAll('h2')].filter(h => h.id || h.parentNode.id).map(h => `<a href="#${escape(h.id || h.parentNode.id)}">${escape(h.textContent.trim())}</a>`).join('');
  const tocLinks = [...article.querySelectorAll('h2,h3')].filter(h=>h.id||h.parentNode.id).map(h=>`<a class="toc-level-${h.tagName.toLowerCase()}" href="#${escape(h.id||h.parentNode.id)}">${escape(h.textContent.trim())}</a>`).join('');
  const tocMarkup = `<button type="button" class="reader-toc-trigger" id="reader-toc-open" aria-label="Open table of contents" aria-haspopup="dialog" aria-controls="reader-toc" aria-expanded="false" hidden><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="M4 5h2M10 5h10M4 12h2M10 12h10M4 19h2M10 19h10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button><dialog class="reader-toc-dialog" id="reader-toc" aria-labelledby="reader-toc-title"><div class="reader-toc-heading"><h2 id="reader-toc-title">Contents</h2><button type="button" id="reader-toc-close" autofocus>Close</button></div><nav aria-label="Table of contents"><a class="all-papers-link" href="index.html">← All papers</a>${tocLinks}</nav></dialog>`;
  const report = {paper: paper.slug, source: paper.url, mathCount: article.querySelectorAll('math').length, converted: 0, repaired: 0, nativeFallbacks: 0, repairs: [], fallbacks: [], layoutAdjustments: []};
  for (const math of [...article.querySelectorAll('math')]) {
    const originalTex = math.querySelector('annotation[encoding="application/x-tex"]')?.textContent || math.getAttribute('alttext');
    const repair = repairMap.get(`${paper.slug}:${math.id}`);
    if (repair && repair.originalTex !== originalTex) throw new Error(`Repair source mismatch: ${paper.slug}:${math.id}`);
    const renderInput = repair ? repair.renderInput : originalTex;
    try {
      if (!renderInput) throw new Error('No source TeX annotation');
      const markup = katex.renderToString(renderInput, {throwOnError: true, strict: 'error', output: 'htmlAndMathml', displayMode: math.getAttribute('display') === 'block', trust: false, maxExpand: 1000});
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
        report.repairs.push({id: math.id, originalTex, renderInput, reason: repair.reason});
        report.repaired++;
      }
      math.replaceWith(span);
      report.converted++;
    } catch (error) {
      if (repair) throw new Error(`Approved repair did not render (${math.id}): ${error.message}`);
      const span = document.createElement('span');
      span.className = 'fallback-math';
      span.setAttribute('title', 'Original MathML retained');
      span.setAttribute('data-fallback', 'Original MathML');
      math.parentNode.insertBefore(span, math);
      span.appendChild(math);
      report.fallbacks.push({id: math.id, originalTex, renderInput, reason: error.message});
      report.nativeFallbacks++;
    }
  }
  if (report.mathCount !== paper.mathCount) throw new Error(`Math count changed: ${paper.slug}`);
  const notice = report.nativeFallbacks ? `<p class="notice">${report.converted} of ${report.mathCount} expressions use build-time KaTeX. ${report.nativeFallbacks} unit expressions retain the original MathML, marked by a dotted underline. <a href="math-audit.json">Rendering audit</a>.</p>` : '';
  const output = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="${escape(title)}. Responsive reading edition with build-time mathematics."><title>${escape(title)}</title><link rel="stylesheet" href="assets/reader.css?v=${readerCssVersion}"><link rel="stylesheet" href="assets/katex/katex.min.css"><script src="assets/settings.js?v=${readerSettingsVersion}"></script><script src="assets/anchor.js" defer></script><script src="assets/toc.js?v=${readerTocVersion}" defer></script></head><body><header class="topbar">${tocMarkup}<nav><a href="https://arxiv.org/abs/${paper.arxivId}">arXiv</a><a href="https://arxiv.org/pdf/${paper.arxivId}">PDF</a>${settingsMarkup}</nav></header><div class="layout"><aside aria-label="On this page"><a class="all-papers-link" href="index.html">← All papers</a><div class="eyebrow">ON THIS PAGE</div>${nav}<a href="#top">Back to top ↑</a></aside><main id="top">${notice}${article.outerHTML}<footer><p><a class="all-papers-link" href="index.html">← All papers</a></p>Content and figures from <a href="${paper.url}">arXiv ${paper.arxivId}</a>. Original authors retain their rights. Presentation changed; scientific text and units preserved. <a href="math-audit.json">Rendering audit</a> · <a href="NOTICE.md">Rights and notices</a>.</footer></main></div></body></html>\n`;
  fs.writeFileSync(`docs/${paper.slug}.html`, output);
  reports.push(report);
}

copy('reader.css', 'docs/assets/reader.css');
copy('anchor.js', 'docs/assets/anchor.js');
copy('toc.js', 'docs/assets/toc.js');
copy('settings.js', 'docs/assets/settings.js');
fs.writeFileSync('docs/index.html', fs.readFileSync('index.html', 'utf8').replace('<!-- reader-settings -->', settingsMarkup).replace('assets/reader.css', `assets/reader.css?v=${readerCssVersion}`).replace('assets/settings.js', `assets/settings.js?v=${readerSettingsVersion}`));
copy('NOTICE.md', 'docs/NOTICE.md');
copy('sources/figure-layout.json', 'docs/figure-layout.json');
copy('sources/table-layout.json', 'docs/table-layout.json');
// Ship CSS and WOFF2 fonts only. KaTeX itself runs only in Node during build.
let katexCss = fs.readFileSync('node_modules/katex/dist/katex.min.css', 'utf8');
katexCss = katexCss.replace(/src:([^;}]+)/g, (_, value) => {
  const woff2 = value.match(/url\([^)]*\.woff2\) format\(["']?woff2["']?\)/);
  if (!woff2) throw new Error('Expected WOFF2 source in KaTeX CSS');
  return 'src:' + woff2[0];
});
fs.mkdirSync('docs/assets/katex/fonts', {recursive: true});
fs.writeFileSync('docs/assets/katex/katex.min.css', katexCss);
for (const match of katexCss.matchAll(/url\(([^)]*)\)/g)) {
  const relative = match[1].replace(/["']/g, '');
  copy(`node_modules/katex/dist/${relative}`, `docs/assets/katex/${relative}`);
}
for (const font of ['stix-two-text-latin-400-normal.woff2', 'stix-two-text-latin-400-italic.woff2', 'stix-two-text-latin-700-normal.woff2']) copy(`node_modules/@fontsource/stix-two-text/files/${font}`, `docs/assets/fonts/${font}`);
copy('node_modules/@fontsource/stix-two-math/files/stix-two-math-latin-400-normal.woff2', 'docs/assets/fonts/stix-two-math-latin-400-normal.woff2');
for (const [source, name] of [['katex/LICENSE', 'KaTeX'], ['@fontsource/stix-two-text/LICENSE', 'STIX-Two-Text'], ['@fontsource/stix-two-math/LICENSE', 'STIX-Two-Math']]) copy(`node_modules/${source}`, `docs/assets/LICENSE-${name}.txt`);
fs.writeFileSync('docs/.nojekyll', '');
fs.writeFileSync('docs/math-audit.json', JSON.stringify({renderer: 'KaTeX 0.19.0 (JavaScript, build time)', input: 'Versioned arXiv HTML article snapshots and their original TeX annotations', papers: reports, total: {math: reports.reduce((n, p) => n + p.mathCount, 0), converted: reports.reduce((n, p) => n + p.converted, 0), repaired: reports.reduce((n, p) => n + p.repaired, 0), nativeFallbacks: reports.reduce((n, p) => n + p.nativeFallbacks, 0)}}, null, 2) + '\n');
console.log(reports.map(({paper, mathCount, converted, repaired, nativeFallbacks}) => ({paper, mathCount, converted, repaired, nativeFallbacks})));
