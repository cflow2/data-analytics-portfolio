/**
 * Accessibility audit (axe-core) of every screen, light and dark, against the built single file.
 * Usage: npm run build && node e2e/a11y.cjs   (needs Playwright: `npx playwright install chromium` once)
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const ROUTES = ['/', '/trends', '/regions', '/detractors', '/attributes', '/voc', '/slide', '/pulse', '/ask', '/review', '/data', '/settings'];

(async () => {
  const html = path.resolve(__dirname, '../dist/index.html');
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const url = 'file://' + html;
  await page.goto(url + '#/data');
  await page.click('text=Load demo data');
  await page.waitForSelector('text=/Loaded .* demo surveys/');
  let serious = 0;
  for (const theme of ['light', 'dark']) {
    for (const r of ROUTES) {
      await page.goto(url + '#' + r);
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await page.waitForTimeout(900);
      await page.addScriptTag({ content: AXE });
      const res = await page.evaluate(async () => {
        const out = await axe.run(document, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
        return out.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, targets: v.nodes.slice(0, 3).map((x) => x.target.join(' ') + (x.any[0]?.message ? ` — ${x.any[0].message.slice(0, 140)}` : '')) }));
      });
      const bad = res.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      serious += bad.length;
      console.log(`${theme.padEnd(5)} ${r.padEnd(12)} ${bad.length ? 'FAIL' : 'ok  '} ${res.map((v) => `${v.id}(${v.impact}×${v.n})`).join(' ')}`);
      for (const v of bad) v.targets.forEach((t) => console.log(`        ${v.id}: ${t}`));
    }
  }
  await browser.close();
  console.log(serious ? `\n${serious} serious/critical violation group(s)` : '\nNo serious or critical violations');
  process.exit(serious ? 1 : 0);
})();
