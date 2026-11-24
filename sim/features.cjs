const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:5199/?bloom=0&shadows=0'); await page.waitForTimeout(1500);
  const click = async (sel) => { await page.click(sel); await page.waitForTimeout(250); };
  // --- settings
  await click('[data-act=nav][data-arg=settings]');
  await click('[data-act=setDiff][data-arg=hard]');
  await page.evaluate(() => { const el = document.querySelector('[data-set=steer]'); el.value = '1.3'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const st = await page.evaluate(() => ({ s: window.__hd.save.data.settings, sens: window.__hd.input.sensitivity }));
  console.log('settings:', JSON.stringify(st));
  await page.screenshot({ path: process.argv[2] + '/settings.png' });
  await click('[data-act=setDiff][data-arg=normal]');
  // --- unlock all biomes for championships
  await page.evaluate(() => { const d = window.__hd.save.data; for (const k of Object.keys(d.locations)) d.locations[k] = 2; d.credits = 1000; window.__hd.save.save(); });
  const finish = () => page.evaluate(() => {
    const g = window.__hd; const DT = 1 / 120; let n = 0;
    while (g.race.phase !== 'finished' && n++ < 120 * 400) { g.autopilot.others = g.race.everyone; g.race.step(DT, g.autopilot.update(g.player, DT), null, null); }
    for (let i = 0; i < 600 && g.state === 'race'; i++) g.tick(1 / 60);
    return { state: g.state, screen: g.menus.screen };
  });
  const enableBot = () => page.evaluate(async () => { const g = window.__hd; const M = await import('/src/race/AIDriver.ts'); g.autopilot = new M.AIDriver(0.97, 0); g.autopilot.avoid = 'swerve'; });
  await enableBot();
  // --- championship round 1
  await click('[data-act=nav][data-arg=main]');
  await click('[data-act=nav][data-arg=race]'); await click('[data-act=tab][data-arg=champ]');
  await page.screenshot({ path: process.argv[2] + '/champ.png' });
  await click('[data-act=startChamp][data-arg=street_series]');
  console.log('champ r1 biome:', await page.evaluate(() => window.__hd.lastBiome), JSON.stringify(await finish()));
  console.log('standings shown:', await page.evaluate(() => document.querySelector('.board')?.textContent));
  await page.screenshot({ path: process.argv[2] + '/results_champ.png' });
  // --- replay
  console.log('replay btn:', await page.evaluate(() => !!document.querySelector('[data-act=replay]')));
  await click('[data-act=replay]');
  const rp = await page.evaluate(() => { const g = window.__hd; const out = { st: g.state }; for (let i = 0; i < 90; i++) g.tick(1 / 30); out.t = g.replayT; out.st2 = g.state; out.crashes = g.race.replay.crashes.length; out.dur = g.race.replay.duration; return out; });
  console.log('replay:', JSON.stringify(rp));
  await page.evaluate(() => window.__hd.exitReplay(true));
  console.log('after replay:', await page.evaluate(() => ({ st: window.__hd.state, screen: window.__hd.menus.screen })));
  // --- continue round 2
  await click('[data-act=startChamp][data-arg=street_series]');
  console.log('champ r2 biome:', await page.evaluate(() => window.__hd.lastBiome), JSON.stringify(await finish()));
  console.log('progress:', JSON.stringify(await page.evaluate(() => window.__hd.save.data.champs)));
  // --- daily
  await click('[data-act=nav][data-arg=quit]').catch(() => {});
  await page.evaluate(() => window.__hd.quit());
  await page.waitForTimeout(500);
  await click('[data-act=nav][data-arg=race]'); await click('[data-act=tab][data-arg=daily]');
  await page.screenshot({ path: process.argv[2] + '/daily.png' });
  await enableBot();
  await click('[data-act=startDaily]');
  console.log('daily biome:', await page.evaluate(() => window.__hd.lastBiome), JSON.stringify(await finish()));
  console.log('daily save:', await page.evaluate(() => JSON.stringify({ daily: window.__hd.save.data.daily, streak: window.__hd.save.data.dailyStreak, ach: window.__hd.save.data.achievements, stats: window.__hd.save.data.stats })));
  await page.evaluate(() => window.__hd.quit()); await page.waitForTimeout(400);
  await click('[data-act=nav][data-arg=achievements]');
  await page.screenshot({ path: process.argv[2] + '/ach.png' });
  console.log(errs.length ? errs.join('\n') : 'no page errors');
  await browser.close();
})();
