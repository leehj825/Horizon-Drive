// Generates the Play Store graphics: icon-512.png, feature-1024x500.png and landscape screenshots.
// Needs the dev server on :5199 and Playwright (global). Run: node store/make-assets.cjs
const { chromium } = require('playwright');
const path = require('path');
const out = (f) => path.join(__dirname, f);

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="512" height="512">
  <rect width="108" height="108" fill="#0B0D1C"/><rect width="108" height="62" fill="#2A1450"/>
  <rect y="62" width="108" height="3" fill="#FF3FA6"/><rect y="65" width="108" height="43" fill="#181B2C"/>
  <path d="M12,108 L40,65 L44,65 L22,108z M96,108 L68,65 L64,65 L86,108z" fill="#19E6FF"/>
  <path fill="#FF5A36" d="M34,70 L36,60 Q38,55 45,55 L63,55 Q70,55 72,60 L74,70 L74,76 L34,76 Z"/>
  <path fill="#1D2A3C" d="M42,57 L66,57 L68,63 L40,63 Z"/><path fill="#19E6FF" d="M38,53 h32 v3 h-32z"/>
  <path fill="#FF2230" d="M37,66 h8 v4 h-8z M63,66 h8 v4 h-8z"/><path fill="#15171F" d="M33,72 h6 v8 h-6z M69,72 h6 v8 h-6z"/></svg>`;

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
  // icon (512x512, no transparency as Play requires)
  let page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await page.setContent(`<body style="margin:0">${ICON_SVG}</body>`);
  await page.screenshot({ path: out('icon-512.png') });
  await page.close();

  const shots = [
    ['01-neon-street', 'autostart=neon_street:circuit&level=3&bot=1', 14],
    ['02-harbor', 'autostart=harbor_docks:circuit&level=3&bot=1', 22],
    ['03-downtown', 'autostart=downtown_day:circuit&level=3&bot=1', 20],
    ['04-canyon', 'autostart=red_canyon:circuit&level=5&bot=1', 14],
    ['05-coast', 'autostart=coast_highway:circuit&level=5&bot=1', 14],
  ];
  const only = process.argv[2];
  for (const [name, q, t] of shots) {
    if (only && !name.includes(only)) continue;
    page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.addInitScript(() => localStorage.setItem('hd_save_v1', JSON.stringify({ v: 1, tutorialSeen: true, tipShown: true, lang: 'en' })));
    await page.goto(`http://localhost:5199/?${q}`); await page.waitForTimeout(2500);
    await page.evaluate((T) => {
      const g = window.__hd; const DT = 1 / 120; let n = 0;
      while (g.race.time < T && n++ < 120 * 120) { g.autopilot.others = g.race.everyone; g.race.step(DT, g.autopilot.update(g.player, DT), g.fx, null); }
      g.rig.snap(); for (let i = 0; i < 40; i++) g.rig.update(0.016, g.player);
    }, t);
    await page.waitForTimeout(9000);
    await page.screenshot({ path: out(`screenshots/${name}.png`), timeout: 120000 });
    await page.close();
    console.log('shot', name);
  }
  // garage + championship menus
  page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.addInitScript(() => localStorage.setItem('hd_save_v1', JSON.stringify({ v: 1, tutorialSeen: true, tipShown: true, lang: 'en', credits: 4200, car: 'hyper', carsOwned: ['coupe', 'hyper'], paint: 1, locations: { neon_street: 3, harbor_docks: 2, downtown_day: 1, red_canyon: 1, coast_highway: 1, alpine_pass: 1 } })));
  await page.goto('http://localhost:5199/?bloom=1'); await page.waitForTimeout(3000);
  await page.click('[data-act=nav][data-arg=garage]'); await page.waitForTimeout(6000);
  await page.screenshot({ path: out('screenshots/06-garage.png'), timeout: 120000 });
  await page.close();

  // feature graphic 1024x500: title over a street screenshot
  page = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  const bg = 'data:image/png;base64,' + require('fs').readFileSync(out('screenshots/01-neon-street.png')).toString('base64');
  await page.setContent(`<body style="margin:0;width:1024px;height:500px;position:relative;overflow:hidden;font-family:system-ui,sans-serif;background:#0b0d1c">
    <img src="${bg}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:brightness(0.75) saturate(1.2)">
    <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(11,13,28,0.92) 0%,rgba(11,13,28,0.35) 60%,transparent)"></div>
    <div style="position:absolute;left:56px;top:150px;color:#fff"><div style="font-size:84px;font-weight:900;font-style:italic;letter-spacing:2px;line-height:0.95;background:linear-gradient(90deg,#19e6ff,#ff3fa6);-webkit-background-clip:text;color:transparent">HORIZON<br>DRIVE</div>
    <div style="margin-top:18px;font-size:26px;color:#cfd6f5;letter-spacing:1px">Drift. Boost. Build the track.</div></div></body>`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: out('feature-1024x500.png') });
  await browser.close();
})();
