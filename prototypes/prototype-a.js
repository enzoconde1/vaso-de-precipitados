import { MAX_ML, ML_PER_DROP, WATER_COLOR, WATER_DEEP, WATER_LIGHT } from '../shared/config.js';

/**
 * A · Canvas 2D — ondas sin(), charco + nivel, gota simple.
 */
export function createPrototypeA(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let ml = 0;
  let ripples = [];
  let drop = null;
  let raf = 0;

  const layout = () => {
    const maxH = height * 0.86;
    const maxW = width * 0.82;
    const beakerH = Math.min(maxH, height * 0.82);
    const wallW = Math.min(maxW, beakerH * 0.72);
    const top = (height - beakerH) * 0.5;
    return {
      cx: width * 0.5,
      top,
      bottom: top + beakerH,
      wallW,
      cornerR: Math.min(18, wallW * 0.12),
      lip: 8,
    };
  };

  function innerRect(L) {
    const pad = 10;
    return {
      left: L.cx - L.wallW / 2 + pad,
      right: L.cx + L.wallW / 2 - pad,
      top: L.top + 28,
      bottom: L.bottom - pad,
      width: L.wallW - pad * 2,
    };
  }

  const SHALLOW_ML = Math.max(ML_PER_DROP * 2, MAX_ML * (4 / 500));

  function mlToWaterY(inner, waterMl) {
    if (waterMl <= 0) return inner.bottom;
    const span = inner.bottom - inner.top;
    if (waterMl <= SHALLOW_ML) {
      const spread = waterMl / SHALLOW_ML;
      return inner.bottom - span * 0.04 * (0.4 + spread * 0.6);
    }
    const minY = inner.bottom - span * 0.04;
    const maxY = inner.top + span * 0.08;
    const rise = (waterMl - SHALLOW_ML) / (MAX_ML - SHALLOW_ML);
    return minY - rise * (minY - maxY);
  }

  function beakerPath(L) {
    const half = L.wallW / 2;
    const left = L.cx - half;
    const right = L.cx + half;
    const path = new Path2D();
    path.moveTo(left - L.lip, L.top);
    path.lineTo(left, L.top + 6);
    path.lineTo(left, L.bottom - L.cornerR);
    path.quadraticCurveTo(left, L.bottom, left + L.cornerR, L.bottom);
    path.lineTo(right - L.cornerR, L.bottom);
    path.quadraticCurveTo(right, L.bottom, right, L.bottom - L.cornerR);
    path.lineTo(right, L.top + 6);
    path.lineTo(right + L.lip * 0.6, L.top - 2);
    path.lineTo(right + L.lip, L.top + 4);
    path.lineTo(left - L.lip, L.top);
    return path;
  }

  function innerPath(inner) {
    const path = new Path2D();
    const r = 16;
    path.moveTo(inner.left, inner.bottom - r);
    path.quadraticCurveTo(inner.left, inner.bottom, inner.left + r, inner.bottom);
    path.lineTo(inner.right - r, inner.bottom);
    path.quadraticCurveTo(inner.right, inner.bottom, inner.right, inner.bottom - r);
    path.lineTo(inner.right, inner.top);
    path.lineTo(inner.left, inner.top);
    path.closePath();
    return path;
  }

  function addRipple(strength = 1) {
    ripples.push({ born: performance.now(), strength });
    if (ripples.length > 4) ripples.shift();
  }

  function surfaceWave(x, waterY, t) {
    let y = waterY;
    for (const rip of ripples) {
      const age = (t - rip.born) * 0.001;
      if (age > 2.2) continue;
      const amp = 5 * rip.strength * Math.exp(-age * 1.6);
      y += Math.sin((x - layout().cx) * 0.08 - age * 9) * amp;
      y += Math.sin((x - layout().cx) * 0.05 + age * 6) * amp * 0.35;
    }
    y += Math.sin(x * 0.04 + t * 0.002) * 0.6;
    return y;
  }

  function draw() {
    const t = performance.now();
    const L = layout();
    const inner = innerRect(L);
    const waterY = mlToWaterY(inner, ml);

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const glass = beakerPath(L);

    ctx.save();
    ctx.fillStyle = 'rgba(158, 170, 186, 0.38)';
    ctx.fill(glass);
    ctx.strokeStyle = 'rgba(95, 110, 130, 0.9)';
    ctx.lineWidth = 3.5;
    ctx.stroke(glass);
    ctx.strokeStyle = 'rgba(210, 218, 228, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.stroke(glass);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(75, 90, 110, 0.35)';
    ctx.lineWidth = 1.25;
    ctx.stroke(glass);

    ctx.save();
    ctx.clip(innerPath(inner));
    if (ml > 0) {
      const grad = ctx.createLinearGradient(0, waterY, 0, inner.bottom);
      grad.addColorStop(0, WATER_LIGHT);
      grad.addColorStop(0.35, WATER_COLOR);
      grad.addColorStop(1, WATER_DEEP);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(inner.left, inner.bottom);
      ctx.lineTo(inner.right, inner.bottom);
      for (let x = inner.right; x >= inner.left; x -= 2) {
        ctx.lineTo(x, surfaceWave(x, waterY, t));
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    const markStep = MAX_ML <= 20 ? 5 : 100;
    for (let mlMark = markStep; mlMark <= MAX_ML; mlMark += markStep) {
      const y = inner.bottom - ((inner.bottom - inner.top) * mlMark) / MAX_ML;
      ctx.strokeStyle = 'rgba(85, 100, 120, 0.55)';
      ctx.lineWidth = mlMark % (markStep * 2) === 0 ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(inner.right + 2, y);
      ctx.lineTo(inner.right + (mlMark % (markStep * 2) === 0 ? 14 : 8), y);
      ctx.stroke();
    }

    if (drop) {
      const { x, y, ry } = drop;
      ctx.fillStyle = WATER_COLOR;
      ctx.beginPath();
      ctx.ellipse(x, y, 5 * ry, 9 * ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = WATER_LIGHT;
      ctx.beginPath();
      ctx.ellipse(x - 1, y - 2 * ry, 2, 3 * ry, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function tick() {
    draw();
    raf = requestAnimationFrame(tick);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  function setMl(value) {
    ml = value;
  }

  function animateDrop(currentMl, options = {}) {
    const L = layout();
    const inner = innerRect(L);
    const targetY = mlToWaterY(inner, currentMl + ML_PER_DROP);
    const startY = inner.top - 20;
    const x = L.cx;
    const duration = 650;
    const t0 = performance.now();

    return new Promise((resolve) => {
      drop = { x, y: startY, ry: 1 };
      function step(now) {
        const p = Math.min((now - t0) / duration, 1);
        const eased = p * p;
        drop.y = startY + (targetY - startY) * eased;
        drop.ry = 1 + eased * 0.35;
        if (p < 1) {
          requestAnimationFrame(step);
        } else {
          drop = null;
          addRipple(1.2);
          options.onImpact?.();
          resolve();
        }
      }
      requestAnimationFrame(step);
    });
  }

  resize();
  tick();

  return {
    setMl,
    animateDrop,
    resize,
    dispose() {
      cancelAnimationFrame(raf);
    },
  };
}
