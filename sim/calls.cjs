const { chromium } = require('playwright');
(async () => {
  const urls = process.argv.slice(2);
  for (const u of urls) {
    const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    await page.goto(u); await page.waitForTimeout(5000);
    const r = await page.evaluate(() => { const g = window.__hd; const i = g.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, prog: i.programs.length }; });
    console.log(u.split('?')[1], JSON.stringify(r));
    await browser.close();
  }
})();
