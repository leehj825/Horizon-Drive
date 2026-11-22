# Horizon Drive

Stylized arcade racing + light tycoon progression, built with **Three.js + TypeScript + Vite**.
Every race happens in a single biome, and you grow three axes: your **car**, your **modular equipment** and the **location** itself (Lv.1 → Lv.5).

The driving model is ported from the sibling project *Smash Town* (decoupled forward/lateral velocity, handbrake drift, nitro, ramps) and extended with track-relative surface logic, walls, boost pads, drift scoring and AI rivals. The original design document is in [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm test           # progression/i18n unit tests + AI lap simulation on all 4 tracks
```

Debug URL flags: `?autostart=neon_street:circuit` (jump into a race), `&level=5` (force a Location level), `&bot=1` (autopilot), `&bloom=0`, `&shadows=0`, `&touch=1` (force touch controls).

## Controls

| Action | Keyboard | Gamepad | Touch |
| :-- | :-- | :-- | :-- |
| Throttle / brake | W S / ↑ ↓ | RT / LT | auto-throttle, BRAKE |
| Steer | A D / ← → | left stick | ◀ ▶ |
| Drift (handbrake) | Space | A / B | DRIFT |
| Nitro | Shift / N | X / RB | NOS |
| Reset on track / Pause / Mute | R / Esc / M | | ⏸ |

**Tip:** drifting is the core mechanic — held drifts fill the nitro bar, a clean drift of 1.1 s+ is a **PERFECT DRIFT**, and neon drift zones double score and nitro gain.

## What is in the game

* **4 biomes** with their own fog/lighting/physics: Neon Street (asphalt, drift zones), Red Canyon (dirt), Coast Highway (asphalt, causeway, tunnel), Alpine Pass (snow/ice, falling snow). Each track is a closed `CatmullRomCurve3`-based spline generated from per-biome harmonics.
* **4 race events:** Time Attack (3 laps + your own best-lap **ghost**), 1v1 Duel, 4-Car Circuit, and the **Boss Duel** (unlocked at Location Lv.5).
* **3-axis progression** persisted in `localStorage`:
  * Vehicle: Engine, Turbo, Tires, Chassis (Lv.0–5).
  * Equipment: 6 swappable parts that change physics *and* attach a visible mesh to the car's slot groups (`suspensionSlot`, `boosterSlot`, `utilitySlot`).
  * Location Lv.1–5: sponsors/gantry/billboards/streetlights → boost pads → jump ramps with bonus coins → grandstands, jumbotron, fireworks. Payout is ×1.0 / 1.25 / 1.5 / 1.75 / 2.0. Higher levels also unlock the next biome (Lv.2) and the boss duel (Lv.5).
* **Economy:** Credits (CR) + Tech Parts (TP). Coins on track (Credit Magnet pulls them in), placement prizes, drift score, perfect drifts, jump bonuses, par time in Time Attack.
* **i18n:** English default, Korean optional, switchable at any time (`src/i18n`). A unit test keeps the EN/KO key sets identical.
* **Polish:** bloom on emissives, skid marks, spark/dust/snow particles, speed/nitro FOV, camera shake, minimap, Web Audio engine + SFX, touch controls, pause, wrong-way hint.

## Project layout

```text
src/
  main.ts, game.ts            bootstrap, fixed-step (120 Hz) loop, state machine
  data/                       biomes, equipment, upgrades, progression (pure rules), saveState
  i18n/                       EN/KO dictionaries + helper
  world/                      Track (spline queries), TrackBuilder (road, walls, props, Lv.2–5),
                              BiomeLoader (sky/fog/lights), PropFactory, Coins, textures
  vehicle/                    CarController (arcade physics), CarMeshBuilder (procedural car + slots)
  race/                       RaceManager (grid, laps, ranking, collisions), AIDriver, Ghost
  camera/, input/, audio/, fx/, ui/
sim/                          headless simulations + browser smoke scripts (Playwright)
```

## Notes and deliberate deviations from the design doc

* Tracks are flat (no elevation) so the 2D-plane physics stay simple and deterministic; "shortcut routes" at Lv.4 are optional jump ramps with bonus-coin arcs rather than separate branching roads.
* `loadBiomeScene` in the doc leaked a new set of lights on every call; here each biome owns a root group that is fully disposed on switch.
* `streetLamp` is a Location Lv.2 feature in every biome instead of a base prop.
* Rival strength scales with Location level; the Boss Duel rival is faster than a stock car, so it needs upgrades.

## Ideas for later

Elevation and banking, a real drift-chain combo system, slipstream on Coast Highway, daily seeded tracks, replay/photo mode, online ghosts.

## Android pre-release APK

`android/` is a thin full-screen WebView wrapper around the Vite build (same approach as Smash Town): the game is bundled under `assets/www`, served from an https origin so WebGL2, Web Audio and `localStorage` work offline. The Android back button is forwarded to the game as Escape (pause).

GitHub Actions (`.github/workflows/android-debug.yml`) builds it on every push and publishes the APK as a **pre-release** named `apk-<branch>` (replaced by each build). It is debug-signed, so it is for testing, not the Play Store. To build locally you need the Android SDK (platform 34), JDK 17 and Gradle 8.9:

```bash
npm ci && npm run build
cd android && gradle assembleDebug   # app/build/outputs/apk/debug/*.apk
```
