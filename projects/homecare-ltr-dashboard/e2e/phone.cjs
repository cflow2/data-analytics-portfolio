/**
 * Phone layout check (iPhone 13 viewport) against the built single file: every screen fits the width
 * (no sideways scrolling), the menu drawer navigates and closes, and the LTR slide opens full screen.
 * Usage: npm run build && node e2e/phone.cjs
 */
const path = require('path');
const { chromium, devices } = require('playwright');

(async () => {
  const url = 'file://' + path.resolve(__dirname, '../dist/index.html');
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const p = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const results = [];
  const check = (name, pass, detail = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
  await p.goto(url + '#/data'); await p.click('text=Load demo data'); await p.waitForSelector('text=/Loaded .* demo surveys/');
  const routes = ['/', '/trends', '/regions', '/detractors', '/attributes', '/voc', '/slide', '/pulse', '/ask', '/review', '/data', '/settings'];
  const wide = [];
  for (const r of routes) {
    await p.goto(url + '#' + r + '?fw=40'); await p.waitForTimeout(900);
    const w = await p.evaluate(() => ({ page: document.documentElement.scrollWidth, main: document.getElementById('main').scrollWidth, vw: document.documentElement.clientWidth, h: document.documentElement.scrollHeight, vh: window.innerHeight }));
    if (w.page > w.vw || w.main > w.vw || w.h > w.vh + 1) wide.push(`${r} (${w.page}/${w.main}px wide, ${w.h}px tall)`);
  }
  check('Every screen fits an iPhone screen (no sideways scrolling)', !wide.length, wide.join(', '));
  await p.click('button[aria-label="Open menu"]');
  await p.getByRole('dialog', { name: 'Menu' }).getByText('LTR Trends').click(); await p.waitForTimeout(300);
  check('Menu drawer navigates and closes', p.url().includes('#/trends') && (await p.getByRole('dialog', { name: 'Menu' }).count()) === 0);
  await p.goto(url + '#/slide?fw=40'); await p.waitForTimeout(900);
  await p.click('text=View full screen'); await p.waitForTimeout(400);
  const full = await p.getByRole('dialog', { name: 'LTR slide, full screen' }).count();
  await p.getByRole('button', { name: 'Close', exact: true }).click();
  check('LTR slide opens full screen and closes', full === 1 && (await p.getByRole('dialog', { name: 'LTR slide, full screen' }).count()) === 0);
  check('No page errors', !errs.length, errs.slice(0, 2).join(' | '));
  await b.close();
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
