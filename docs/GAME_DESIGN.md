# Horizon Drive — Game Design Document & Three.js Architecture

> **Genre:** Stylized Arcade Racing + Light Tycoon Progression  
> **Platform:** Web (Three.js / WebGL, Desktop & Mobile)  
> **Primary Language:** English (`en`) with Optional Korean Localization (`ko`)

---

## 1. Concept Overview

**Horizon Drive** is an arcade racing game where each race takes place in a **single, distinct biome**—ranging from tight neon-lit urban streets to wide-open canyons, coastal highways, and alpine passes. Focusing on one biome per race maximizes WebGL performance while making every location feel visually and mechanically unique.

### Core Game Loop
1. **Select Location & Event:** Choose a biome and race mode (*Time Attack*, *1v1 Duel*, or *4-Car Circuit*).
2. **Equip & Tune:** Swap modular car parts suited to the selected biome's surface and gimmicks.
3. **Race:** Drift, boost, and hit track pads to finish first and earn **Credits (`CR`)** and **Tech Parts**.
4. **3-Axis Progression:** Invest rewards into:
   - **Vehicle Upgrades** (Base stats)
   - **Modular Equipment** (Swappable tactical parts with visual 3D attachments)
   - **Location Upgrades** (Evolving the track itself from Lv. 1 to Lv. 5)
5. **Unlock Higher Tiers:** Upgrading locations unlocks higher-stakes events, boss duels, and new biomes.

---

## 2. Biomes (Locations)

Each biome alters **road width, surface friction, physics gimmicks, and Three.js lighting/fog presets**.

| Biome ID | Display Name (EN / KO) | Surface & Layout | Core Gimmick | Visual Palette |
| :--- | :--- | :--- | :--- | :--- |
| `neon_street` | **Neon Street** / 네온 스트릿 | Narrow asphalt, tight hairpins | Traffic intersections, high-score drift zones | Deep midnight blue, magenta/cyan neon, wet reflections |
| `red_canyon` | **Red Canyon** / 레드 캐니언 | Wide dirt road, sweeping bends | Dust gusts, natural rock jumps | Sunset orange, terracotta mesas, golden fog |
| `coast_highway` | **Coast Highway** / 코스트 하이웨이 | Broad straights, tunnels | Top-speed slipstreams, ocean crosswinds | Clear sky blue, turquoise sea, palm silhouettes |
| `alpine_pass` | **Alpine Pass** / 알파인 패스 | Icy tarmac & snow, steep elevation | Slippery ice patches, downhill braking zones | Crisp ice blue, pine green, falling snow particles |

---

## 3. 3-Axis Progression System

### 3.1 Vehicle Base Upgrades
Permanent stat improvements purchased with Credits (`CR`):
- **Engine:** Increases top speed.
- **Turbo:** Increases acceleration and Nitro recharge rate.
- **Tires:** Improves cornering grip and drift stability.
- **Chassis:** Reduces collision speed penalty and improves jump landing recovery.

### 3.2 Modular Equipment (Swappable Parts)
Equipped per race depending on the biome. Each part attaches a visible low-poly mesh to dedicated `THREE.Group` slots on the car.

| Slot | Item ID | Name (EN / KO) | Effect | Recommended Biome |
| :--- | :--- | :--- | :--- | :--- |
| **Suspension** | `susp_street` | Street Low-Kit / 스트릿 로우킷 | +20% Asphalt Grip | Neon Street, Coast Highway |
| **Suspension** | `susp_offroad` | Off-Road Lift / 오프로드 리프트 | Ignores Dirt & Snow slowdown | Red Canyon, Alpine Pass |
| **Aero / Boost** | `boost_twin` | Twin Nitro Tank / 트윈 니트로 탱크 | +35% Boost duration | Coast Highway |
| **Aero / Boost** | `boost_drift` | Drift Charger / 드리프트 차저 | 2x Nitro gain while drifting | Neon Street, Alpine Pass |
| **Utility** | `util_magnet` | Credit Magnet / 크레딧 마그넷 | Auto-collects nearby track coins | All |
| **Utility** | `util_bumper` | Shockwave Bumper / 충격파 범퍼 | Pushes rivals away on impact | 4-Car Circuit, 1v1 Duel |

### 3.3 Location Upgrades (Track Infrastructure)
Players invest in each biome individually to upgrade its rewards, track features, and 3D scenery.

| Level | Tier Name (EN / KO) | Gameplay & Economy Bonus | 3D Scene Additions (Three.js) |
| :---: | :--- | :--- | :--- |
| **Lv. 1** | Raw Track / 기본 도로 | Base payout (`1.0x`), standard props | Basic terrain, trees/rocks, road mesh |
| **Lv. 2** | Sponsored / 스폰서 유치 | Payout `+25%` | Start gantry, billboards, streetlights |
| **Lv. 3** | Boost Grid / 부스트 인프라 | Spawns glowing **Boost Pads** on track | Emissive chevron pads along spline |
| **Lv. 4** | Shortcut Routes / 지름길 개방 | Unlocks **Jump Ramps** & risk/reward shortcuts | Ramp meshes, holographic guide arrows |
| **Lv. 5** | Grand Festival / 그랜드 페스티벌 | Payout `+100%`, unlocks **Biome Boss Duel** | Grandstands, fireworks particles, jumbotrons |

---

## 4. Localization Architecture (`i18n` — EN Default / KO Optional)

The game runs in **English by default** and supports instant language switching to **Korean** via a lightweight dictionary module.

```javascript
// src/i18n/translations.js
export const TRANSLATIONS = {
  en: {
    ui: {
      play: "RACE",
      garage: "GARAGE",
      locations: "LOCATIONS",
      upgrade: "UPGRADE",
      equip: "EQUIP",
      equipped: "EQUIPPED",
      credits: "CR",
      language: "Language",
      locationLevel: "Track Lv.",
      payoutBonus: "Payout Bonus",
      perfectDrift: "PERFECT DRIFT!",
      boostReady: "NITRO READY"
    },
    biomes: {
      neon_street: { name: "Neon Street", desc: "Tight midnight avenues lit by cyber neon." },
      red_canyon: { name: "Red Canyon", desc: "Wide sunlit dirt trails through towering mesas." },
      coast_highway: { name: "Coast Highway", desc: "High-speed oceanfront straights and tunnels." },
      alpine_pass: { name: "Alpine Pass", desc: "Treacherous icy switchbacks in the high peaks." }
    },
    equipment: {
      susp_street: { name: "Street Low-Kit", desc: "+20% grip on asphalt roads." },
      susp_offroad: { name: "Off-Road Lift", desc: "Eliminates dirt and snow speed penalties." },
      boost_twin: { name: "Twin Nitro Tank", desc: "Extends boost duration by 35%." },
      boost_drift: { name: "Drift Charger", desc: "Doubles nitro recharge while drifting." }
    }
  },
  ko: {
    ui: {
      play: "레이스 시작",
      garage: "차고",
      locations: "장소 선택",
      upgrade: "업그레이드",
      equip: "장착",
      equipped: "장착됨",
      credits: "크레딧",
      language: "언어 설정",
      locationLevel: "트랙 Lv.",
      payoutBonus: "상금 보너스",
      perfectDrift: "퍼펙트 드리프트!",
      boostReady: "니트로 준비 완료"
    },
    biomes: {
      neon_street: { name: "네온 스트릿", desc: "네온 불빛이 가득한 밤의 도심 급커브 코스." },
      red_canyon: { name: "레드 캐니언", desc: "거대한 붉은 협곡을 가로지르는 광활한 비포장 도로." },
      coast_highway: { name: "코스트 하이웨이", desc: "에메랄드빛 해안을 따라 달리는 초고속 직선 코스." },
      alpine_pass: { name: "알파인 패스", desc: "미끄러운 빙판과 설원이 펼쳐진 산악 다운힐 코스." }
    },
    equipment: {
      susp_street: { name: "스트릿 로우킷", desc: "아스팔트 노면 접지력 +20% 증가." },
      susp_offroad: { name: "오프로드 리프트", desc: "비포장 및 눈길 감속 페널티 무시." },
      boost_twin: { name: "트윈 니트로 탱크", desc: "부스터 지속 시간 35% 증가." },
      boost_drift: { name: "드리프트 차저", desc: "드리프트 중 니트로 충전 속도 2배." }
    }
  }
};

// Simple Localization Helper
export class I18n {
  constructor(defaultLang = "en") {
    this.lang = localStorage.getItem("hd_lang") || defaultLang;
  }

  setLanguage(lang) {
    if (TRANSLATIONS[lang]) {
      this.lang = lang;
      localStorage.setItem("hd_lang", lang);
    }
  }

  t(path) {
    return path.split(".").reduce((obj, key) => obj?.[key], TRANSLATIONS[this.lang]) || path;
  }
}
```

---

## 5. Three.js Technical Architecture

### Recommended Project Structure
```text
horizon-drive/
├── index.html
├── src/
│   ├── main.js                 # Game bootstrap & main loop
│   ├── i18n/
│   │   └── translations.js     # EN (default) & KO (optional) strings
│   ├── data/
│   │   ├── biomes.js           # Visual, fog, lighting & physics presets
│   │   ├── equipment.js        # Modular parts data
│   │   └── saveState.js        # LocalStorage persistence
│   ├── world/
│   │   ├── BiomeLoader.js      # Switches scene sky, fog, lights & ground
│   │   ├── TrackBuilder.js     # Spline road + Location Lv. 1~5 props
│   │   └── PropFactory.js      # InstancedMesh generators for props
│   ├── vehicle/
│   │   ├── CarController.js    # Lightweight arcade drift & nitro physics
│   │   └── CarMeshBuilder.js   # Procedural low-poly car + equipment slots
│   └── ui/
│       └── HudManager.js       # Speedometer, Nitro bar, Garage & Map UI
```

### Biome Presets (`src/data/biomes.js`)
```javascript
export const BIOME_PRESETS = {
  neon_street: {
    id: "neon_street",
    skyColor: 0x090b1a,
    fog: { color: 0x0e122b, density: 0.0075 },
    ambientLight: { color: 0x4b558a, intensity: 0.8 },
    sunLight: { color: 0xff2a85, intensity: 1.2, position: [50, 80, -40] },
    roadColor: 0x181a24,
    groundColor: 0x0d0f18,
    friction: 1.0,
    roadWidth: 14,
    props: ["cyberBuilding", "neonArch", "streetLamp"]
  },
  red_canyon: {
    id: "red_canyon",
    skyColor: 0xff8c42,
    fog: { color: 0xf4a261, density: 0.004 },
    ambientLight: { color: 0xffd6a5, intensity: 1.0 },
    sunLight: { color: 0xfff1d0, intensity: 1.8, position: [100, 60, 40] },
    roadColor: 0x8c4a27,
    groundColor: 0xc86432,
    friction: 0.78,
    roadWidth: 20,
    props: ["mesaRock", "cactus", "woodenSign"]
  },
  coast_highway: {
    id: "coast_highway",
    skyColor: 0x4cc9f0,
    fog: { color: 0x90e0ef, density: 0.0025 },
    ambientLight: { color: 0xffffff, intensity: 1.1 },
    sunLight: { color: 0xfff8e7, intensity: 2.0, position: [80, 120, 60] },
    roadColor: 0x2b2d42,
    groundColor: 0x00b4d8,
    friction: 0.96,
    roadWidth: 18,
    props: ["palmTree", "beachUmbrella", "highwayArch"]
  },
  alpine_pass: {
    id: "alpine_pass",
    skyColor: 0xcaf0f8,
    fog: { color: 0xe0fbfc, density: 0.006 },
    ambientLight: { color: 0xb8d8e8, intensity: 1.1 },
    sunLight: { color: 0xffffff, intensity: 1.5, position: [-60, 100, 30] },
    roadColor: 0x4a5759,
    groundColor: 0xf1faee,
    friction: 0.65,
    roadWidth: 15,
    props: ["pineTree", "snowRock", "woodenGuardrail"]
  }
};
```

### Biome & Location Level Loader (`src/world/BiomeLoader.js`)
```javascript
import * as THREE from "three";
import { BIOME_PRESETS } from "../data/biomes.js";

export function loadBiomeScene(scene, biomeId, locationLevel = 1) {
  const preset = BIOME_PRESETS[biomeId];
  if (!preset) throw new Error(`Unknown biome: ${biomeId}`);

  // 1. Apply Sky & Fog
  scene.background = new THREE.Color(preset.skyColor);
  scene.fog = new THREE.FogExp2(preset.fog.color, preset.fog.density);

  // 2. Setup Lighting
  const ambient = new THREE.AmbientLight(preset.ambientLight.color, preset.ambientLight.intensity);
  const sun = new THREE.DirectionalLight(preset.sunLight.color, preset.sunLight.intensity);
  sun.position.set(...preset.sunLight.position);
  scene.add(ambient, sun);

  // 3. Location Upgrade Features (Lv. 1 ~ Lv. 5)
  const trackFeatures = {
    hasSponsorsAndLights: locationLevel >= 2,
    hasBoostPads: locationLevel >= 3,
    hasJumpShortcuts: locationLevel >= 4,
    hasFestivalCrowdAndFireworks: locationLevel >= 5,
    payoutMultiplier: 1 + (locationLevel - 1) * 0.25
  };

  return { preset, trackFeatures };
}
```

### Equipment Visual Attachment Pattern (`CarMeshBuilder.js`)
```javascript
// Attach swappable equipment meshes directly to the vehicle group
export function applyEquipmentVisuals(carGroup, equippedIds, meshLibrary) {
  const slots = ["suspensionSlot", "boosterSlot", "utilitySlot"];

  slots.forEach((slotName) => {
    const slot = carGroup.getObjectByName(slotName);
    if (!slot) return;
    slot.clear(); // Remove previous equipment mesh
  });

  if (equippedIds.booster && meshLibrary[equippedIds.booster]) {
    carGroup.getObjectByName("boosterSlot").add(meshLibrary[equippedIds.booster].clone());
  }
  if (equippedIds.utility && meshLibrary[equippedIds.utility]) {
    carGroup.getObjectByName("utilitySlot").add(meshLibrary[equippedIds.utility].clone());
  }
}
```

---

## 6. Art Direction & Concept Art Prompts (게임 분위기 가이드)

To achieve a cohesive, modern indie-game aesthetic that runs smoothly at 60 FPS in Three.js, use **Stylized Low-Poly with Bold Color Contrast** (inspired by *Art of Rally*, *Horizon Chase Turbo*, and *OutRun*).

### Visual Pillars
- **Flat/Toon Shading** with crisp directional shadows and subtle bloom on emissive elements (taillights, boost pads, neon signs).
- **Strong Silhouette Readability:** High contrast between the road surface, vehicle body, and surrounding environment.
- **Dynamic Speed Feedback:** Camera FOV widens during Nitro, tire smoke/drift sparks change color by biome (cyan sparks on asphalt, dust clouds in canyon, snow spray in alpine).

### Ready-to-Use Concept Art Prompts (Midjourney / Imagen / DALL-E)

#### 1. Key Art — Neon Street (도심 스트릿 레이싱 분위기)
> `Stylized low-poly 3D arcade racing game screenshot, sleek retro-futuristic sports car drifting around a wet midnight city corner, glowing cyan and magenta neon skyscrapers, luminous boost pads on dark asphalt road, bright red tail light trails, vibrant synthwave atmosphere, crisp lighting, clean geometric aesthetic, Unreal Engine and Three.js indie game style, wide cinematic rear-chase camera --ar 16:9`

#### 2. Key Art — Red Canyon (광활한 사막 협곡 분위기)
> `Stylized low-poly 3D arcade racing game screenshot, lifted rally sports car with roof nitro boosters jumping off a dirt ramp in a vast red rock desert canyon at golden sunset, warm terracotta mesas, dramatic orange sky, kick-up dust clouds, holographic race checkpoints and sponsor banners along the wide dirt track, vibrant Art of Rally and Horizon Chase aesthetic, dynamic chase camera --ar 16:9`

#### 3. Key Art — Coast Highway Festival (Lv. 5 해안 페스티벌 분위기)
> `Stylized low-poly 3D arcade racing game screenshot, high-speed sports car boosting down a sunlit coastal highway next to a turquoise ocean, palm trees, grandstands with spectators and colorful fireworks in the bright blue sky, glowing yellow speed arrows on the road, vibrant saturated colors, joyful arcade racing festival vibe --ar 16:9`

---

## 7. MVP Development Roadmap

1. **Phase 1 — Core Driving Prototype:**
   - Single `CatmullRomCurve3` closed-loop track, low-poly car mesh, arcade drift + nitro physics, and English HUD.
2. **Phase 2 — Biome Switching & i18n:**
   - Implement `Neon Street` and `Red Canyon` presets, main menu selector, and the `EN / KO` language toggle button.
3. **Phase 3 — 3-Axis Progression:**
   - Add Credit rewards, `localStorage` save system, Garage upgrades/equipment slots, and Location Upgrades (Lv. 1 → Lv. 3 adding billboards and boost pads).
4. **Phase 4 — Polish & Content Expansion:**
   - Add `Coast Highway` and `Alpine Pass`, AI rival racers, audio/SFX (Web Audio API synth engine sound), and Lv. 4–5 festival effects.