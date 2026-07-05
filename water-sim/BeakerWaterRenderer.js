import * as THREE from 'three';
import { WaterSimulation } from './WaterSimulation.js';
import { BeakerCausticsPass } from './BeakerCausticsPass.js';
import {
  BEAKER_SURFACE_VERT,
  BEAKER_SURFACE_FRAG,
  BEAKER_FLOOR_VERT,
  BEAKER_FLOOR_FRAG,
  BEAKER_WALL_VERT,
  BEAKER_WALL_FRAG,
} from './shaders.js';

/**
 * Agua heightfield: fondo + paredes suaves + superficie ondulada.
 */
export class BeakerWaterRenderer {
  constructor(renderer, poolRadius, lightDirection) {
    this.renderer = renderer;
    this.poolRadius = poolRadius;
    this.fillY = 0;
    this._baseSurfaceY = new Float32Array(0);
    this._baseWallY = new Float32Array(0);
    this._fillDepth = 0;
    this._bounce = { t0: 0, amp: 0 };

    this.sim = new WaterSimulation(renderer, poolRadius, 256);
    this.caustics = new BeakerCausticsPass(renderer, lightDirection);

    this.group = new THREE.Group();
    this.group.renderOrder = 5;

    const surfaceGeo = new THREE.CircleGeometry(poolRadius, 64, 64);
    surfaceGeo.rotateX(-Math.PI / 2);
    surfaceGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this._initSurfaceBase(surfaceGeo);

    this.surfaceMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide,
      uniforms: {
        water: { value: this.sim.texture },
        poolRadius: { value: poolRadius },
        lightDir: { value: lightDirection.clone() },
        eye: { value: new THREE.Vector3() },
        simTexel: { value: 1 / 256 },
      },
      vertexShader: BEAKER_SURFACE_VERT,
      fragmentShader: BEAKER_SURFACE_FRAG,
    });
    this.surface = new THREE.Mesh(surfaceGeo, this.surfaceMat);
    this.surface.renderOrder = 4;
    this.group.add(this.surface);

    const floorGeo = new THREE.CircleGeometry(poolRadius, 96);
    this.floorMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: true,
      uniforms: {
        causticTex: { value: this.caustics.texture },
        poolRadius: { value: poolRadius },
        waterDepth: { value: 0.05 },
      },
      vertexShader: BEAKER_FLOOR_VERT,
      fragmentShader: BEAKER_FLOOR_FRAG,
    });
    this.floor = new THREE.Mesh(floorGeo, this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.renderOrder = 2;
    this.group.add(this.floor);

    const wallGeo = new THREE.CylinderGeometry(poolRadius, poolRadius, 1, 64, 4, true);
    wallGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this._initWallBase(wallGeo);

    this.wallMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: true,
      side: THREE.FrontSide,
      uniforms: {
        fillDepth: { value: 0 },
      },
      vertexShader: BEAKER_WALL_VERT,
      fragmentShader: BEAKER_WALL_FRAG,
    });
    this.walls = new THREE.Mesh(wallGeo, this.wallMat);
    this.walls.renderOrder = 3;
    this.group.add(this.walls);

    this.group.visible = false;
  }

  _initSurfaceBase(geometry) {
    const pos = geometry.attributes.position;
    this._baseSurfaceY = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i += 1) {
      this._baseSurfaceY[i] = pos.getY(i);
    }
  }

  _initWallBase(geometry) {
    const pos = geometry.attributes.position;
    this._wallUv = geometry.attributes.uv;
    this._wallPos = pos;
    this._baseWallY = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i += 1) {
      this._baseWallY[i] = pos.getY(i);
    }
  }

  _bounceOffset(u, v) {
    const age = (performance.now() - this._bounce.t0) * 0.001;
    if (age <= 0 || age > 1.1 || this._bounce.amp <= 0) return 0;

    const dist = Math.hypot(u - 0.5, v - 0.5) * 2.0;
    const crown = Math.exp(-dist * dist * 10.0);
    const settle = Math.exp(-age * 5.5);
    return crown * Math.sin(age * 22.0) * settle * 0.045 * this._bounce.amp;
  }

  _depthScale() {
    if (this._fillDepth >= 0.085) return 1;
    if (this._fillDepth <= 0.028) return 0.3;
    return THREE.MathUtils.mapLinear(this._fillDepth, 0.028, 0.085, 0.3, 1);
  }

  _displacementAt(u, v) {
    const shallow = this._fillDepth < 0.065;
    const k = shallow ? this._depthScale() : 1;
    const waveMul = shallow ? 1.5 : 2.15;
    const wave = this.sim.sampleHeight(u, v) * waveMul * k;
    const bounce = this._bounceOffset(u, v) * k;
    const raw = wave + bounce;

    if (!shallow) return raw;

    const limit = Math.max(this._fillDepth * 0.42, 0.002);
    return THREE.MathUtils.clamp(raw, -limit * 0.35, limit);
  }

  _applyHeightFieldToMesh() {
    const r = this.poolRadius;
    const pos = this.surface.geometry.attributes.position;

    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const u = x / (2 * r) + 0.5;
      const v = z / (2 * r) + 0.5;
      const disp = this._displacementAt(u, v);
      pos.setY(i, this._baseSurfaceY[i] + disp);
    }
    pos.needsUpdate = true;

    for (let i = 0; i < this._wallPos.count; i += 1) {
      const rim = this._wallUv.getY(i);
      const x = this._wallPos.getX(i);
      const z = this._wallPos.getZ(i);
      const u = x / (2 * r) + 0.5;
      const v = z / (2 * r) + 0.5;
      const disp = this._displacementAt(u, v);
      const topBand = THREE.MathUtils.smoothstep(0.72, 1.0, rim);
      this._wallPos.setY(i, this._baseWallY[i] + disp * topBand);
    }
    this._wallPos.needsUpdate = true;
  }

  setLightDirection(dir) {
    this.surfaceMat.uniforms.lightDir.value.copy(dir);
    this.caustics.setLightDirection(dir);
  }

  setFillY(y, floorY) {
    this.fillY = y;
    const depth = Math.max(y - floorY, 0.001);
    const visible = depth > 0.003;

    if (!visible) {
      this.group.visible = false;
      return;
    }

    this._fillDepth = depth;

    this.group.visible = true;
    this.group.scale.set(1, 1, 1);

    this.surface.position.y = y;
    this.floor.position.y = floorY + 0.0005;

    const wallOverlap = 0.005;
    this.walls.visible = depth > 0.055;
    this.walls.scale.y = depth + wallOverlap;
    this.walls.position.y = floorY + (depth + wallOverlap) * 0.5;
    this.wallMat.uniforms.fillDepth.value = depth;

    this.floor.visible = depth > 0.012;
    this.floorMat.uniforms.waterDepth.value = depth;
    this.caustics.setPoolDepth(Math.max(depth, 0.1));
  }

  splashImpact(strength = 1) {
    const shallow = this._fillDepth < 0.065;
    const k = shallow ? Math.max(this._depthScale(), 0.35) : 1;
    this.sim.clear();
    this._bounce = { t0: performance.now(), amp: strength * (shallow ? k : 1) };
    this.sim.addDropAtWorld(0, 0, 0.028, 0.092 * strength * k);
    this.sim.addDropAtWorld(0, 0, 0.052, -0.056 * strength * k);
    this.sim.updateNormals();
  }

  update(camera) {
    this.sim.stepSimulation();
    this.sim.stepSimulation();
    if (this._fillDepth >= 0.07) {
      this.sim.stepSimulation();
    }
    this.sim.updateNormals();

    if (!this.group.visible) return;

    this._applyHeightFieldToMesh();
    if (this._fillDepth >= 0.06) {
      this.caustics.update(this.sim.simulationTexture);
    }
    this.surfaceMat.uniforms.water.value = this.sim.texture;
    this.surfaceMat.uniforms.eye.value.copy(camera.position);
  }

  dispose() {
    this.sim.dispose();
    this.caustics.dispose();
    this.surface.geometry.dispose();
    this.floor.geometry.dispose();
    this.walls.geometry.dispose();
    this.surfaceMat.dispose();
    this.floorMat.dispose();
    this.wallMat.dispose();
  }
}
