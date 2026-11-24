const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:5199/?bloom=0&shadows=0'); await page.waitForTimeout(1500);
  await page.click('[data-act=nav][data-arg=race]'); await page.waitForTimeout(300);
  await page.click('[data-act=start]'); await page.waitForTimeout(1500);
  console.log('tutorial shown:', await page.evaluate(() => !!document.getElementById('tutorial')), 'race time while held:', await page.evaluate(() => window.__hd.race.time));
  await page.screenshot({ path: process.argv[2] });
  await page.click('#tutorial button'); await page.waitForTimeout(3000);
  console.log('after dismiss:', await page.evaluate(() => ({ el: !!document.getElementById('tutorial'), phase: window.__hd.race.phase, seen: window.__hd.save.data.tutorialSeen, music: !!window.__hd.music })));
  console.log(errs.join('\n') || 'no page errors');
  await browser.close();
})();
