export const FULLSCREEN_VERT = `
varying vec2 coord;
void main() {
  coord = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xyz, 1.0);
}
`;

export const WATER_RIPPLE_FRAG = `
precision highp float;
const float PI = 3.141592653589793;
uniform sampler2D tInput;
uniform vec2 center;
uniform float radius;
uniform float strength;
uniform float poolWidth;
uniform float poolLength;
varying vec2 coord;

void main() {
  vec4 info = texture2D(tInput, coord);
  vec2 physicalDiff = (coord - (center * 0.5 + 0.5)) * 2.0 * vec2(poolWidth, poolLength);
  float physRadius = radius * 2.0 * poolLength;
  float drop = max(0.0, 1.0 - length(physicalDiff) / physRadius);
  drop = 0.5 - cos(drop * PI) * 0.5;
  info.r += drop * strength;
  gl_FragColor = info;
}
`;

export const WAVE_SIMULATION_FRAG = `
precision highp float;
uniform sampler2D tInput;
uniform vec2 delta;
uniform float poolWidth;
uniform float poolLength;
varying vec2 coord;

void main() {
  vec4 info = texture2D(tInput, coord);
  vec2 dx = vec2(delta.x, 0.0);
  vec2 dy = vec2(0.0, delta.y);

  float d2h_dx2 =
    texture2D(tInput, coord + dx).r +
    texture2D(tInput, coord - dx).r -
    2.0 * info.r;
  float d2h_dz2 =
    texture2D(tInput, coord + dy).r +
    texture2D(tInput, coord - dy).r -
    2.0 * info.r;

  float stabilityScale = min(1.0, min(poolWidth * poolWidth, poolLength * poolLength));
  info.g += 0.5 * stabilityScale * (
    d2h_dx2 / (poolWidth * poolWidth) +
    d2h_dz2 / (poolLength * poolLength)
  );
  info.g *= 0.995;
  info.r += info.g;

  gl_FragColor = info;
}
`;

/** Escala altura sim → byte (R). Más bajo = olas más visibles en malla. */
export const WATER_HEIGHT_ENCODE = 2.2;

export const WATER_DISPLAY_COPY_FRAG = `
precision highp float;
uniform sampler2D tInput;
varying vec2 coord;

void main() {
  vec4 info = texture2D(tInput, coord);
  float hStore = clamp(info.r + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(hStore, info.b * 0.5 + 0.5, info.a * 0.5 + 0.5, 1.0);
}
`;

export const WATER_NORMAL_FRAG = `
precision highp float;
uniform sampler2D tInput;
uniform float poolWidth;
uniform float poolLength;
uniform vec2 delta;
varying vec2 coord;

void main() {
  vec4 info = texture2D(tInput, coord);
  vec3 dx = vec3(
    delta.x * 2.0 * poolWidth,
    texture2D(tInput, vec2(coord.x + delta.x, coord.y)).r - info.r,
    0.0
  );
  vec3 dy = vec3(
    0.0,
    texture2D(tInput, vec2(coord.x, coord.y + delta.y)).r - info.r,
    delta.y * 2.0 * poolLength
  );
  info.ba = normalize(cross(dy, dx)).xz;
  gl_FragColor = info;
}
`;

export const CAUSTICS_VERT = `
const float IOR_AIR = 1.0;
const float IOR_WATER = 1.333;
uniform vec3 light;
uniform sampler2D water;
uniform float poolDepth;
varying vec3 oldPos;
varying vec3 newPos;

vec2 intersectCube(vec3 origin, vec3 r, vec3 cubeMin, vec3 cubeMax) {
  vec3 tMin = (cubeMin - origin) / r;
  vec3 tMax = (cubeMax - origin) / r;
  vec3 t1 = min(tMin, tMax);
  vec3 t2 = max(tMin, tMax);
  float tNear = max(max(t1.x, t1.y), t1.z);
  float tFar = min(min(t2.x, t2.y), t2.z);
  return vec2(tNear, tFar);
}

vec3 project(vec3 origin, vec3 r, vec3 refractedLight) {
  vec2 tcube = intersectCube(
    origin,
    r,
    vec3(-1.0, -poolDepth, -1.0),
    vec3(1.0, 2.0, 1.0)
  );
  origin += r * tcube.y;
  float tplane = (-origin.y - poolDepth) / refractedLight.y;
  return origin + refractedLight * tplane;
}

void main() {
  vec4 info = texture2D(water, position.xy * 0.5 + 0.5);
  vec2 slope = clamp(info.ba, vec2(-0.999), vec2(0.999));
  float slopeLenSq = min(dot(slope, slope), 0.999);
  vec3 normal = normalize(vec3(slope.x, sqrt(max(0.001, 1.0 - slopeLenSq)), slope.y));

  vec3 refractedLight = refract(-light, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);
  vec3 ray = refract(-light, normal, IOR_AIR / IOR_WATER);
  oldPos = project(position.xzy, refractedLight, refractedLight);
  newPos = project(position.xzy + vec3(0.0, info.r, 0.0), ray, refractedLight);
  gl_Position = vec4(0.75 * (newPos.xz + refractedLight.xz / refractedLight.y), 0.0, 1.0);
}
`;

/** Superficie del vaso: heightfield + Fresnel (simplificado de Evan Wallace). */
export const BEAKER_SURFACE_VERT = `
uniform float poolRadius;
varying vec2 vSimUv;
varying vec3 vWorldPos;

void main() {
  vSimUv = position.xz / (2.0 * poolRadius) + 0.5;
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const BEAKER_SURFACE_FRAG = `
precision highp float;

uniform sampler2D water;
uniform vec3 lightDir;
uniform vec3 eye;
uniform float simTexel;
varying vec2 vSimUv;
varying vec3 vWorldPos;

vec2 smoothSlope(vec2 uv) {
  vec2 t = vec2(simTexel);
  vec2 s = vec2(0.0);
  s += texture2D(water, uv).gb;
  s += texture2D(water, uv + vec2(t.x, 0.0)).gb;
  s += texture2D(water, uv - vec2(t.x, 0.0)).gb;
  s += texture2D(water, uv + vec2(0.0, t.y)).gb;
  s += texture2D(water, uv - vec2(0.0, t.y)).gb;
  return s * 0.2 * 2.0 - 1.0;
}

void main() {
  float edge = length(vSimUv - 0.5) * 2.0;
  if (edge > 1.002) discard;

  vec2 slope = smoothSlope(vSimUv);
  float slopeLen = min(dot(slope, slope), 0.999);
  vec3 normal = normalize(vec3(slope.x, sqrt(1.0 - slopeLen), slope.y));

  vec3 viewDir = normalize(eye - vWorldPos);
  vec3 L = normalize(lightDir);
  float edgeDist = length(vSimUv - 0.5) * 2.0;
  float fresnel = 0.02 + 0.96 * pow(1.0 - max(dot(viewDir, normal), 0.0), 5.0);
  fresnel *= 1.0 - smoothstep(0.84, 0.99, edgeDist) * 0.88;

  vec3 deep = vec3(0.05, 0.28, 0.63);
  vec3 shallow = vec3(0.26, 0.65, 0.96);
  vec3 refractCol = mix(deep, shallow, 0.38);
  vec3 reflectCol = vec3(0.86, 0.92, 0.98);
  vec3 col = mix(refractCol, reflectCol, fresnel);
  col = mix(col, shallow, smoothstep(0.9, 0.99, edgeDist) * 0.55);

  float spec = pow(max(dot(reflect(-L, normal), viewDir), 0.0), 80.0);
  spec *= 1.0 - smoothstep(0.86, 0.99, edgeDist) * 0.92;
  col += spec * vec3(0.85, 0.92, 1.0) * (0.65 + length(slope) * 1.8);

  gl_FragColor = vec4(col, 0.96);
}
`;

/** Fondo del vaso con cáusticas proyectadas. */
export const BEAKER_FLOOR_FRAG = `
precision highp float;
uniform sampler2D causticTex;
uniform float poolRadius;
uniform float waterDepth;
varying vec2 vFloorUv;

void main() {
  float edge = length(vFloorUv - 0.5) * 2.0;
  if (edge > 1.0) discard;

  vec2 t = vec2(1.0 / 1024.0);
  float shallow = smoothstep(0.015, 0.1, waterDepth);
  float c =
    (texture2D(causticTex, vFloorUv).r * 0.4 +
    texture2D(causticTex, vFloorUv + vec2(t.x, 0.0)).r * 0.15 +
    texture2D(causticTex, vFloorUv - vec2(t.x, 0.0)).r * 0.15 +
    texture2D(causticTex, vFloorUv + vec2(0.0, t.y)).r * 0.15 +
    texture2D(causticTex, vFloorUv - vec2(0.0, t.y)).r * 0.15) * shallow;

  vec3 shallowCol = vec3(0.18, 0.52, 0.9);
  vec3 deepCol = vec3(0.04, 0.18, 0.42);
  vec3 base = mix(shallowCol, deepCol, shallow);
  vec3 col = base + vec3(0.22, 0.38, 0.55) * c;

  float rimFade = smoothstep(0.9, 0.995, edge) * smoothstep(0.07, 0.11, waterDepth);
  float alpha = mix(0.88, 0.94, shallow) * (1.0 - rimFade * 0.95);
  col = mix(col, deepCol, rimFade * 0.45);
  gl_FragColor = vec4(col, alpha);
}
`;

export const BEAKER_FLOOR_VERT = `
uniform float poolRadius;
varying vec2 vFloorUv;
void main() {
  vFloorUv = position.xy / (2.0 * poolRadius) + 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Paredes internas de agua (gradiente vertical). */
export const BEAKER_WALL_VERT = `
varying float vDepth;
void main() {
  vDepth = uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const BEAKER_WALL_FRAG = `
precision highp float;
uniform float fillDepth;
varying float vDepth;
void main() {
  vec3 deep = vec3(0.04, 0.24, 0.58);
  vec3 mid = vec3(0.1, 0.4, 0.76);
  vec3 top = vec3(0.18, 0.52, 0.88);
  vec3 col = mix(deep, mid, smoothstep(0.05, 0.72, vDepth));
  col = mix(col, top, smoothstep(0.82, 1.0, vDepth) * 0.55);

  float fadeIn = smoothstep(0.075, 0.115, fillDepth);
  float alpha = mix(0.82, 0.9, vDepth) * fadeIn;
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(col, alpha);
}
`;

export const CAUSTICS_FRAG = `
precision highp float;
uniform vec3 light;
uniform float poolDepth;
varying vec3 oldPos;
varying vec3 newPos;

vec2 intersectCube(vec3 origin, vec3 r, vec3 cubeMin, vec3 cubeMax) {
  vec3 tMin = (cubeMin - origin) / r;
  vec3 tMax = (cubeMax - origin) / r;
  vec3 t1 = min(tMin, tMax);
  vec3 t2 = max(tMin, tMax);
  float tNear = max(max(t1.x, t1.y), t1.z);
  float tFar = min(min(t2.x, t2.y), t2.z);
  return vec2(tNear, tFar);
}

void main() {
  float oldArea = length(dFdx(oldPos)) * length(dFdy(oldPos));
  float newArea = length(dFdx(newPos)) * length(dFdy(newPos));
  float intensity = oldArea / max(newArea, 0.0001) * 0.14;

  const float IOR_AIR = 1.0;
  const float IOR_WATER = 1.333;
  vec3 refractedLight = refract(-light, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);

  vec2 t = intersectCube(
    newPos,
    -refractedLight,
    vec3(-1.0, -poolDepth, -1.0),
    vec3(1.0, 2.0, 1.0)
  );
  float fade = 1.0 / (1.0 + exp(
    -200.0 / (1.0 + 10.0 * (t.y - t.x)) *
    (newPos.y - refractedLight.y * t.y - poolDepth * 0.15)
  ));
  gl_FragColor = vec4(intensity * fade, 1.0, 1.0, 1.0);
}
`;
