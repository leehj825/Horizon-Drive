import type { I18n } from '../i18n/i18n';
import type { Track } from '../world/track';

export interface HudData {
  speedKmh: number;
  nitro: number;
  nitroActive: boolean;
  lap: number;
  totalLaps: number;
  pos: number;
  total: number;
  time: number;
  lapTime: number;
  bestLap: number;
  driftPoints: number;
  driftActive: boolean;
  driftZone: boolean;
  coins: number;
  offroad: boolean;
  chain: number;
  mult: number;
  chainActive: boolean;
  tier: number;
  draft: number;
  /** Mode-specific bar (bomb, cargo, damage...): label, 0..1 fill, kind */
  extra?: { label: string; frac: number; kind: string } | null;
  extra2?: string | null;
  damage: number;
}

export function fmtTime(t: number): string {
  if (!isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

/** DOM heads-up display: speedo, nitro, lap/position, minimap, toasts and big centre messages. */
export class Hud {
  readonly root: HTMLElement;
  private el: Record<string, HTMLElement> = {};
  private mini: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private miniPath: [number, number][] = [];
  private miniScale = 1;
  private miniCx = 0;
  private miniCz = 0;
  private miniTimer = 0;
  private centerTimer = 0;
  private cache: Record<string, string> = {};

  constructor(parent: HTMLElement, private i18n: I18n, onPause: () => void) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="hud-tl">
        <div class="chip big"><span class="k" data-k="lapL"></span> <b id="h-lap">1/3</b></div>
        <div class="chip big"><span class="k" data-k="posL"></span> <b id="h-pos">1/1</b></div>
        <div class="chip"><span id="h-time">0:00.00</span></div>
        <div class="chip dim"><span class="k" data-k="bestL"></span> <span id="h-best">--:--.--</span></div>
      </div>
      <div class="hud-tr"><canvas id="h-mini" width="160" height="160"></canvas><button id="h-pause" aria-label="pause">II</button></div>
      <div class="hud-bl">
        <div class="speed"><b id="h-speed">0</b><span class="k" data-k="kmhL"></span></div>
        <div class="nitro"><div class="nitro-fill" id="h-nitro"></div><span class="nitro-label k" data-k="nitroL"></span></div>
        <div class="dmg" id="h-dmgwrap"><i id="h-dmg"></i></div>
        <div class="coins">● <b id="h-coins">0</b></div>
      </div>
      <div class="hud-drift" id="h-drift"></div>
      <div class="hud-draft" id="h-draft"></div>
      <div class="hud-extra" id="h-extra"><span id="h-extra-l"></span><div><i id="h-extra-f"></i></div></div>
      <div class="hud-extra2" id="h-extra2"></div>
      <div class="hud-center" id="h-center"></div>
      <div class="hud-toasts" id="h-toasts"></div>
      <div class="hud-off" id="h-off"></div>`;
    parent.appendChild(this.root);
    for (const id of ['h-dmgwrap', 'h-dmg', 'h-draft', 'h-extra', 'h-extra-l', 'h-extra-f', 'h-extra2', 'h-lap', 'h-pos', 'h-time', 'h-best', 'h-speed', 'h-nitro', 'h-coins', 'h-drift', 'h-center', 'h-toasts', 'h-off']) this.el[id] = this.root.querySelector('#' + id)!;
    this.mini = this.root.querySelector('#h-mini')!;
    this.mctx = this.mini.getContext('2d')!;
    this.root.querySelector('#h-pause')!.addEventListener('click', onPause);
    this.relabel();
  }

  relabel(): void {
    const map: Record<string, string> = { lapL: 'ui.lap', posL: 'ui.pos', bestL: 'ui.best', kmhL: 'ui.kmh', nitroL: 'ui.nitro' };
    this.root.querySelectorAll<HTMLElement>('.k').forEach((e) => { e.textContent = this.i18n.t(map[e.dataset.k!]); });
  }

  setVisible(v: boolean): void { this.root.hidden = !v; }

  private set(id: string, text: string): void {
    if (this.cache[id] !== text) { this.cache[id] = text; this.el[id].textContent = text; }
  }

  setTrack(track: Track): void {
    this.miniPath = [];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < track.n; i += 6) {
      this.miniPath.push([track.px[i], track.pz[i]]);
      minX = Math.min(minX, track.px[i]); maxX = Math.max(maxX, track.px[i]);
      minZ = Math.min(minZ, track.pz[i]); maxZ = Math.max(maxZ, track.pz[i]);
    }
    this.miniCx = (minX + maxX) / 2; this.miniCz = (minZ + maxZ) / 2;
    this.miniScale = 140 / Math.max(maxX - minX, maxZ - minZ);
  }

  update(d: HudData, dt: number): void {
    this.set('h-lap', d.totalLaps > 100 ? `${d.lap}` : `${Math.min(d.lap, d.totalLaps)}/${d.totalLaps}`);
    this.set('h-pos', `${d.pos}/${d.total}`);
    this.set('h-time', fmtTime(d.time));
    this.set('h-best', fmtTime(d.bestLap));
    this.set('h-speed', String(Math.round(d.speedKmh)));
    this.set('h-coins', String(d.coins));
    this.el['h-dmgwrap'].style.display = d.damage > 0.02 ? 'block' : 'none';
    this.el['h-dmg'].style.width = `${Math.round(d.damage * 100)}%`;
    const nf = this.el['h-nitro'];
    nf.style.width = `${Math.round(d.nitro * 100)}%`;
    nf.classList.toggle('active', d.nitroActive);
    nf.classList.toggle('full', d.nitro > 0.99);
    const dr = this.el['h-drift'];
    if (d.driftActive && d.driftPoints > 20) {
      dr.textContent = `DRIFT ${Math.round(d.driftPoints)}${d.driftZone ? ' ×2' : ''}${d.chain > 1 ? ` · ×${d.mult.toFixed(1)}` : ''}${d.tier > 0 ? ' ' + '▲'.repeat(d.tier) : ''}`;
      dr.className = `hud-drift on t${d.tier}`;
    } else if (d.chainActive && d.chain > 0) {
      dr.textContent = `CHAIN ×${d.mult.toFixed(1)}`;
      dr.className = 'hud-drift on chain';
    } else dr.className = 'hud-drift';
    const dft = this.el['h-draft'];
    dft.textContent = this.i18n.t('ui.slipstream');
    dft.style.opacity = String(Math.min(1, d.draft * 1.4));
    const ex = this.el['h-extra'];
    if (d.extra) {
      ex.style.display = 'block';
      this.set('h-extra-l', d.extra.label);
      this.el['h-extra-f'].style.width = `${Math.round(Math.max(0, Math.min(1, d.extra.frac)) * 100)}%`;
      ex.className = `hud-extra ${d.extra.kind}`;
    } else ex.style.display = 'none';
    const ex2 = this.el['h-extra2'];
    ex2.textContent = d.extra2 ?? '';
    ex2.style.display = d.extra2 ? 'block' : 'none';
    this.el['h-off'].classList.toggle('on', d.offroad);
    if (this.centerTimer > 0) {
      this.centerTimer -= dt;
      if (this.centerTimer <= 0) this.el['h-center'].classList.remove('on');
    }
  }

  /** Big message in the middle (countdown digits, GO!). */
  center(text: string, seconds = 0.9, kind = ''): void {
    const c = this.el['h-center'];
    c.textContent = text;
    c.className = 'hud-center on ' + kind;
    // restart animation
    void c.offsetWidth;
    this.centerTimer = seconds;
  }

  clearCenter(): void { this.el['h-center'].classList.remove('on'); this.centerTimer = 0; }

  toast(text: string, kind = '', ms = 1800): void {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = text;
    this.el['h-toasts'].appendChild(t);
    while (this.el['h-toasts'].children.length > 4) this.el['h-toasts'].firstElementChild!.remove();
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 400);
  }

  clearToasts(): void { this.el['h-toasts'].innerHTML = ''; }

  drawMinimap(dt: number, racers: { x: number; z: number; player: boolean }[]): void {
    this.miniTimer -= dt;
    if (this.miniTimer > 0 || !this.miniPath.length) return;
    this.miniTimer = 0.08;
    const g = this.mctx, S = this.miniScale;
    g.clearRect(0, 0, 160, 160);
    g.fillStyle = 'rgba(8,10,20,0.55)';
    g.beginPath(); g.arc(80, 80, 78, 0, Math.PI * 2); g.fill();
    const px = (x: number) => 80 + (x - this.miniCx) * S;
    const pz = (z: number) => 80 + (z - this.miniCz) * S;
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3.5; g.lineJoin = 'round';
    g.beginPath();
    this.miniPath.forEach(([x, z], i) => (i ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z))));
    g.closePath(); g.stroke();
    // start marker
    g.fillStyle = '#ffd24a'; g.fillRect(px(this.miniPath[0][0]) - 3, pz(this.miniPath[0][1]) - 3, 6, 6);
    for (const r of racers) {
      g.fillStyle = r.player ? '#19e6ff' : '#ff4f6d';
      g.beginPath(); g.arc(px(r.x), pz(r.z), r.player ? 5 : 3.6, 0, Math.PI * 2); g.fill();
      if (r.player) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); }
    }
  }
}
