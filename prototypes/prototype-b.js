import gsap from 'gsap';
import * as THREE from 'three';
import { MAX_ML, ML_PER_DROP } from '../shared/config.js';
import { BeakerWaterRenderer } from '../water-sim/BeakerWaterRenderer.js';

const BEAKER = {
  outerR: 1.32,
  innerR: 1.16,
  wallH: 3.0,
  floorY: 0,
  topY: 3.0,
  baseY: 0.75,
};

const WATER_R = BEAKER.innerR * 1.016;
const WATER_MAX_Y = BEAKER.topY - 0.2;
const WATER_MAX_H = WATER_MAX_Y - BEAKER.floorY;

/**
 * B · Three.js + heightfield Evan Wallace (webgl-water).
 */
export function createPrototypeB(canvas) {
  let ml = 0;
  let fillTop = BEAKER.floorY;
  let fillTween = null;
  let dropTween = null;
  const fillProxy = { y: BEAKER.floorY };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8ecf0);

  const root = new THREE.Group();
  scene.add(root);

  const lightDir = new THREE.Vector3(0.35, 0.85, 0.4).normalize();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.copy(lightDir.clone().multiplyScalar(10));
  scene.add(key);

  const table = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshStandardMaterial({ color: 0xd5dbe2, roughness: 0.92 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = BEAKER.baseY - 0.03;
  root.add(table);

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xf8fbff,
    roughness: 0.05,
    transmission: 0.88,
    thickness: 0.1,
    ior: 1.5,
    transparent: true,
    side: THREE.FrontSide,
    depthWrite: false,
  });
  const innerMat = new THREE.MeshPhysicalMaterial({
    color: 0xd0dce8,
    roughness: 0.08,
    transmission: 0.75,
    transparent: true,
    opacity: 0.1,
    side: THREE.BackSide,
    depthWrite: false,
  });

  const beaker = new THREE.Group();
  beaker.position.y = BEAKER.baseY;
  root.add(beaker);

  const outerWall = new THREE.Mesh(
    new THREE.CylinderGeometry(BEAKER.outerR, BEAKER.outerR, BEAKER.wallH, 64, 1, true),
    glassMat,
  );
  outerWall.position.y = BEAKER.wallH * 0.5;
  beaker.add(outerWall);

  const outerBottom = new THREE.Mesh(
    new THREE.RingGeometry(BEAKER.innerR, BEAKER.outerR, 64),
    glassMat,
  );
  outerBottom.rotation.x = -Math.PI / 2;
  outerBottom.position.y = BEAKER.floorY;
  beaker.add(outerBottom);

  const innerWall = new THREE.Mesh(
    new THREE.CylinderGeometry(BEAKER.innerR, BEAKER.innerR, BEAKER.wallH - 0.08, 64, 1, true),
    innerMat,
  );
  innerWall.position.y = BEAKER.wallH * 0.5;
  innerWall.visible = false;
  beaker.add(innerWall);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(BEAKER.outerR + 0.02, 0.035, 10, 64),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = BEAKER.topY;
  beaker.add(rim);

  const waterRenderer = new BeakerWaterRenderer(renderer, WATER_R, lightDir);
  waterRenderer.group.renderOrder = 5;
  beaker.add(waterRenderer.group);

  const dropGeo = new THREE.SphereGeometry(0.078, 20, 20);
  dropGeo.scale(1, 1.55, 1);
  const drop = new THREE.Mesh(
    dropGeo,
    new THREE.MeshStandardMaterial({ color: 0x1565d8, roughness: 0.12 }),
  );
  drop.visible = false;
  drop.renderOrder = 5;
  beaker.add(drop);

  const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 80);

  const SHALLOW_ML = Math.max(ML_PER_DROP * 2, MAX_ML * (4 / 500));

  function mlToFillY(waterMl) {
    if (waterMl <= 0) return BEAKER.floorY;
    if (waterMl <= SHALLOW_ML) {
      const spread = waterMl / SHALLOW_ML;
      return BEAKER.floorY + WATER_MAX_H * 0.04 * (0.4 + spread * 0.6);
    }
    const minY = BEAKER.floorY + WATER_MAX_H * 0.04;
    const rise = (waterMl - SHALLOW_ML) / (MAX_ML - SHALLOW_ML);
    return minY + rise * (WATER_MAX_Y - minY);
  }

  function syncWater() {
    waterRenderer.setFillY(fillTop, BEAKER.floorY);
  }

  function animateFillTo(targetY, ease = 'power2.out', duration = 0.65) {
    if (fillTween) fillTween.kill();
    fillTween = gsap.to(fillProxy, {
      y: targetY,
      duration,
      ease,
      onUpdate: () => {
        fillTop = fillProxy.y;
        syncWater();
      },
      onComplete: () => {
        fillTop = targetY;
        syncWater();
      },
    });
  }

  function fitCamera() {
    const box = new THREE.Box3().setFromObject(beaker);
    box.min.y -= 0.05;
    box.max.y += 0.14;

    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());

    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const fitFov = Math.min(vFov, hFov);
    const dist = (sphere.radius / Math.sin(fitFov * 0.5)) * 1.18;

    const dir = new THREE.Vector3(0.44, 0.24, 0.5).normalize();
    camera.position.copy(center).addScaledVector(dir, dist);
    camera.lookAt(center.x, center.y + sphere.radius * 0.04, center.z);
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    fitCamera();
  }

  function setMl(value, immediate = false) {
    ml = value;
    const target = mlToFillY(ml);
    if (Math.abs(fillTop - target) < 0.002) return;
    if (fillTween) fillTween.kill();
    if (immediate) {
      fillTop = target;
      fillProxy.y = target;
      syncWater();
      return;
    }
    fillProxy.y = fillTop;
    animateFillTo(target);
  }

  function animateDrop(currentMl, options = {}) {
    const prevY = mlToFillY(currentMl);
    const targetY = mlToFillY(currentMl + ML_PER_DROP);
    const impactY = prevY > BEAKER.floorY + 0.012 ? prevY + 0.015 : BEAKER.floorY + 0.02;
    const startY = BEAKER.topY + 0.6;
    drop.visible = true;
    drop.position.set(0, startY, 0);
    drop.scale.set(1, 1, 1);

    if (dropTween) dropTween.kill();

    return new Promise((resolve) => {
      dropTween = gsap.to(drop.position, {
        y: impactY,
        duration: 0.6,
        ease: 'power2.in',
        onUpdate: () => {
          const p = (startY - drop.position.y) / (startY - impactY);
          drop.scale.y = 1 + p * 0.65;
        },
        onComplete: () => {
          drop.visible = false;
          waterRenderer.splashImpact(1);
          ml = currentMl + ML_PER_DROP;
          options.onImpact?.();

          const startFill = Math.max(BEAKER.floorY + 0.004, prevY);
          fillProxy.y = startFill;
          fillTop = startFill;
          syncWater();

          if (fillTween) fillTween.kill();
          fillTween = gsap.to(fillProxy, {
            y: targetY,
            duration: 0.95,
            ease: 'elastic.out(1, 0.62)',
            onUpdate: () => {
              fillTop = fillProxy.y;
              syncWater();
            },
            onComplete: () => {
              fillTop = targetY;
              fillProxy.y = targetY;
              syncWater();
              resolve();
            },
          });
        },
      });
    });
  }

  let raf = 0;
  function tick() {
    raf = requestAnimationFrame(tick);
    waterRenderer.update(camera);
    renderer.render(scene, camera);
  }

  resize();
  requestAnimationFrame(resize);
  tick();

  return {
    setMl,
    animateDrop,
    resize,
    dispose() {
      cancelAnimationFrame(raf);
      fillTween?.kill();
      dropTween?.kill();
      waterRenderer.dispose();
      renderer.dispose();
    },
  };
}
