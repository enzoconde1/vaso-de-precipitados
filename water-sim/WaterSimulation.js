import * as THREE from 'three';
import { CpuWaveField } from './CpuWaveField.js';

/**
 * Simulación heightfield (CPU) con texturas GPU para shaders.
 * Misma ecuación de ondas que Evan Wallace / webgl-water.
 */
export class WaterSimulation {
  constructor(renderer, worldRadius, resolution = 256) {
    this.renderer = renderer;
    this.worldRadius = worldRadius;
    this.size = resolution;
    this.field = new CpuWaveField(resolution);

    this.displayData = new Uint8Array(resolution * resolution * 4);
    this.simulationData = new Float32Array(resolution * resolution * 4);

    this.displayTexture = new THREE.DataTexture(
      this.displayData,
      resolution,
      resolution,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    this.displayTexture.minFilter = THREE.LinearFilter;
    this.displayTexture.magFilter = THREE.LinearFilter;
    this.displayTexture.needsUpdate = true;

    this.simulationTextureObj = new THREE.DataTexture(
      this.simulationData,
      resolution,
      resolution,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    this.simulationTextureObj.minFilter = THREE.NearestFilter;
    this.simulationTextureObj.magFilter = THREE.NearestFilter;
    this.simulationTextureObj.needsUpdate = true;

    this._publish();
  }

  get texture() {
    return this.displayTexture;
  }

  get simulationTexture() {
    return this.simulationTextureObj;
  }

  _publish() {
    this.displayData.set(this.field.packDisplay());
    this.simulationData.set(this.field.packSimulation());
    this.displayTexture.needsUpdate = true;
    this.simulationTextureObj.needsUpdate = true;
  }

  clear() {
    this.field.clear();
    this._publish();
  }

  addDrop(x, y, radius, strength) {
    this.field.addDrop(x, y, radius, strength);
    this._publish();
  }

  stepSimulation() {
    this.field.step();
  }

  updateNormals() {
    this.field.updateNormals();
    this._publish();
  }

  worldToSimNDC(x, z) {
    return new THREE.Vector2(
      THREE.MathUtils.clamp(x / this.worldRadius, -1, 1),
      THREE.MathUtils.clamp(z / this.worldRadius, -1, 1),
    );
  }

  addDropAtWorld(x, z, radius = 0.06, strength = -0.08) {
    const ndc = this.worldToSimNDC(x, z);
    this.addDrop(ndc.x, ndc.y, radius, strength);
  }

  sampleHeight(u, v) {
    return this.field.sampleHeight(u, v);
  }

  readSimulationField() {
    return this.field.packSimulation();
  }

  readHeightField() {
    return this.field.packDisplay();
  }

  dispose() {
    this.displayTexture?.dispose();
    this.simulationTextureObj?.dispose();
  }
}
