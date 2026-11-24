# Horizon Drive

Stylized arcade racing + light tycoon progression, built with **Three.js + TypeScript + Vite**.
Every race happens in a single biome, and you grow three axes: your **car**, your **modular equipment** and the **location** itself (Lv.1 → Lv.5).

The driving model is ported from the sibling project *Smash Town* (decoupled forward/lateral velocity, handbrake drift, nitro) and extended with track-relative surface logic, walls, boost pads, drift scoring and AI rivals. The original design document is in [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md).

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

* **7 locations with different road layouts:** three city-grid street circuits, a purpose-built **race circuit** (Apex Circuit: kerbs, run-off, tyre walls, grandstands), a three-lane **highway** (Coast Highway: long straights, overpasses, a tunnel, fast traffic), a **rally canyon** of esses and kinks and **mountain switchbacks** (Alpine Pass). Details of the first six:
* **6 biomes** with their own fog/lighting/physics: Harbor Docks (sunset container yards, cranes, lighthouse plaza), Downtown Day (sunny avenues, shop awnings, street trees, square with fountain), Neon Street (a rainy night **city-grid street circuit**: 76 m blocks, 12 m streets, tight 90° corners, a plaza with a fountain, towers hugging the road, neon signs, drift zones), Red Canyon (dirt), Coast Highway (asphalt, causeway, tunnel), Alpine Pass (snow/ice, falling snow). The three city biomes unlock in a chain (Location Lv.2 of the previous one). The open-road tracks are closed `CatmullRomCurve3` splines generated from per-biome harmonics; Neon Street is a rectilinear route over a street grid with rounded corners (`world/gridRoute.ts`, `world/CityBuilder.ts`). Everything downstream (laps, AI, ghosts, traffic) only needs a closed centre line, so more city circuits are just new route specs.
* **Detailed cars and city:** cars are built from rounded side-profile extrusions with glass, trim, five-spoke wheels, door roundels, racing stripes, light glow, neon underglow at night, environment-map reflections (`vehicle/carEnv.ts`) and damage scorching + a cracked windscreen. Traffic uses the same profiles (cached merged geometry). Cities add tinted facades, setback tiers, rooftop AC units/tanks/antennas with blinking beacons, street furniture (hydrants, benches, meters, bus shelters, planters), overhead wires, manholes and patches, and pedestrians strolling the pavements (`world/CityDetail.ts`).
* **4 race events:** Time Attack (3 laps + your own best-lap **ghost**), 1v1 Duel, 4-Car Circuit, and the **Boss Duel** (unlocked at Location Lv.5).
* **3-axis progression** persisted in `localStorage`:
  * Vehicle: Engine, Turbo, Tires, Chassis (Lv.0–5).
  * Equipment: 6 swappable parts that change physics *and* attach a visible mesh to the car's slot groups (`suspensionSlot`, `boosterSlot`, `utilitySlot`).
  * Location Lv.1–5: sponsors/gantry/billboards/streetlights → boost pads → shortcuts (alleys through the city blocks, nitro gates on open roads) → grandstands, jumbotron, fireworks. Payout is ×1.0 / 1.25 / 1.5 / 1.75 / 2.0. Higher levels also unlock the next biome (Lv.2) and the boss duel (Lv.5).
* **Street racing (Neon Street, lighter on Coast Highway):** civilian lane traffic (taxis, vans, sedans) that you must overtake, signalled junctions where **cross traffic** runs the red (the signal heads turn red as a warning), cones and barrels you can plough through, and real crashes: hard hits stun your steering, wreck civilian cars (smoking, hazard lights) and leave them as obstacles. Close passes at speed are **near misses** (nitro + credits). Rivals swerve and brake around traffic.
* **Garage:** four cars (Street Coupe, Rally Hatch, Road Muscle, Neon Hyper) with different shapes and stats, eight paints, plus the vehicle upgrades and equipment.
* **Street extras:** oncoming traffic in the left half of the road, road-closed barricades on side streets, smashable cones, barrels, bins and sign posts, wall-scrape sparks.
* **Onboarding and audio:** first-race how-to-play card; procedural synthwave music per biome plus engine and effects.
* **Gameplay depth:** drift chains (×1–×5), mini-turbo tiers on clean drift exits, slipstream, persistent car damage with garage repairs, rival attitudes (aggressive / clean / blocker), tuning sliders (gearing, downforce), location focus perks (sponsors / racing / safe streets), passive track income, time-attack medals.
* **Events:** Time Attack, 1v1 Duel, 4-Car Circuit, Elimination, Drift Trial, Bomb Run, Fragile Delivery, Pink Slip (win a rival's car), Boss Duel.
* **Variety:** rain / fog / night and reversed circuits, a random-street generator (seeded city circuits), a freight train crossing at the harbor, road works that move every lap, and Lv.4 alley shortcuts through city blocks.
* **Meta game:** Championships (Street Series, Open Road Cup: 3 rounds, 10/6/3/1 points, trophies and prizes), a **Daily Challenge** seeded by the date (same for everyone, offline; modifiers like heavy traffic, oncoming rush, tough rivals; streak bonus), 13 achievements.
* **Settings:** Easy/Normal/Hard difficulty (rival speed, traffic, payout), graphics Auto/High/Low, steering response, field of view, camera shake, volume, touch button size.
* **Cinematics:** race replay with chase / TV / orbit / low cameras and slow motion around crashes, crash slow-mo during the race, tire smoke.
* **Economy:** Credits (CR) + Tech Parts (TP). Near misses, smashed props, coins on track (Credit Magnet pulls them in), placement prizes, drift score, perfect drifts, par time in Time Attack.
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

* Tracks are flat (no elevation) so the 2D-plane physics stay simple and deterministic; Lv.4 "shortcut routes" are cut-through alleys in the city and nitro gates on open roads (the earlier jump ramps were removed: they mostly just crashed cars into walls).
* `loadBiomeScene` in the doc leaked a new set of lights on every call; here each biome owns a root group that is fully disposed on switch.
* `streetLamp` is a Location Lv.2 feature in every biome instead of a base prop.
* Rival strength scales with Location level; the Boss Duel rival is faster than a stock car, so it needs upgrades.

## Store release

`store/` holds everything for a Google Play listing: icon (512), feature graphic, landscape screenshots (regenerate with `node store/make-assets.cjs`), a privacy policy (also in `docs/PRIVACY.md`) and `store-listing.md` with English and Korean descriptions plus a release checklist. The app requests no permissions and collects no data.

## Ideas for later

Elevation and banking, photo mode, online ghosts, more circuit layouts.

## Android pre-release APK

`android/` is a thin full-screen WebView wrapper around the Vite build (same approach as Smash Town): the game is bundled under `assets/www`, served from an https origin so WebGL2, Web Audio and `localStorage` work offline. The Android back button is forwarded to the game as Escape (pause).

GitHub Actions (`.github/workflows/android-debug.yml`) builds it on every push and publishes the APK as a **pre-release** named `apk-<branch>` (replaced by each build). The debug APK is debug-signed (testing only). If the repository has the secrets below, CI also builds a **release-signed APK** (`…-release.apk`) with an increasing `versionCode`.

```bash
# one-time: create a keystore and store it as repository secrets (keep the .jks file and passwords safe!)
keytool -genkeypair -v -keystore horizon-drive.jks -alias horizon -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 horizon-drive.jks | gh secret set ANDROID_KEYSTORE_BASE64
gh secret set ANDROID_KEYSTORE_PASSWORD ; gh secret set ANDROID_KEY_ALIAS ; gh secret set ANDROID_KEY_PASSWORD
```

The game adapts to weak devices on its own: it lowers the render resolution, then turns off bloom and shadows, to hold a steady frame rate. To build locally you need the Android SDK (platform 34), JDK 17 and Gradle 8.9:

```bash
npm ci && npm run build
cd android && gradle assembleDebug   # app/build/outputs/apk/debug/*.apk
```
