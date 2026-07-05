import * as THREE from "three";
import { CAUSTICS_VERT, CAUSTICS_FRAG } from "./shaders.js";

/**
 * Genera mapa de cáusticas por método de área diferencial (Evan Wallace).
 */
export class BeakerCausticsPass {
  constructor(renderer, lightDirection) {
    this.renderer = renderer;
    this.lightDirection = lightDirection;

    this.target = new THREE.WebGLRenderTarget(1024, 1024, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });
    this.texture = this.target.texture;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();

    this.material = new THREE.ShaderMaterial({
      vertexShader: CAUSTICS_VERT,
      fragmentShader: CAUSTICS_FRAG,
      uniforms: {
        light: { value: lightDirection.clone() },
        water: { value: null },
        poolDepth: { value: 1 },
      },
      blending: THREE.NoBlending,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      extensions: { derivatives: true },
    });

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2, 128, 128),
      this.material
    );
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  setPoolDepth(depth) {
    this.material.uniforms.poolDepth.value = Math.max(depth, 0.12);
  }

  setLightDirection(direction) {
    this.material.uniforms.light.value.copy(direction);
  }

  update(waterTexture) {
    this.material.uniforms.water.value = waterTexture;
    this.renderer.setRenderTarget(this.target);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}
