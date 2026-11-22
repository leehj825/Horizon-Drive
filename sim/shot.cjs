const { chromium } = require('playwright');
(async () => {
  const [,, url, out, wait = '1500', w = '1280', h = '720', script] = process.argv;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  const logs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
  await page.goto(url);
  await page.waitForTimeout(+wait);
  if (script) { const r = await page.evaluate(script); if (r !== undefined) console.log('eval:', JSON.stringify(r)); await page.waitForTimeout(600); }
  await page.screenshot({ path: out });
  console.log(logs.slice(0, 12).join('\n') || 'no console errors');
  await browser.close();
})();
