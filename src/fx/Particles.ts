import * as THREE from 'three';

/** Pooled soft-point particles (sparks, dust, nitro flames, fireworks). One draw call. */
export class ParticleSystem {
  readonly points: THREE.Points;
  private n: number;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grav: Float32Array;
  private baseSize: Float32Array;
  private next = 0;
  private geo: THREE.BufferGeometry;

  constructor(count = 900, additive = false) {
    this.n = count;
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count).fill(1);
    this.grav = new Float32Array(count);
    this.baseSize = new Float32Array(count);
    this.pos.fill(0, 0); for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -999;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; uniform float scale;
        void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; varying vec3 vC;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float a = smoothstep(0.5, 0.1, r) * vA; gl_FragColor = vec4(vC, a); }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setViewScale(heightPx: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = heightPx * 0.9;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, size: number, life: number, gravity = 0): void {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = ((color >> 16) & 255) / 255; this.col[i * 3 + 1] = ((color >> 8) & 255) / 255; this.col[i * 3 + 2] = (color & 255) / 255;
    this.baseSize[i] = size; this.size[i] = size;
    this.life[i] = life; this.maxLife[i] = life; this.grav[i] = gravity;
    this.alpha[i] = 1;
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.pos[i * 3 + 1] = -999; } continue; }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = t;
      this.size[i] = this.baseSize[i] * (0.5 + 0.9 * (1 - t));
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('alpha') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('size') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

/** Dark skid marks as a ring buffer of flat quads. */
export class SkidMarks {
  readonly mesh: THREE.InstancedMesh;
  private next = 0;
  private n: number;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(-Math.PI / 2, 0, 0, 'YXZ');
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(count = 500) {
    this.n = count;
    const geo = new THREE.PlaneGeometry(0.34, 1.0);
    const mat = new THREE.MeshBasicMaterial({ color: 0x07080c, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < count; i++) this.mesh.setMatrixAt(i, this.zero);
  }

  add(x: number, z: number, heading: number): void {
    this.e.set(-Math.PI / 2, heading, 0, 'YXZ');
    this.q.setFromEuler(this.e);
    this.m.compose(new THREE.Vector3(x, 0.045, z), this.q, new THREE.Vector3(1, 1, 1));
    this.mesh.setMatrixAt(this.next, this.m);
    this.next = (this.next + 1) % this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    for (let i = 0; i < this.n; i++) this.mesh.setMatrixAt(i, this.zero);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Falling snow / drifting dust around the camera. */
export class Weather {
  readonly points: THREE.Object3D;
  private pos: Float32Array;
  private n: number;
  private box = new THREE.Vector3(70, 34, 70);
  private fall: number;
  private wind: number;

  private lines: THREE.LineSegments | null = null;
  private lpos: Float32Array | null = null;

  constructor(kind: 'snow' | 'dust' | 'rain') {
    this.n = kind === 'snow' ? 900 : kind === 'rain' ? 1100 : 380;
    this.fall = kind === 'snow' ? 5 : 0.4;
    this.wind = kind === 'snow' ? 1.5 : 7;
    this.pos = new Float32Array(this.n * 3);
    for (let i = 0; i < this.n; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * this.box.x;
      this.pos[i * 3 + 1] = Math.random() * this.box.y;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * this.box.z;
    }
    if (kind === 'rain') {
      this.fall = 38; this.wind = 4;
      this.lpos = new Float32Array(this.n * 6);
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(this.lpos, 3));
      this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xaec6ff, transparent: true, opacity: 0.32, depthWrite: false }));
      this.lines.frustumCulled = false;
      this.points = this.lines;
      return;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const mat = new THREE.PointsMaterial({
      color: kind === 'snow' ? 0xffffff : 0xf3c58c, size: kind === 'snow' ? 0.22 : 0.3, transparent: true,
      opacity: kind === 'snow' ? 0.9 : 0.22, depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  update(dt: number, cam: THREE.Vector3): void {
    const b = this.box;
    for (let i = 0; i < this.n; i++) {
      let x = this.pos[i * 3] + this.wind * dt, y = this.pos[i * 3 + 1] - this.fall * dt, z = this.pos[i * 3 + 2];
      // keep positions in a box centred on the camera (local coordinates, then offset by the points object)
      if (y < 0) y += b.y;
      if (x > b.x / 2) x -= b.x; if (x < -b.x / 2) x += b.x;
      if (z > b.z / 2) z -= b.z; if (z < -b.z / 2) z += b.z;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    }
    if (this.lines && this.lpos) {
      for (let i = 0; i < this.n; i++) {
        const x = this.pos[i * 3], y = this.pos[i * 3 + 1], z = this.pos[i * 3 + 2];
        this.lpos.set([x, y, z, x - this.wind * 0.03, y + 1.3, z], i * 6);
      }
      (this.lines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    } else {
      ((this.points as THREE.Points).geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    this.points.position.set(cam.x, cam.y - 8, cam.z);
  }

  dispose(): void {
    const o = this.points as THREE.Points | THREE.LineSegments;
    o.geometry.dispose();
    (o.material as THREE.Material).dispose();
  }
}

/** Festival fireworks (Location Lv.5). */
export class Fireworks {
  readonly ps = new ParticleSystem(700, true);
  private t = 0;
  private origin: THREE.Vector3[] = [];
  private shells: { t: number; pos: THREE.Vector3; vy: number; col: number }[] = [];
  private palette = [0xff3fa6, 0x19e6ff, 0xffd24a, 0x7bff9a, 0xff5a36, 0xffffff];

  constructor(origins: THREE.Vector3[]) { this.origin = origins; }

  update(dt: number): void {
    this.t -= dt;
    if (this.t <= 0 && this.origin.length) {
      this.t = 0.5 + Math.random() * 0.9;
      const o = this.origin[Math.floor(Math.random() * this.origin.length)];
      this.shells.push({ t: 0, pos: o.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30)), vy: 38 + Math.random() * 14, col: this.palette[Math.floor(Math.random() * this.palette.length)] });
    }
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.t += dt;
      s.pos.y += s.vy * dt; s.vy -= 20 * dt;
      this.ps.emit(s.pos.x, s.pos.y, s.pos.z, (Math.random() - 0.5) * 2, -3, (Math.random() - 0.5) * 2, 0xffe9b0, 1.2, 0.4);
      if (s.vy <= 6) {
        const n = 60;
        for (let k = 0; k < n; k++) {
          const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = 14 + Math.random() * 6;
          this.ps.emit(s.pos.x, s.pos.y, s.pos.z, Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp, s.col, 1.7, 1.4 + Math.random() * 0.5, 9);
        }
        this.shells.splice(i, 1);
      }
    }
    this.ps.update(dt);
  }
}
