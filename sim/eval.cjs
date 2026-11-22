const { chromium } = require('playwright');
(async () => {
  const [,, url, script] = process.argv;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(url); await page.waitForTimeout(1500);
  console.log(JSON.stringify(await page.evaluate(script)).slice(0, 3000));
  await browser.close();
})();
