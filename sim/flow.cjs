const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:5199/?bloom=0&shadows=0'); await page.waitForTimeout(1500);
  const click = async (sel) => { await page.click(sel); await page.waitForTimeout(400); };
  const st = () => page.evaluate(() => ({ state: window.__hd.state, screen: window.__hd.menus.screen, calls: window.__hd.renderer.info.render.calls, geos: window.__hd.renderer.info.memory.geometries, tex: window.__hd.renderer.info.memory.textures }));
  await click('[data-act=lang][data-arg=ko]');
  console.log('ko main text:', await page.evaluate(() => document.querySelector('.menu-buttons .btn.primary').textContent));
  await click('[data-act=lang][data-arg=en]');
  await click('[data-act=nav][data-arg=race]');
  await click('[data-act=mode][data-arg=circuit]');
  console.log('boss locked:', await page.evaluate(() => document.querySelector('[data-act=mode][data-arg=boss]').classList.contains('lock')));
  await click('[data-act=biome][data-arg=red_canyon]'); // locked: should not change
  console.log('selected after locked click:', await page.evaluate(() => window.__hd.save.data.selectedBiome));
  const g0 = await st();
  await click('[data-act=start]');
  await page.waitForTimeout(6000);
  console.log('racing:', JSON.stringify(await st()));
  await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD'); await page.waitForTimeout(1500); await page.keyboard.up('KeyD');
  console.log('speed after W:', await page.evaluate(() => Math.round(window.__hd.player.speed * 3.6)));
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  console.log('paused:', JSON.stringify(await st()));
  await click('[data-act=resume]');
  console.log('resumed:', (await st()).state);
  await page.keyboard.press('KeyR'); await page.waitForTimeout(300);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await click('[data-act=quit]');
  console.log('after quit:', JSON.stringify(await st()));
  // restart multiple times to check for leaks
  for (let i = 0; i < 3; i++) { await click('[data-act=nav][data-arg=race]'); await click('[data-act=start]'); await page.waitForTimeout(800); await page.keyboard.press('Escape'); await page.waitForTimeout(200); await click('[data-act=quit]'); }
  const g1 = await st();
  console.log('geometries/textures main-menu before vs after 3 race cycles:', g0.geos, g0.tex, '->', g1.geos, g1.tex);
  console.log(errs.length ? errs.join('\n') : 'no page errors');
  await browser.close();
})();
