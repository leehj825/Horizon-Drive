// Runs full bot races headlessly inside the real game (no rendering between steps) and prints results.
const { chromium } = require('playwright');
(async () => {
  const [,, base = 'http://localhost:5199/'] = process.argv;
  const errs = [];
  for (const spec of [['neon_street', 'circuit', 4], ['harbor_docks', 'elimination', 4], ['downtown_day', 'delivery', 4], ['coast_highway', 'time_attack', 3]]) {
    const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.on('pageerror', (e) => errs.push(spec[0] + ' PAGEERROR: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(spec[0] + ' ' + m.text()); });
    await page.addInitScript(() => localStorage.setItem('hd_save_v1', JSON.stringify({ v: 1, tutorialSeen: true, tipShown: true, credits: 5000 })));
    await page.goto(`${base}?autostart=${spec[0]}:${spec[1]}&bot=1&level=${spec[2]}${spec[3] || ''}&bloom=0&shadows=0`);
    await page.waitForTimeout(1500);
    const res = await page.evaluate(() => {
      const g = window.__hd;
      const out = { steps: 0 };
      const DT = 1 / 120;
      let guard = 0;
      while (g.race.phase !== 'finished' && guard++ < 120 * 600) {
        g.autopilot.others = g.race.everyone;
        const ctl = g.autopilot.update(g.player, DT);
        g.race.step(DT, ctl, null, null);
        g.afterRaceStep && 0;
      }
      out.phase = g.race.phase; out.time = +g.race.time.toFixed(1);
      out.racers = g.race.racers.map((r) => ({ n: r.name, rank: r.rank, laps: r.car.lap, fin: r.finished, ft: +r.finishTime.toFixed(1), best: +r.bestLap.toFixed(1), wall: r.car.wallHits }));
      out.pending = !!g.pendingResults; out.failed = g.race.failed; out.cargo = +g.race.cargo.toFixed(2); out.bomb = +g.race.bomb.toFixed(2); out.score = Math.round(g.player.driftScore); out.res = g.pendingResults && { pos: g.pendingResults.position, medal: g.pendingResults.medal, slip: g.pendingResults.slip, cr: g.pendingResults.payout.credits, lines: g.pendingResults.payout.lines.map((l) => l.key + ':' + l.value).join(',') };
      out.traffic = g.race.traffic ? { cars: g.race.traffic.cars.length, wrecked: g.race.traffic.cars.filter((t) => t.wrecked).length } : null;
      out.nearMisses = g.race.nearMisses; out.smashed = g.world.props.smashed;
      // let the results screen appear via the normal tick path
      for (let i = 0; i < 400; i++) g.tick(1 / 60);
      out.state = g.state;
      out.payout = g.pendingResults && g.pendingResults.payout.credits;
      out.save = { cr: g.save.data.credits, tp: g.save.data.techParts, ghost: !!g.save.data.ghosts[g.lastBiome], best: g.save.data.bestTimes };
      return out;
    });
    console.log(spec.join(':'), JSON.stringify(res));
    await browser.close();
  }
  console.log(errs.length ? errs.join('\n') : 'no page errors');
})();
