/**
 * End-to-end quality checklist against the built single file (dist/index.html), opened via file://.
 * Usage: npm run build && node e2e/checklist.cjs
 * Needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`, or set CHROMIUM=/path/to/chrome).
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');
const JSZip = require('jszip');
const XLSX = require('xlsx');

const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const DEMO_PII = ['(555)', '@example.com', 'Jane Sample', 'John Example', 'Pat Placeholder', 'Sample Creek', 'DEMO SM'];

(async () => {
  const html = path.resolve(__dirname, '../dist/index.html');
  const url = 'file://' + html;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-e2e-'));
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const logs = []; const net = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Content Security Policy/.test(m.text())) logs.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) net.push(r.url()); });
  const main = () => page.innerText('main');

  // 1. Opens offline, demo numbers
  await page.goto(url + '#/data');
  check('Single file opens from file://', (await page.title()).includes('HomeCare+'));
  // Empty states: with nothing loaded, every data screen names the files to upload.
  const emptyMissing = [];
  for (const r of ['/', '/trends', '/regions', '/detractors', '/attributes', '/voc', '/calls', '/cross', '/wbr', '/pulse', '/ask']) {
    await page.goto(url + '#' + r); await page.waitForTimeout(500);
    const body = await main();
    if (!/Go to Data Manager|Upload these files|Nothing is loaded|No data/i.test(body) || /This screen hit a problem/.test(body)) emptyMissing.push(r);
  }
  check('Every screen has an empty state naming the files to upload', !emptyMissing.length, emptyMissing.join(', '));
  await page.goto(url + '#/data');
  await page.click('text=Load demo data');
  await page.waitForSelector('text=/Loaded .* demo surveys/');
  await page.goto(url + '#/?fw=40'); await page.waitForSelector('text=94.7%');
  let t = await main();
  check('FW40 LTR 94.7% n=131', /94\.7%\s*n=131/.test(t));
  check('Detractors 7 of 131, 2 at 0–6', /7\s*of 131/.test(t) && /2 scored 0–6/.test(t));
  check('FYTD 93.1% on n=3,736', /93\.1%\s*n=3,736/.test(t));

  // 2. Demo source files → import → same numbers; re-upload no duplicates; calls outside week reported
  const files = [];
  page.on('download', async (d) => { const p = path.join(tmp, d.suggestedFilename()); await d.saveAs(p); files.push(p); });
  await page.goto(url + '#/data');
  await page.click('text=Demo source files'); await page.waitForSelector('text=/Downloaded \\d+ demo source files/', { timeout: 30000 }); await page.waitForTimeout(800);
  await page.click('text=Remove demo'); await page.waitForSelector('text=/Demo data removed/');
  const t0 = Date.now();
  await page.setInputFiles('input[aria-label="Choose files to upload"]', files);
  await page.waitForFunction(() => document.querySelectorAll('article').length >= 12 && ![...document.querySelectorAll('article')].some((a) => a.textContent.includes('Reading…')), null, { timeout: 120000 });
  check('12 demo source files parse without errors', (await page.locator('article >> text=Ready to import').count()) === 12, `${Date.now() - t0} ms`);
  await page.click('text=/Import all ready/');
  await page.waitForFunction(() => [...document.querySelectorAll('article')].every((a) => a.textContent.includes('Imported')), null, { timeout: 120000 });
  const range = page.locator('article[aria-label^="10.30-11.1"]');
  await range.getByRole('button', { name: 'Report' }).click();
  check('Calls outside the selected week are dropped and counted', /Dated outside FW40: \d+/.test(await range.innerText()));
  const counts1 = await page.locator('section:has-text("What’s loaded") dl').innerText();
  await page.click('text=Clear imported');
  const again = files.filter((f) => /Tracker|Loyalty/.test(f));
  await page.setInputFiles('input[aria-label="Choose files to upload"]', again);
  await page.waitForFunction((n) => document.querySelectorAll('article').length === n && ![...document.querySelectorAll('article')].some((a) => a.textContent.includes('Reading…')), again.length, { timeout: 120000 });
  await page.click('text=/Import all ready/');
  await page.waitForFunction(() => [...document.querySelectorAll('article')].every((a) => a.textContent.includes('Imported')), null, { timeout: 120000 });
  await page.waitForTimeout(500);
  check('Uploading the same files twice does not duplicate records', counts1 === await page.locator('section:has-text("What’s loaded") dl').innerText());
  await page.goto(url + '#/?fw=40'); await page.waitForSelector('text=94.7%');
  t = await main();
  check('Imported files reproduce FW40 (94.7% n=131; 340 calls / 309 cases / +36)', /94\.7%\s*n=131/.test(t) && /340/.test(t) && /309 distinct cases/.test(t) && /\+36 associate/.test(t));

  // 3. Renamed column → mapping dialog → remembered
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Call Date', 'Reason Code', 'Case #', 'Case Notes'], ['11/5/2026', 'Cancel Subscription', 'Z1', 'Problem / Reason for Calling: wants to cancel']]), 'Sheet1');
  const renamed = path.join(tmp, '11.5.2026_HC_Loyalty_Cases_renamed.xlsx'); XLSX.writeFile(wb, renamed);
  await page.goto(url + '#/data'); await page.click('text=Clear imported').catch(() => {});
  await page.setInputFiles('input[aria-label="Choose files to upload"]', renamed);
  await page.waitForSelector('text=Needs column mapping');
  await page.click('article >> text=Map columns');
  await page.selectOption('select[aria-label="Column for Call Driver"]', 'reason code');
  await page.click('text=Apply mapping');
  await page.waitForSelector('article >> text=Ready to import');
  await page.locator('article').first().getByRole('button', { name: /Remove/ }).click();
  await page.setInputFiles('input[aria-label="Choose files to upload"]', renamed);
  await page.waitForSelector('article >> text=Ready to import', { timeout: 15000 });
  check('Renamed column opens the mapping dialog and the mapping is remembered', true);

  // 4. Presentation mode: no PII, no "Show original"
  await page.goto(url + '#/'); await page.waitForTimeout(400);
  await page.click('text=Present');
  let leaks = [], toggles = 0;
  for (let i = 0; i < 11; i++) {
    await page.waitForTimeout(700);
    const body = await page.innerText('body');
    leaks.push(...DEMO_PII.filter((p) => body.includes(p)));
    toggles += await page.locator('text=Show original').count();
    await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.press('Escape');
  check('Presentation mode shows no unredacted text and no “Show original”', !leaks.length && !toggles, leaks.join(', '));

  // 5. WBR export: pre-flight passes; PPTX has one slide, native chart, notes, no PII
  await page.goto(url + '#/wbr?fw=40'); await page.waitForTimeout(1200);
  const pf = await page.locator('text=/Pre-flight ·/').innerText();
  const failing = await page.locator('li:has(span:text-is("✕"))').allInnerTexts();
  check('WBR pre-flight passes on the generated slide', /ready to export/.test(pf), failing.map((x) => x.replace(/\n/g, ' ')).join(' | '));
  const line = page.locator('input[aria-label^="Insight line for"]').first();
  const orig = await line.inputValue();
  await line.fill('x'.repeat(90)); await page.waitForTimeout(200);
  check('Theme lines over 85 characters block export', await page.locator('button:has-text("Download .pptx")').isDisabled());
  await line.fill(orig); await page.waitForTimeout(200);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Download .pptx")')]);
  const pptxPath = path.join(tmp, dl.suggestedFilename()); await dl.saveAs(pptxPath);
  const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath));
  const names = Object.keys(zip.files);
  const xml = (await Promise.all(names.filter((n) => n.endsWith('.xml')).map((n) => zip.file(n).async('string')))).join('\n');
  const notes = await zip.file(names.find((n) => /notesSlide\d+\.xml$/.test(n))).async('string');
  check('PPTX: one slide, native chart, speaker notes', names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length === 1 && names.some((n) => /charts\/chart\d+\.xml$/.test(n)) && notes.includes('Talking points') && notes.includes('Counts are calls, not unique members'));
  check('PPTX contains no unredacted text', !DEMO_PII.some((p) => xml.includes(p)));

  // 6. Keyboard: Ctrl+K palette, skip link, visible focus
  await page.goto(url + '#/'); await page.waitForTimeout(400);
  await page.keyboard.press('Control+k');
  await page.waitForSelector('input[aria-label="Search"]:focus');
  const palette = await page.locator('[role=dialog][aria-label="Command palette"]').count();
  await page.keyboard.type('Detractors'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  check('Ctrl+K opens the command palette and navigates', palette === 1 && page.url().includes('#/detractors'));
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return { tag: e.tagName, outline: s.outlineStyle !== 'none' && s.outlineWidth !== '0px' }; });
  check('Keyboard focus is visible', focus.outline, focus.tag);

  // 7. Network
  const outbound = await page.evaluate(async () => { try { await fetch('https://example.com/'); return 'allowed'; } catch { return 'blocked'; } });
  check('Outbound network is blocked by the content-security policy', outbound === 'blocked');
  check('No network requests made', net.length === 0, net.slice(0, 3).join(', '));
  check('No console errors or warnings', logs.length === 0, logs.slice(0, 3).join(' | '));

  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
