# Google Play listing — Horizon Drive

## Basics
- **App name:** Horizon Drive
- **Category:** Games › Racing · **Tags:** arcade racing, drifting, offline
- **Price / ads / in-app purchases:** free, no ads, no purchases
- **Content rating (IARC questionnaire):** no violence beyond cartoon car crashes, no user-generated content, no gambling — expect "Everyone" / PEGI 3 (answer the questionnaire yourself).
- **Data safety:** no data collected or shared; no permissions. Privacy policy: host `store/privacy-policy.md` (e.g. GitHub Pages) and paste the URL.
- **Graphics:** `store/icon-512.png` (icon), `store/feature-1024x500.png` (feature graphic), `store/screenshots/*.png` (landscape phone screenshots, 1600×900).

## English
**Short description (≤80):** Drift through rainy neon streets, sunny downtowns and canyon roads.

**Full description:**
Horizon Drive is a stylized arcade racer with a light tycoon twist. Drift, boost and smash your way through six distinct locations — from a rain-soaked neon city grid with oncoming traffic and red-light cross traffic, to a sunset harbor, a sunny downtown, a red canyon, a coastal highway and an icy alpine pass.

• Handbrake drifts that fill your nitro — chain clean drifts for PERFECT DRIFT bonuses
• Dangerous streets: civilian and oncoming traffic, cross traffic, near-miss bonuses, smashable props and real crashes
• Nine events: Time Attack with your ghost, duels, circuits, Elimination, Drift Trial, Bomb Run, Fragile Delivery, Pink Slip (win rivals' cars) and boss duels
• Drift chains, mini-turbo, slipstream, car damage and garage repairs, rivals with attitude
• Rain, fog, night, reversed circuits and a random-street generator; a freight train crossing and road works that move every lap; alley shortcuts at Lv.4
• Championships, a new Daily Challenge every day and 13 achievements
• Garage: 4 cars, 8 paints, upgrades and swappable equipment that really change how you drive
• Upgrade each location from Lv.1 to Lv.5: sponsors, boost pads, jump ramps, grandstands and fireworks
• Cinematic race replays with crash slow-motion
• Easy / Normal / Hard difficulty, touch and gamepad support, English and Korean
• 100% offline. No ads. No purchases. No data collected.

## 한국어
**짧은 설명 (80자 이내):** 비 내리는 네온 거리와 햇살 가득한 도심, 협곡을 드리프트로 질주하세요.

**자세한 설명:**
Horizon Drive는 가벼운 타이쿤 요소를 더한 스타일리시 아케이드 레이싱입니다. 비 내리는 네온 도시 격자(대향 차량과 신호 위반 횡단 차량), 노을 진 항구, 햇살 가득한 다운타운, 붉은 협곡, 해안 도로, 눈 덮인 알파인 패스까지 여섯 곳을 드리프트와 부스트로 달리세요.

• 핸드브레이크 드리프트로 니트로를 채우고, 깔끔한 드리프트는 퍼펙트 드리프트 보너스
• 위험한 거리: 일반·대향 차량, 횡단 차량, 아슬아슬 추월 보너스, 부서지는 소품과 실제 충돌 사고
• 아홉 가지 이벤트: 고스트 타임 어택, 듀얼, 서킷, 탈락전, 드리프트 트라이얼, 폭탄 질주, 깨지기 쉬운 배달, 핑크슬립(라이벌의 차 획득), 보스 듀얼
• 드리프트 연쇄, 미니 터보, 슬립스트림, 차량 손상과 수리, 개성 있는 라이벌
• 비·안개·밤·역방향 코스와 랜덤 거리 생성, 열차 건널목과 랩마다 바뀌는 공사 구간, Lv.4 골목 지름길
• 챔피언십, 매일 바뀌는 일일 챌린지, 업적 13종
• 차고: 차량 4종, 도색 8가지, 업그레이드와 주행이 실제로 달라지는 교체 장비
• 장소를 Lv.1에서 Lv.5까지 키우세요: 스폰서, 부스트 패드, 점프 램프, 관중석과 불꽃놀이
• 사고 슬로모션이 있는 시네마틱 리플레이
• 쉬움/보통/어려움 난이도, 터치와 게임패드 지원, 한국어·영어
• 완전 오프라인. 광고 없음. 결제 없음. 수집하는 데이터 없음.

## Release checklist
1. Create the keystore and the four GitHub secrets (see README › Android).
2. Push — CI attaches `…-release.aab` (upload this to Play) and `…-release.apk` to the `apk-<branch>` pre-release.
3. Play Console: create app → upload AAB to Internal testing → fill the content rating, data safety (none) and target audience forms → add the graphics above → promote when happy.
4. Keep the keystore backed up: Play App Signing needs the same upload key for every update.
