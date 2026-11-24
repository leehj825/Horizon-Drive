import { Game, type GameOptions } from './game';
import './ui/style.css';
import { setupTouch } from './ui/touch';
import type { BiomeId } from './data/biomes';
import type { RaceMode } from './data/progression';

const q = new URLSearchParams(location.search);
const opts: GameOptions = {};
const auto = q.get('autostart');
if (auto) {
  const [biome, mode] = auto.split(':');
  opts.autostart = { biome: (biome || 'neon_street') as BiomeId, mode: (mode || 'time_attack') as RaceMode, extra: { weather: (q.get('weather') || 'default') as 'default' | 'rain' | 'fog' | 'night', reverse: q.get('reverse') === '1', routeSeed: Number(q.get('seed')) || 0 } };
}
if (q.has('level')) opts.level = Math.max(1, Math.min(5, Number(q.get('level')) || 1));
if (q.get('bot') === '1') opts.autopilot = true;
if (q.get('bloom') === '0') opts.quality = { ...opts.quality, bloom: false };
if (q.get('shadows') === '0') opts.quality = { ...opts.quality, shadows: false };

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const game = new Game(canvas, ui, opts);
setupTouch(game.input);
(window as unknown as { __hd: Game }).__hd = game;

// the first frame is up: fade the loading splash out
requestAnimationFrame(() => requestAnimationFrame(() => {
  const sp = document.getElementById('splash');
  if (!sp) return;
  sp.style.opacity = '0';
  setTimeout(() => sp.remove(), 600);
}));
