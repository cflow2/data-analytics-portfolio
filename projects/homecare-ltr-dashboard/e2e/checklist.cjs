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
  for (const r of ['/', '/trends', '/regions', '/detractors', '/attributes', '/subscriptions', '/voc', '/slide', '/pulse', '/ask']) {
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
  check('Command Center shows the week in progress (FW41 so far, n=12)', /FW41 so far · Nov 7–Nov 8 \(2 days\) · current week/i.test(t) && /83\.3%\s*n=12/.test(t), (t.match(/FW41 so far[^\n]*/i) ?? [""])[0]);

  // 2. Demo source files → import → same numbers; re-upload no duplicates
  const files = [];
  page.on('download', async (d) => { const p = path.join(tmp, d.suggestedFilename()); await d.saveAs(p); files.push(p); });
  await page.goto(url + '#/data');
  await page.click('text=Demo source files'); await page.waitForSelector('text=/Downloaded \\d+ demo source files/', { timeout: 30000 }); await page.waitForTimeout(800);
  await page.click('text=Remove demo'); await page.waitForSelector('text=/Demo data removed/');
  const t0 = Date.now();
  await page.setInputFiles('input[aria-label="Choose files to upload"]', files);
  await page.waitForFunction((n) => document.querySelectorAll('article').length >= n && ![...document.querySelectorAll('article')].some((a) => a.textContent.includes('Reading…')), files.length, { timeout: 120000 });
  check(`${files.length} demo source files parse without errors`, files.length >= 5 && (await page.locator('article >> text=Ready to import').count()) === files.length, `${Date.now() - t0} ms`);
  await page.click('text=/Import all ready/');
  await page.waitForFunction(() => [...document.querySelectorAll('article')].every((a) => a.textContent.includes('Imported')), null, { timeout: 120000 });
  check('No Loyalty Cases (call) files are offered or imported', !files.some((f) => /Loyalty/i.test(f)));
  await page.waitForFunction((n) => new RegExp('Files\\s*' + n).test(document.querySelector('main')?.innerText ?? ''), files.length, { timeout: 10000 }).catch(() => {});
  const counts1 = await page.locator('section:has-text("What’s loaded") dl').innerText();
  await page.click('text=Clear imported');
  const again = files.filter((f) => /Tracker|FW40/.test(f));
  await page.setInputFiles('input[aria-label="Choose files to upload"]', again);
  await page.waitForFunction((n) => document.querySelectorAll('article').length === n && ![...document.querySelectorAll('article')].some((a) => a.textContent.includes('Reading…')), again.length, { timeout: 120000 });
  await page.click('text=/Import all ready/');
  await page.waitForFunction(() => [...document.querySelectorAll('article')].every((a) => a.textContent.includes('Imported')), null, { timeout: 120000 });
  await page.waitForTimeout(500);
  const counts2 = await page.locator('section:has-text("What’s loaded") dl').innerText();
  check('Uploading the same files twice does not duplicate records', counts1 === counts2, counts1 === counts2 ? '' : `${counts1.replace(/\n/g, ' ')} → ${counts2.replace(/\n/g, ' ')}`);
  await page.goto(url + '#/?fw=40'); await page.waitForSelector('text=94.7%');
  t = await main();
  check('Imported files reproduce FW40 (94.7% n=131) with no call KPIs', /94\.7%\s*n=131/.test(t) && !/Customer calls|Cancellations/.test(t));

  // 3. Renamed column → mapping dialog → remembered
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['date', 'rating', 'comment'], ['11/5/2026', 9, 'Great visit']]), 'Sheet1');
  const renamed = path.join(tmp, 'Customer_Commentary_renamed.xlsx'); XLSX.writeFile(wb, renamed);
  await page.goto(url + '#/data'); await page.click('text=Clear imported').catch(() => {});
  await page.setInputFiles('input[aria-label="Choose files to upload"]', renamed);
  await page.waitForSelector('text=Needs column mapping');
  await page.click('article >> text=Map columns');
  await page.selectOption('select[aria-label="Column for score"]', 'rating');
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

  // 4b. Division and Associate filters (demo appointment file links surveys to associates)
  await page.goto(url + '#/?fw=40&div=WEST'); await page.waitForTimeout(700);
  const westText = await main();
  const assocOptions = await page.locator('select[aria-label="Associate"], label:has-text("Associate") select').first().locator('option').count().catch(() => 0);
  check('Division filter narrows Command Center; Associate filter lists the demo associates', /Filtered to West/.test(westText) && assocOptions > 2, `associate options ${assocOptions}`);
  await page.goto(url + '#/voc?fw=40'); await page.waitForTimeout(700);
  const voc = await main();
  check('VOC Themes shows where LTR points went and services members want added', /Where LTR points went/.test(voc) && /Services members want added/.test(voc) && /Tankless water heater/.test(voc));

  // 4c. Store manager email for a detractor (composer, preview, copy)
  await page.goto(url + '#/detractors?fw=40'); await page.waitForTimeout(800);
  await page.locator('button:has-text("Email SM")').first().click(); await page.waitForTimeout(500);
  const preview = await page.innerText('[data-testid="sm-email-preview"]');
  await page.click('button:has-text("Copy for Outlook")'); await page.waitForTimeout(400);
  const copiedMsg = await page.locator('[role="dialog"] [role="status"]').innerText();
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const copiedMark = await page.locator('text=/^Copied [A-Z][a-z]{2} \\d/').count();
  check('Email SM builds the store manager email (score, customer, phone, associate, Job ID, exact quote) and copies it',
    /^Hi (\w+|\[SM first name\]),/.test(preview) && /We received a \d LTR detractor from DEMO \w+ \w+ following a HomeCare\+ appointment on \d\d\/\d\d\/\d\d with DEMO/.test(preview)
      && /Customer Information/.test(preview) && /Job ID: DEMO-J-/.test(preview) && /Associate: DEMO/.test(preview) && /(555-\d{3}-\d{4}|\[Customer phone\])/.test(preview)
      && /Thank You,/.test(preview) && /copied/i.test(copiedMsg) && copiedMark > 0, preview.split('\n').slice(0, 3).join(' | '));

  // 5. Daily Pulse is built from surveys
  await page.goto(url + '#/pulse'); await page.waitForTimeout(600);
  const pulse = (await main()) + (await page.innerText('[data-testid="pulse-script"]'));
  check('Daily Pulse includes subscriptions (weekend, week to date, same point last week)', /Subscriptions · FW41 day 2/.test(pulse) && /Same point last week/.test(pulse) && /Over the weekend we finished with -?\d+ net new subscriptions/.test(pulse), pulse.match(/Over the weekend we finished with -?\d+ net[^.]*\./)?.[0] ?? '');
  await page.goto(url + '#/subscriptions'); await page.waitForTimeout(800);
  const subsText = await main();
  check('Subscriptions screen: weekly chart, top in-store stores, LTR relationships', /Net subscriptions by week/.test(subsText) && /Most in-store subscriptions/.test(subsText) && /Weeks with a follow-up required score lower/.test(subsText));
  check('Pace vs last week shown on the Subscriptions screen and in the Pulse; red bars below the average', /(On pace to (beat|match)|Behind pace for|has already passed) FW40/.test(subsText) && /Red bars: weeks below the average to date/.test(subsText) && /(On pace to (beat|match)|Behind pace for|has already passed) FW40/.test(pulse));
  await page.goto(url + '#/pulse'); await page.waitForTimeout(400);
  check('Daily Pulse script is built from surveys (no call counts)', /we finished with \d+ surveys?/.test(pulse) && !/customer calls?|cancellation calls?/i.test(pulse), pulse.slice(0, 120).replace(/\n/g, ' '));
  const script = await page.innerText('[data-testid="pulse-script"]');
  const title = await page.locator('h2:has-text("Pulse script"), h3:has-text("Pulse script")').first().innerText().catch(() => '');
  const words = Number(title.match(/(\d+) words/)?.[1] ?? 999);
  check('Pulse follows the structure (opening, customer experience, subscriptions, things to watch) in two minutes or less',
    /^Good morning! Here’s your HomeCare\+ Pulse for Monday, November 9/.test(script) && /Customer experience/.test(script) && /Things to watch today/.test(script)
      && (await page.locator('[data-testid="pulse-script"] b').count()) > 5 && words <= 300, `${words} words · ${title}`);
  await page.fill('input[aria-label="Meeting date"]', '2026-11-06'); await page.waitForTimeout(500);
  const fri = await page.innerText('[data-testid="pulse-script"]');
  check('Friday Pulse adds the week recap (Saturday through Thursday)', /Week recap, FW40/.test(fri) && /Saturday through Thursday, FW40 is at \d+\.\d%/.test(fri), fri.match(/Saturday through[^.]*\./)?.[0] ?? '');

  // 5b. LTR slide: native combo + drivers charts, talk track with back pocket, iPad-safe parts, PNG at 3840×2160
  await page.goto(url + '#/slide?fw=40'); await page.waitForTimeout(1500);
  const [sdl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Download .pptx")')]);
  const sp = path.join(tmp, sdl.suggestedFilename()); await sdl.saveAs(sp);
  const sz = await JSZip.loadAsync(fs.readFileSync(sp)); const sn = Object.keys(sz.files);
  const charts = await Promise.all(sn.filter((n) => /charts\/chart\d+\.xml$/.test(n)).map((n) => sz.file(n).async('string')));
  const snotes = await sz.file(sn.find((n) => /notesSlide\d+\.xml$/.test(n))).async('string');
  const sxml = (await Promise.all(sn.filter((n) => n.endsWith('.xml')).map((n) => sz.file(n).async('string')))).join('\n');
  check('LTR slide PPTX: combo chart (bar + line on a secondary axis), drivers chart, talk track + back pocket',
    charts.length === 2 && charts.some((c) => c.includes('<c:barChart>') && c.includes('<c:lineChart>') && (c.match(/<c:valAx>/g) || []).length === 2) && snotes.includes('TALK TRACK') && snotes.includes('BACK POCKET'));
  check('LTR slide PPTX has no comment parts and no unredacted text', !sn.some((n) => /comment/i.test(n)) && !DEMO_PII.some((x) => sxml.includes(x)));
  const [pdl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("PNG 1920")')]);
  const pp = path.join(tmp, 'slide.png'); await pdl.saveAs(pp);
  const png = fs.readFileSync(pp);
  check('LTR slide PNG is 3840×2160', png.readUInt32BE(16) === 3840 && png.readUInt32BE(20) === 2160, `${png.readUInt32BE(16)}×${png.readUInt32BE(20)}`);

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
