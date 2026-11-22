import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

/** Lit-window facade for neon skyscrapers (used as both map and emissive map). */
export function windowTexture(seed = 3): THREE.CanvasTexture {
  const [c, g] = canvas(128, 256);
  g.fillStyle = '#0b0d1c'; g.fillRect(0, 0, 128, 256);
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const cols = ['#19e6ff', '#ff3fa6', '#ffd24a', '#ffffff', '#8a5bff'];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) {
    if (rnd() < 0.42) { g.fillStyle = cols[Math.floor(rnd() * cols.length)]; g.fillRect(x * 8 + 1, y * 8 + 2, 5, 4); }
  }
  const t = tex(c, true);
  t.repeat.set(2, 4);
  return t;
}

export function checkerTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 32);
  const n = 8;
  for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) {
    g.fillStyle = (x + y) % 2 ? '#ffffff' : '#111111';
    g.fillRect(x * (128 / 16), y * (32 / 2), 128 / 16, 32 / 2);
  }
  void n;
  const t = tex(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function chevronTexture(color = '#ffe14a'): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#10131c'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = color; g.lineWidth = 14; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {
    const y = 22 + i * 38;
    g.beginPath(); g.moveTo(24, y + 22); g.lineTo(64, y - 4); g.lineTo(104, y + 22); g.stroke();
  }
  const t = tex(c);
  // chevrons point along +v (travel direction)
  return t;
}

const ADS: [string, string, string][] = [
  ['NOVA CELL', '#ff3fa6', '#1b0f2c'],
  ['TURBO COLA', '#ff5a36', '#fff3d6'],
  ['APEX TIRES', '#19e6ff', '#0b1d2c'],
  ['SUNRISE AIR', '#ffd24a', '#1d2b4a'],
  ['PIXEL BANK', '#7bff9a', '#10222a'],
];

export function adTexture(i: number): THREE.CanvasTexture {
  const [name, fg, bg] = ADS[i % ADS.length];
  const [c, g] = canvas(256, 128);
  g.fillStyle = bg; g.fillRect(0, 0, 256, 128);
  g.fillStyle = fg; g.fillRect(0, 0, 256, 10); g.fillRect(0, 118, 256, 10);
  g.font = 'bold 42px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = fg; g.fillText(name, 128, 64);
  return tex(c);
}

export function bannerTexture(text: string, fg = '#ffffff', bg = '#111827', accent = '#ff3fa6'): THREE.CanvasTexture {
  const [c, g] = canvas(512, 96);
  g.fillStyle = bg; g.fillRect(0, 0, 512, 96);
  g.fillStyle = accent; g.fillRect(0, 0, 512, 8); g.fillRect(0, 88, 512, 8);
  g.font = '900 54px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = fg; g.fillText(text, 256, 50);
  return tex(c);
}

export function jumbotronTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 256);
  const grd = g.createLinearGradient(0, 0, 512, 256);
  grd.addColorStop(0, '#ff3fa6'); grd.addColorStop(0.5, '#7b5bff'); grd.addColorStop(1, '#19e6ff');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < 256; y += 4) g.fillRect(0, y, 512, 1);
  g.font = '900 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fff'; g.fillText('GRAND', 256, 90); g.fillText('FESTIVAL', 256, 170);
  return tex(c);
}

export function gradientSky(top: number, horizon: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(horizon) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.6, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.7)), 1.0); }',
  });
}

export function kerbTexture(a = '#e23b3b', b = '#f4f4f4'): THREE.CanvasTexture {
  const [c, g] = canvas(16, 64);
  g.fillStyle = a; g.fillRect(0, 0, 16, 32);
  g.fillStyle = b; g.fillRect(0, 32, 16, 32);
  const t = tex(c, true);
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Soft radial glow (light pools on wet asphalt). */
export function glowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return tex(c);
}
