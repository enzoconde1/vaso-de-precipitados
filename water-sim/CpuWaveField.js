/** Heightfield 2D en CPU (misma ecuación de ondas que webgl-water).
 * 256×256 cuesta ~1 ms/frame; evita fallos de float RT en algunos GPUs.
 */
export class CpuWaveField {
  constructor(resolution = 256) {
    this.size = resolution;
    this.height = new Float32Array(resolution * resolution);
    this.velocity = new Float32Array(resolution * resolution);
    this.normalX = new Float32Array(resolution * resolution);
    this.normalZ = new Float32Array(resolution * resolution);
    this._scratchH = new Float32Array(resolution * resolution);
    this._scratchV = new Float32Array(resolution * resolution);
  }

  _idx(i, j) {
    return j * this.size + i;
  }

  addDrop(ndcX, ndcY, radius, strength) {
    const s = this.size;
    const physRadius = radius * 2.0;

    for (let j = 0; j < s; j += 1) {
      for (let i = 0; i < s; i += 1) {
        const px = (i / (s - 1)) * 2.0 - 1.0;
        const py = (j / (s - 1)) * 2.0 - 1.0;
        const diff = Math.hypot(px - ndcX, py - ndcY);
        let drop = Math.max(0, 1 - diff / physRadius);
        drop = 0.5 - Math.cos(drop * Math.PI) * 0.5;
        const k = this._idx(i, j);
        this.height[k] += drop * strength;
      }
    }
  }

  step() {
    const s = this.size;
    const h = this.height;
    const v = this.velocity;
    const nh = this._scratchH;
    const nv = this._scratchV;
    nh.set(h);
    nv.set(v);

    for (let j = 1; j < s - 1; j += 1) {
      for (let i = 1; i < s - 1; i += 1) {
        const k = this._idx(i, j);
        const lap =
          h[this._idx(i - 1, j)] +
          h[this._idx(i + 1, j)] +
          h[this._idx(i, j - 1)] +
          h[this._idx(i, j + 1)] -
          4 * h[k];
        const edge = Math.min(i, j, s - 1 - i, s - 1 - j) / (s * 0.08);
        const damp = 0.972 + 0.02 * Math.min(1, Math.max(0, edge));
        nv[k] = (v[k] + 0.35 * lap) * damp;
        nh[k] = h[k] + nv[k];
      }
    }

    for (let i = 0; i < s; i += 1) {
      nh[this._idx(i, 0)] = 0;
      nh[this._idx(i, s - 1)] = 0;
      nv[this._idx(i, 0)] = 0;
      nv[this._idx(i, s - 1)] = 0;
      nh[this._idx(0, i)] = 0;
      nh[this._idx(s - 1, i)] = 0;
      nv[this._idx(0, i)] = 0;
      nv[this._idx(s - 1, i)] = 0;
    }

    this.height = nh;
    this.velocity = nv;
    this._scratchH = h;
    this._scratchV = v;
  }

  clear() {
    this.height.fill(0);
    this.velocity.fill(0);
    this.normalX.fill(0);
    this.normalZ.fill(0);
  }

  updateNormals() {
    const s = this.size;
    const h = this.height;
    const delta = 1 / s;

    for (let j = 1; j < s - 1; j += 1) {
      for (let i = 1; i < s - 1; i += 1) {
        const k = this._idx(i, j);
        const dx = (h[this._idx(i + 1, j)] - h[this._idx(i - 1, j)]) / (2 * delta);
        const dz = (h[this._idx(i, j + 1)] - h[this._idx(i, j - 1)]) / (2 * delta);
        const len = Math.hypot(dx, dz, 1);
        this.normalX[k] = dx / len;
        this.normalZ[k] = dz / len;
      }
    }
  }

  sampleHeight(u, v) {
    const s = this.size;
    const fx = Math.min(s - 1, Math.max(0, u * (s - 1)));
    const fy = Math.min(s - 1, Math.max(0, v * (s - 1)));
    const i0 = Math.floor(fx);
    const j0 = Math.floor(fy);
    const i1 = Math.min(i0 + 1, s - 1);
    const j1 = Math.min(j0 + 1, s - 1);
    const tx = fx - i0;
    const ty = fy - j0;

    const h00 = this.height[this._idx(i0, j0)];
    const h10 = this.height[this._idx(i1, j0)];
    const h01 = this.height[this._idx(i0, j1)];
    const h11 = this.height[this._idx(i1, j1)];

    const hx0 = h00 + (h10 - h00) * tx;
    const hx1 = h01 + (h11 - h01) * tx;
    return hx0 + (hx1 - hx0) * ty;
  }

  /** RGBA8 para shaders de agua (R=altura, BA=normales suavizadas). */
  packDisplay() {
    const s = this.size;
    if (!this._display) {
      this._display = new Uint8Array(s * s * 4);
    }
    if (!this._nxBlur) {
      this._nxBlur = new Float32Array(s * s);
      this._nzBlur = new Float32Array(s * s);
    }
    const out = this._display;
    const nxBlur = this._nxBlur;
    const nzBlur = this._nzBlur;

    for (let j = 1; j < s - 1; j += 1) {
      for (let i = 1; i < s - 1; i += 1) {
        const k = this._idx(i, j);
        nxBlur[k] =
          (this.normalX[this._idx(i - 1, j)] +
            this.normalX[this._idx(i + 1, j)] +
            this.normalX[this._idx(i, j - 1)] +
            this.normalX[this._idx(i, j + 1)] +
            this.normalX[k] * 2.0) /
          6.0;
        nzBlur[k] =
          (this.normalZ[this._idx(i - 1, j)] +
            this.normalZ[this._idx(i + 1, j)] +
            this.normalZ[this._idx(i, j - 1)] +
            this.normalZ[this._idx(i, j + 1)] +
            this.normalZ[k] * 2.0) /
          6.0;
      }
    }

    for (let j = 0; j < s; j += 1) {
      for (let i = 0; i < s; i += 1) {
        const k = this._idx(i, j);
        const o = k * 4;
        const nx = j > 0 && j < s - 1 && i > 0 && i < s - 1 ? nxBlur[k] : this.normalX[k];
        const nz = j > 0 && j < s - 1 && i > 0 && i < s - 1 ? nzBlur[k] : this.normalZ[k];
        out[o] = Math.min(255, Math.max(0, Math.round((this.height[k] + 0.5) * 255)));
        out[o + 1] = Math.min(255, Math.max(0, Math.round((nx * 0.5 + 0.5) * 255)));
        out[o + 2] = Math.min(255, Math.max(0, Math.round((nz * 0.5 + 0.5) * 255)));
        out[o + 3] = 255;
      }
    }
    return out;
  }

  /** RGBA float para cáusticas (R=altura, BA=normales). */
  packSimulation() {
    const s = this.size;
    if (!this._simulation) {
      this._simulation = new Float32Array(s * s * 4);
    }
    const out = this._simulation;
    for (let j = 0; j < s; j += 1) {
      for (let i = 0; i < s; i += 1) {
        const k = this._idx(i, j);
        const o = k * 4;
        out[o] = this.height[k];
        out[o + 1] = this.velocity[k];
        out[o + 2] = this.normalX[k];
        out[o + 3] = this.normalZ[k];
      }
    }
    return out;
  }
}
