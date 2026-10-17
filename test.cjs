'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { parseHTML } = require('linkedom');
process.chdir(__dirname);
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const provenance = JSON.parse(fs.readFileSync('sources/provenance.json', 'utf8'));
const repairs = JSON.parse(fs.readFileSync('sources/math-repairs.json', 'utf8'));
const audit = JSON.parse(fs.readFileSync('docs/math-audit.json', 'utf8'));
const expectedPages = ['bswap.html', 'index.html', 'qubex.html'];
assert.deepEqual(fs.readdirSync('docs').filter(f => f.endsWith('.html')).sort(), expectedPages, 'Only three public HTML pages');
const documents = new Map(expectedPages.map(file => [file, parseHTML(fs.readFileSync('docs/' + file, 'utf8')).document]));
const stats = [];
const local = (url, base) => {
  if (/^(https?:|mailto:|tel:)/.test(url)) return null;
  assert(!/^[a-z]+:/i.test(url) && !url.startsWith('//'), `Unexpected URL scheme: ${url}`);
  const parsed = new URL(url, `https://example.invalid/paper-atelier/${base}`);
  assert(parsed.pathname.startsWith('/paper-atelier/'), `URL escapes project path: ${url}`);
  const relative = decodeURIComponent(parsed.pathname.slice('/paper-atelier/'.length));
  const file = relative || 'index.html';
  assert(fs.existsSync(path.join('docs', file)), `Missing local target: ${base} -> ${url}`);
  if (parsed.hash && documents.has(file)) assert(documents.get(file).getElementById(decodeURIComponent(parsed.hash.slice(1))), `Missing fragment: ${base} -> ${url}`);
  return file;
};
for (const [file, document] of documents) {
  const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
  assert.equal(ids.length, new Set(ids).size, `${file}: duplicate IDs`);
  assert.equal(document.querySelectorAll('merror,.katex-error,.ltx_ERROR').length, 0, `${file}: math errors`);
  for (const element of document.querySelectorAll('[src],[href],[data]')) {
    for (const attr of ['src','href','data']) {
      const url = element.getAttribute(attr);
      if (url) {
        if (attr !== 'href' || element.tagName === 'LINK') assert(!/^(https?:|\/\/)/.test(url), `${file}: external runtime asset`);
        local(url, file);
      }
    }
  }
  for (const script of document.querySelectorAll('script')) assert(['assets/anchor.js','assets/settings.js'].includes(script.getAttribute('src')), `${file}: unexpected script`);
  assert.equal(document.querySelectorAll('script[src="assets/settings.js"]').length, 1, `${file}: reading preferences script`);
  assert(document.querySelector('#reader-settings > summary'), `${file}: keyboard-native settings disclosure`);
  assert(document.querySelector('label[for="reader-font-family"]'), `${file}: font label`);
  assert(document.querySelector('label[for="reader-font-size"]'), `${file}: size label`);
  assert.equal(document.getElementById('reader-settings-reset').getAttribute('type'), 'button');
  assert.equal(document.getElementById('reader-settings-status').getAttribute('aria-live'), 'polite');
  const sizes = [...document.querySelectorAll('#reader-font-size option')].map(n => n.getAttribute('value'));
  assert.deepEqual(sizes, ['auto', ...Array.from({length:25}, (_,i) => String(12+i/2))]);
  assert(!/maximum-scale|minimum-scale|user-scalable/.test(document.querySelector('meta[name="viewport"]').getAttribute('content')), `${file}: browser zoom unrestricted`);
  assert(!document.querySelector('#mode-switch,script[src*="qa-observer"]'), `${file}: comparison UI removed`);
  stats.push({page:file, bytes:fs.statSync('docs/' + file).size, math:document.querySelectorAll('math').length, figures:document.querySelectorAll('figure').length});
}
for (const cssFile of ['assets/reader.css', 'assets/katex/katex.min.css']) {
  const css = fs.readFileSync('docs/' + cssFile, 'utf8');
  for (const match of css.matchAll(/url\(([^)]*)\)/g)) {
    const url = match[1].replace(/["']/g, '');
    assert(url.endsWith('.woff2'), `${cssFile}: only WOFF2 font assets`);
    local(url, cssFile);
  }
}
function scientificText(document) {
  const article = document.querySelector('article').cloneNode(true);
  for (const element of article.querySelectorAll('.rendered-math,.fallback-math,math,script,summary,img,object')) element.remove();
  return article.textContent.replace(/\s+/g, ' ').trim();
}
for (const paper of provenance) {
  const sourceBytes = fs.readFileSync(paper.snapshot);
  assert.equal(sha256(sourceBytes), paper.snapshotSha256, `${paper.slug}: source integrity`);
  const source = parseHTML(sourceBytes.toString()).document;
  const output = documents.get(`${paper.slug}.html`);
  const report = audit.papers.find(p => p.paper === paper.slug);
  const sourceMath = [...source.querySelectorAll('math')];
  assert.equal(sourceMath.length, paper.mathCount);
  assert.equal(output.querySelectorAll('math').length, paper.mathCount, `${paper.slug}: all expressions retained`);
  assert.equal(output.querySelectorAll('.rendered-math').length, report.converted);
  assert.equal(output.querySelectorAll('.fallback-math').length, report.nativeFallbacks);
  assert.equal(report.converted + report.nativeFallbacks, paper.mathCount);
  assert.equal(scientificText(output), scientificText(source), `${paper.slug}: scientific prose/captions/citations unchanged`);
  for (const original of source.querySelectorAll('[id]')) assert(output.getElementById(original.id), `${paper.slug}: source ID ${original.id} retained`);
  for (const math of sourceMath) {
    const actual = output.getElementById(math.id);
    assert(actual, `${paper.slug}: math ID ${math.id}`);
    const tex = math.querySelector('annotation[encoding="application/x-tex"]').textContent;
    assert.equal(actual.querySelector('annotation[encoding="application/x-tex"]').textContent, tex, `${paper.slug}:${math.id}: original TeX annotation retained`);
    if (actual.tagName.toLowerCase() === 'math') assert.equal(actual.outerHTML, math.outerHTML, `${paper.slug}:${math.id}: original fallback MathML byte serialization retained`);
  }
  for (const repair of repairs.filter(r => r.paper === paper.slug)) {
    const actual = output.getElementById(repair.id);
    assert(actual.classList.contains('rendered-math'));
    assert.equal(actual.getAttribute('data-render-input'), repair.renderInput);
    assert.equal(actual.getAttribute('data-math-repair'), repair.reason);
    const entry = report.repairs.find(r => r.id === repair.id);
    assert.equal(entry.originalTex, repair.originalTex);
    assert.equal(entry.renderInput, repair.renderInput);
  }
  assert.equal(output.querySelectorAll('img').length, paper.figures.length);
  for (const figure of paper.figures) {
    assert.equal(sha256(fs.readFileSync('docs/' + figure.file)), figure.sha256, `Figure integrity: ${figure.file}`);
    const img = [...output.querySelectorAll('img')].find(node => node.getAttribute('src') === figure.file);
    assert(img, `Figure: ${figure.file}`);
    assert(Number(img.getAttribute('width')) > 0 && Number(img.getAttribute('height')) > 0, `Intrinsic figure dimensions: ${figure.file}`);
  }
}
assert.deepEqual(audit.total, {math:1220, converted:1217, repaired:12, nativeFallbacks:3});
assert.equal(repairs.length, 12);
assert.deepEqual(audit.papers.flatMap(p => p.fallbacks.map(f => f.id)), ['S4.T1.m8','S4.T1.m10','A3.SS4.p1.m4']);
const readerCss = fs.readFileSync('docs/assets/reader.css','utf8');
assert(readerCss.includes('cite.ltx_cite{font-style:normal}'), 'Numeric citation labels upright');
assert(readerCss.includes('@media(max-width:350px){article section > .ltx_para > p.ltx_p{text-align:start}}'), 'Smallest viewport prose start-aligned');
assert(readerCss.includes('p.ltx_p{text-align:justify;'), 'Desktop prose justified');
for (const license of ['KaTeX','STIX-Two-Text','STIX-Two-Math']) assert(fs.statSync(`docs/assets/LICENSE-${license}.txt`).size > 500);
console.log(JSON.stringify({passed:true, pages:stats, math:audit.total, checks:['all local assets, links and fragments','unique and preserved source IDs','all original scientific prose and TeX annotations','12 exact rendering-only repairs','3 unchanged original MathML unit fallbacks','37 byte-identical figures with intrinsic dimensions','mobile typography rules and upright citations','three-page public boundary']}, null, 2));

// Execute the preferences controller against small DOM/storage stubs. This is
// a Node unit test, not browser rendering or layout validation.
const vm = require('node:vm');
const settingsScript = fs.readFileSync('docs/assets/settings.js', 'utf8');
assert.equal(settingsScript, fs.readFileSync('settings.js', 'utf8'));
assert(!/fetch\s*\(|XMLHttpRequest|sendBeacon|document\.cookie/.test(settingsScript), 'Settings do not transmit preferences');
function settingsHarness(initial, unavailable = false) {
  const key = 'paper-atelier.reader-settings.v1';
  const saved = new Map(initial === undefined ? [] : [[key, initial]]);
  const events = new Map(), style = new Map();
  let focused = false;
  const control = () => ({value:'', hidden:true, open:true, textContent:'', events:{}, addEventListener(type,handler){this.events[type]=handler;}});
  const ids = Object.fromEntries(['reader-settings','reader-font-family','reader-font-size','reader-settings-reset','reader-settings-status'].map(id=>[id,control()]));
  ids['reader-settings'].querySelector = () => ({focus(){focused=true;}});
  const root = {dataset:{},style:{setProperty(k,v){style.set(k,v);},removeProperty(k){style.delete(k);}}};
  const document = {documentElement:root,readyState:'loading',getElementById:id=>ids[id],addEventListener(type,handler){events.set(type,handler);}};
  const localStorage = {
    getItem(k){if(unavailable)throw Error('blocked');return saved.get(k)??null;},
    setItem(k,v){if(unavailable)throw Error('blocked');saved.set(k,v);},
    removeItem(k){if(unavailable)throw Error('blocked');saved.delete(k);}
  };
  const window = {addEventListener(type,handler){events.set(type,handler);}};
  vm.runInNewContext(settingsScript, {document,window,localStorage});
  // Preferences are applied before DOMContentLoaded.
  events.get('DOMContentLoaded')();
  return {ids,root,style,saved,key,events,focused:()=>focused};
}
const defaults = settingsHarness();
assert.equal(defaults.root.dataset.readerFont,'serif');
assert(!defaults.style.has('--reader-font-size'));
assert.equal(defaults.ids['reader-settings'].hidden,false);
assert.equal(defaults.ids['reader-font-size'].value,'auto');
defaults.ids['reader-font-family'].value='sans';
defaults.ids['reader-font-family'].events.change();
assert.equal(defaults.root.dataset.readerFont,'sans');
for(const size of ['12','14.5','24']) {
  defaults.ids['reader-font-size'].value=size;
  defaults.ids['reader-font-size'].events.change();
  assert.equal(defaults.style.get('--reader-font-size'),size+'px');
}
const restored = settingsHarness(defaults.saved.get(defaults.key));
assert.equal(restored.root.dataset.readerFont,'sans');
assert.equal(restored.style.get('--reader-font-size'),'24px');
restored.ids['reader-settings-reset'].events.click();
assert.equal(restored.root.dataset.readerFont,'serif');
assert(!restored.style.has('--reader-font-size'));
assert(!restored.saved.has(restored.key));
assert.equal(restored.ids['reader-font-size'].value,'auto');
restored.events.get('storage')({key:restored.key,newValue:JSON.stringify({font:'sans',size:16.5})});
assert.equal(restored.ids['reader-font-size'].value,'16.5');
assert.equal(restored.style.get('--reader-font-size'),'16.5px');
restored.events.get('storage')({key:restored.key,newValue:null});
assert.equal(restored.root.dataset.readerFont,'serif');
assert(!restored.style.has('--reader-font-size'));
let prevented=false;
restored.ids['reader-settings'].events.keydown({key:'Escape',preventDefault(){prevented=true;}});
assert.equal(restored.ids['reader-settings'].open,false);
assert(restored.focused() && prevented);
for(const value of ['invalid JSON','null',JSON.stringify({font:'unknown',size:99}),JSON.stringify({size:'24; color:red'}),JSON.stringify({size:14.3})]) {
  const bad=settingsHarness(value);
  assert.equal(bad.root.dataset.readerFont,'serif');
  assert(!bad.style.has('--reader-font-size'));
}
const blocked=settingsHarness(undefined,true);
blocked.ids['reader-font-size'].value='20';
blocked.ids['reader-font-size'].events.change();
assert.equal(blocked.style.get('--reader-font-size'),'20px');
assert(blocked.ids['reader-settings-status'].textContent.includes('unavailable'));
assert(readerCss.includes('--reader-default-size:14.5px'));
assert(readerCss.includes('--reader-default-size:19px'));
assert(readerCss.includes('font-size:var(--reader-font-size,var(--reader-default-size))'));
assert(readerCss.includes('math{font-family:'));
assert(readerCss.includes('.katex{font-size:1.05em!important}'));
console.log('Reading preferences passed: controls, size bounds, persistence, cross-page restore, reset, storage failure, Escape focus, and unchanged math-font rules. Browser layout is not asserted.');

for (const name of ['index.html','bswap.html','qubex.html']) { const html = fs.readFileSync('docs/'+name,'utf8'); assert(!/Paper Atelier|PAPER ATELIER|PHYSICS, WITH ROOM|Made for reading/.test(html), 'No promotional branding: '+name); }
