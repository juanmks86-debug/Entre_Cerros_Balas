// Entre cerros y balas — versión web para celular
// Motor WebGL2 propio, sin dependencias. Si existen modelos .glb en ./modelos/
// (exportados desde el proyecto de Unreal) se usan en lugar de los recreados.

const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
if (!gl) { document.getElementById('nogl').hidden = false; throw new Error('WebGL2 no disponible'); }

/* ------------------------------------------------------------------ */
/* Matemática                                                          */
/* ------------------------------------------------------------------ */
const I4 = () => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };
function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
const chain = (...ms) => ms.reduce((a, b) => mul(a, b));
function T(x, y, z) { const m = I4(); m[12] = x; m[13] = y; m[14] = z; return m; }
function S(x, y = x, z = x) { const m = I4(); m[0] = x; m[5] = y; m[10] = z; return m; }
function RX(a) { const m = I4(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
function RY(a) { const m = I4(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
function RZ(a) { const m = I4(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
function persp(fovy, asp, n, f) {
  const t = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
  m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const xf = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
const xfDir = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function lookAt(e, f, up) {
  const s = norm(cross(f, up)), u = cross(s, f), m = I4();
  m[0] = s[0]; m[4] = s[1]; m[8] = s[2];
  m[1] = u[0]; m[5] = u[1]; m[9] = u[2];
  m[2] = -f[0]; m[6] = -f[1]; m[10] = -f[2];
  m[12] = -dot(s, e); m[13] = -dot(u, e); m[14] = dot(f, e);
  return { m, s, u };
}
const hex = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// ruido determinista
function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf_ = x - xi, yf = y - yi;
  const u = xf_ * xf_ * (3 - 2 * xf_), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v);
}
function fbm(x, y, o = 4) { let s = 0, a = .5, t = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x, y); t += a; x *= 2.03; y *= 2.03; a *= .5; } return s / t; }
let seed = 7;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */
const VS = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec3 aC; layout(location=3) in vec2 aU;
uniform mat4 uP, uV, uM;
out vec3 vN, vC, vW; out vec2 vU;
void main(){ vec4 w = uM*vec4(aP,1.); vW=w.xyz; vN=mat3(uM)*aN; vC=aC; vU=aU; gl_Position=uP*uV*w; }`;
const FS = `#version 300 es
precision highp float;
in vec3 vN, vC, vW; in vec2 vU;
uniform vec3 uSun, uCam, uFog, uTint, uEmit; uniform float uFogD, uAlpha; uniform int uTex; uniform sampler2D uS;
out vec4 o;
void main(){
  vec3 n = normalize(vN); if(!gl_FrontFacing) n = -n;
  vec3 base = vC*uTint; if(uTex==1) base *= texture(uS, vU).rgb;
  float d = max(dot(n, uSun), 0.);
  vec3 hemi = mix(vec3(.40,.31,.26), vec3(.60,.68,.80), n.y*.5+.5);
  vec3 col = base*(hemi*.78 + vec3(1.,.92,.78)*d*.95) + uEmit;
  float dist = length(vW-uCam);
  float f = 1.-exp(-pow(dist*uFogD, 1.6));
  o = vec4(mix(col, uFog, clamp(f,0.,1.)), uAlpha);
}`;
const SKY_VS = `#version 300 es
out vec2 vQ; void main(){ vec2 p=vec2((gl_VertexID<<1)&2, gl_VertexID&2); vQ=p*2.-1.; gl_Position=vec4(vQ,0.,1.); }`;
const SKY_FS = `#version 300 es
precision highp float; in vec2 vQ; uniform float uPitch, uTanH, uAsp, uYaw; uniform vec3 uZen, uHor, uSunDir;
out vec4 o;
void main(){
  float elev = atan(vQ.y*uTanH) + uPitch;
  float t = smoothstep(-.05, .9, elev);
  vec3 c = mix(uHor, uZen, pow(t,.7));
  float az = uYaw - atan(vQ.x*uTanH*uAsp);
  float sa = atan(uSunDir.x, -uSunDir.z), se = asin(uSunDir.y);
  float da = abs(mod(az - sa + 3.14159, 6.28318) - 3.14159);
  float g = exp(-(da*da*9. + (elev-se)*(elev-se)*9.));
  c += vec3(1.,.85,.6)*g*.55;
  o = vec4(c,1.);
}`;
function prog(vs, fs) {
  const p = gl.createProgram();
  for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    gl.attachShader(p, sh);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}
const P = prog(VS, FS), SKY = prog(SKY_VS, SKY_FS);
const skyVAO = gl.createVertexArray();

/* ------------------------------------------------------------------ */
/* Geometría low-poly con sombreado plano                              */
/* ------------------------------------------------------------------ */
class Geo {
  constructor() { this.p = []; this.n = []; this.c = []; }
  tri(a, b, c, col) {
    const n = norm(cross(sub(b, a), sub(c, a)));
    for (const q of [a, b, c]) { this.p.push(q[0], q[1], q[2]); this.n.push(n[0], n[1], n[2]); this.c.push(col[0], col[1], col[2]); }
  }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  box(m, col) {
    const v = []; for (let i = 0; i < 8; i++) v.push(xf(m, [(i & 1) - .5, ((i >> 1) & 1) - .5, ((i >> 2) & 1) - .5]));
    for (const f of [[1, 3, 7, 5], [0, 4, 6, 2], [2, 6, 7, 3], [0, 1, 5, 4], [4, 5, 7, 6], [0, 2, 3, 1]]) this.quad(v[f[0]], v[f[1]], v[f[2]], v[f[3]], col);
  }
  // cilindro en Y de 0 a 1
  cyl(m, seg, rb, rt, col, caps = true) {
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      const B0 = xf(m, [Math.cos(a0) * rb, 0, Math.sin(a0) * rb]), B1 = xf(m, [Math.cos(a1) * rb, 0, Math.sin(a1) * rb]);
      const T0 = xf(m, [Math.cos(a0) * rt, 1, Math.sin(a0) * rt]), T1 = xf(m, [Math.cos(a1) * rt, 1, Math.sin(a1) * rt]);
      this.quad(B0, T0, T1, B1, col);
      if (caps) { if (rt > 0) this.tri(xf(m, [0, 1, 0]), T1, T0, col); if (rb > 0) this.tri(xf(m, [0, 0, 0]), B0, B1, col); }
    }
  }
  sph(m, lat, lon, col, jitter = 0) {
    const pt = (i, j) => {
      const th = i / lat * Math.PI, ph = j / lon * Math.PI * 2;
      const r = 1 + (i > 0 && i < lat ? (hash2(i * 7 + 3, (j % lon) * 13 + 1) - .5) * jitter : 0);
      return xf(m, [Math.sin(th) * Math.cos(ph) * r, Math.cos(th) * r, Math.sin(th) * Math.sin(ph) * r]);
    };
    for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) {
      const a = pt(i, j), b = pt(i, j + 1), c = pt(i + 1, j + 1), d = pt(i + 1, j);
      if (i === 0) this.tri(a, c, d, col); else if (i === lat - 1) this.tri(a, b, c, col); else this.quad(a, b, c, d, col);
    }
  }
}
function upload(g) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const buf = (data, loc, size) => {
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };
  buf(g.p, 0, 3); buf(g.n, 1, 3); buf(g.c, 2, 3);
  gl.bindVertexArray(null);
  return { vao, count: g.p.length / 3 };
}

/* ------------------------------------------------------------------ */
/* Paleta (Quebrada de Humahuaca / Cerro de los Siete Colores)         */
/* ------------------------------------------------------------------ */
const PAL = ['#8c4f63', '#c2603f', '#d9a25b', '#7f8a55', '#e8cfa1', '#9b5a3c', '#6e5a7a', '#b8743f'].map(hex);
const C = {
  camino: hex('#bf9264'), monte: hex('#8a8550'), monte2: hex('#a89363'),
  cardon: hex('#5f7f3e'), cardon2: hex('#4e6b33'), roca: hex('#8b7462'), roca2: hex('#6f5d50'),
  azul: hex('#24386a'), rojo: hex('#a6262b'), blanco: hex('#e7e0cd'), negro: hex('#17130f'), piel: hex('#c99a74'),
  madera: hex('#6a3b1f'), metal: hex('#3d3d42'), bronce: hex('#b58a3a'), dorado: hex('#e6c35a'), plata: hex('#d8dde3'),
  caballo: hex('#6e4127'), crin: hex('#1c1410'), cuero: hex('#3b2416'),
  humo: hex('#d9d2c4'), fogon: hex('#ffcf6a'),
  cielo: hex('#3f80c8'), horizonte: hex('#f1dcb6'), niebla: hex('#e6d0ad'), cumbres: hex('#6c5a74')
};
const SUN = norm([0.45, 0.62, -0.64]);

/* ------------------------------------------------------------------ */
/* Recorrido (BP_RailPath)                                             */
/* ------------------------------------------------------------------ */
const CTRL = [[0, 60], [2, 0], [22, -80], [-14, -165], [12, -250], [-24, -340], [6, -430], [30, -515], [2, -600], [-20, -690], [-6, -770], [0, -800]];
const PATH = [];
(function buildPath() {
  const pts = CTRL.map(p => [p[0], p[1]]);
  const cr = (p0, p1, p2, p3, t) => {
    const t2 = t * t, t3 = t2 * t;
    return [0, 1].map(k => .5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < 40; k++) PATH.push(cr(p0, p1, p2, p3, k / 40));
  }
  PATH.push(pts[pts.length - 1]);
  let acc = 0; PATH[0].s = 0;
  for (let i = 1; i < PATH.length; i++) { acc += Math.hypot(PATH[i][0] - PATH[i - 1][0], PATH[i][1] - PATH[i - 1][1]); PATH[i].s = acc; }
})();
const PATH_LEN = PATH[PATH.length - 1].s;
const START_S = 60;
function pathAt(s) {
  s = clamp(s, 0, PATH_LEN);
  let lo = 0, hi = PATH.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (PATH[m].s < s) lo = m; else hi = m; }
  const a = PATH[lo], b = PATH[hi], t = (s - a.s) / Math.max(1e-6, b.s - a.s);
  const x = lerp(a[0], b[0], t), z = lerp(a[1], b[1], t);
  const d = norm([b[0] - a[0], 0, b[1] - a[1]]);
  return { x, z, dir: d, side: [-d[2], 0, d[0]] };
}
function distToPath(x, z) {
  let best = 1e9;
  for (let i = 0; i < PATH.length; i += 2) { const dx = PATH[i][0] - x, dz = PATH[i][1] - z, d = dx * dx + dz * dz; if (d < best) best = d; }
  return Math.sqrt(best);
}

/* ------------------------------------------------------------------ */
/* Terreno con relieve                                                 */
/* ------------------------------------------------------------------ */
const TX0 = -300, TX1 = 300, TZ0 = -880, TZ1 = 140, STEP = 6;
const NX = (TX1 - TX0) / STEP, NZ = (TZ1 - TZ0) / STEP;
const HGT = new Float32Array((NX + 1) * (NZ + 1));
const DST = new Float32Array((NX + 1) * (NZ + 1));
function rawH(x, z, d) {
  const base = 2.4 * fbm(x * .02, z * .02, 3) - 1.2;
  const mask = smooth(9, 115, d);
  const big = (24 + 78 * fbm(x * .0055 + 11, z * .0055 - 3, 4)) * mask;
  const crest = 60 * Math.pow(Math.max(0, fbm(x * .011 - 5, z * .011 + 9, 3) - .42), 1.4) * mask;
  const far = smooth(140, 300, d) * 70 * fbm(x * .003, z * .003, 2);
  return base + big + crest + far;
}
for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
  const x = TX0 + i * STEP, z = TZ0 + j * STEP, d = distToPath(x, z);
  DST[j * (NX + 1) + i] = d; HGT[j * (NX + 1) + i] = rawH(x, z, d);
}
function heightAt(x, z) {
  const fx = clamp((x - TX0) / STEP, 0, NX - 1e-3), fz = clamp((z - TZ0) / STEP, 0, NZ - 1e-3);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, W = NX + 1;
  return lerp(lerp(HGT[j * W + i], HGT[j * W + i + 1], u), lerp(HGT[(j + 1) * W + i], HGT[(j + 1) * W + i + 1], u), v);
}
function terrainColor(x, y, z, d) {
  const k = .93 + hash2(Math.floor(x * 3.1), Math.floor(z * 2.7)) * .14;
  if (d < 4.2) return shade(C.camino, k * (.94 + .1 * vnoise(x * .3, z * .3)));
  if (y < 4.5 + 3 * vnoise(x * .05, z * .05)) return shade(vnoise(x * .08, z * .08) > .5 ? C.monte : C.monte2, k);
  const t = (y + 14 * fbm(x * .0035, z * .0035, 2) + x * .015) / 10.5;
  const idx = ((Math.floor(t) % PAL.length) + PAL.length) % PAL.length;
  return shade(PAL[idx], k);
}
const terrain = (() => {
  const g = new Geo(), W = NX + 1;
  const V = (i, j) => [TX0 + i * STEP, HGT[j * W + i], TZ0 + j * STEP];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const a = V(i, j), b = V(i + 1, j), c = V(i + 1, j + 1), d = V(i, j + 1);
    const flip = (i + j) & 1;
    const t1 = flip ? [a, d, b] : [a, d, c], t2 = flip ? [b, d, c] : [a, c, b];
    for (const t of [t1, t2]) {
      const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3, cz = (t[0][2] + t[1][2] + t[2][2]) / 3;
      g.tri(t[0], t[1], t[2], terrainColor(cx, cy, cz, distToPathFast(cx, cz)));
    }
  }
  return upload(g);
})();
function distToPathFast(x, z) {
  const fx = clamp((x - TX0) / STEP, 0, NX - 1e-3), fz = clamp((z - TZ0) / STEP, 0, NZ - 1e-3);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, W = NX + 1;
  return lerp(lerp(DST[j * W + i], DST[j * W + i + 1], u), lerp(DST[(j + 1) * W + i], DST[(j + 1) * W + i + 1], u), v);
}

/* ------------------------------------------------------------------ */
/* Escenografía: cardones, rocas, cumbres lejanas                      */
/* ------------------------------------------------------------------ */
function addCardon(g, x, z, h) {
  const y = heightAt(x, z) - .6, r = .32 + rnd() * .1, ry = rnd() * 6.28;
  const base = chain(T(x, y, z), RY(ry));
  g.cyl(chain(base, S(1, h, 1)), 9, r, r * .92, C.cardon, true);
  g.sph(chain(base, T(0, h, 0), S(r * .92, r * .7, r * .92)), 3, 9, C.cardon);
  const arms = 1 + Math.floor(rnd() * 3);
  for (let a = 0; a < arms; a++) {
    const ang = a / arms * 6.28 + rnd(), ay = h * (.35 + rnd() * .3), out = .55 + rnd() * .35, up = h * (.25 + rnd() * .25);
    const dirM = chain(base, RY(ang));
    g.box(chain(dirM, T(out / 2 + r * .6, ay, 0), S(out, r * 1.1, r * 1.1)), C.cardon2);
    g.cyl(chain(dirM, T(out + r * .6, ay - r * .4, 0), S(1, up, 1)), 7, r * .75, r * .7, C.cardon, true);
    g.sph(chain(dirM, T(out + r * .6, ay - r * .4 + up, 0), S(r * .7, r * .5, r * .7)), 3, 7, C.cardon);
  }
}
function addRock(g, x, z, s) {
  const y = heightAt(x, z);
  g.sph(chain(T(x, y - s * .15, z), RY(rnd() * 6), S(s * (1 + rnd() * .5), s * (.6 + rnd() * .3), s)), 3, 6, rnd() > .5 ? C.roca : C.roca2, .35);
}
const COVER = []; let coverListo = false;
const props = (() => {
  const g = new Geo();
  let n = 0, tries = 0;
  while (n < 170 && tries < 5000) {
    tries++;
    const x = TX0 + 20 + rnd() * (TX1 - TX0 - 40), z = TZ0 + 20 + rnd() * (TZ1 - TZ0 - 40), d = distToPathFast(x, z);
    if (d < 7 || d > 170) continue;
    const s1 = heightAt(x + 2, z) - heightAt(x - 2, z), s2 = heightAt(x, z + 2) - heightAt(x, z - 2);
    if (Math.hypot(s1, s2) > 2.4) continue;
    addCardon(g, x, z, 3.2 + rnd() * 3.6); n++;
  }
  n = 0; tries = 0;
  while (n < 110 && tries < 5000) {
    tries++;
    const x = TX0 + 20 + rnd() * (TX1 - TX0 - 40), z = TZ0 + 20 + rnd() * (TZ1 - TZ0 - 40), d = distToPathFast(x, z);
    if (d < 6 || d > 200) continue;
    addRock(g, x, z, .6 + rnd() * 2.2); n++;
  }
  return g;
})();
const far = (() => {
  const g = new Geo();
  for (let i = 0; i < 46; i++) {
    const a = i / 46 * Math.PI * 2 + rnd() * .1, r = 620 + rnd() * 260, cx = Math.sin(a) * r, cz = -360 + Math.cos(a) * r * 1.25;
    const h = 120 + rnd() * 190, w = 140 + rnd() * 160;
    const top = [cx + (rnd() - .5) * 40, h, cz + (rnd() - .5) * 40];
    const segs = 9, rim = [], mid = [];
    for (let k = 0; k < segs; k++) {
      const a0 = k / segs * 6.283, rr = w * (.7 + rnd() * .5), mr = rr * (.45 + rnd() * .15);
      rim.push([cx + Math.cos(a0) * rr, -10, cz + Math.sin(a0) * rr]);
      mid.push([lerp(top[0], cx + Math.cos(a0) * mr, 1), h * (.42 + rnd() * .2), lerp(top[2], cz + Math.sin(a0) * mr, 1)]);
    }
    for (let k = 0; k < segs; k++) {
      const n = (k + 1) % segs, c1 = shade(C.cumbres, .8 + rnd() * .35), c2 = shade(C.cumbres, .8 + rnd() * .35);
      g.quad(rim[k], mid[k], mid[n], rim[n], c1);
      g.tri(mid[k], top, mid[n], c2);
    }
    if (h > 230) {
      const sn = [cx, h, cz];
      for (let k = 0; k < segs; k++) {
        const a0 = k / segs * 6.283, a1 = (k + 1) / segs * 6.283, ww = w * .22, hh = h * .78;
        g.tri([top[0] + Math.cos(a0) * ww, hh, top[2] + Math.sin(a0) * ww], top, [top[0] + Math.cos(a1) * ww, hh, top[2] + Math.sin(a1) * ww], hex('#f2efe8'));
      }
    }
  }
  return upload(g);
})();

/* ------------------------------------------------------------------ */
/* Modelos recreados (se reemplazan si hay .glb)                       */
/* ------------------------------------------------------------------ */
// Soldado realista (Bp_enemigo / soldado_espanol). Mira hacia +Z, pies en y=0.
const soldierBody = (() => {
  const g = new Geo();
  for (const sx of [-1, 1]) {
    g.box(chain(T(sx * .12, .13, .03), S(.15, .26, .28)), C.negro);
    g.box(chain(T(sx * .12, .58, 0), S(.17, .64, .19)), C.blanco);
  }
  g.box(chain(T(0, 1.13, 0), S(.48, .62, .29)), C.azul);
  g.box(chain(T(0, .82, -.07), S(.46, .26, .14)), C.azul);
  g.box(chain(T(0, 1.18, .148), S(.22, .44, .02)), C.rojo);
  g.box(chain(T(0, 1.44, 0), S(.3, .09, .3)), C.rojo);
  g.box(chain(T(0, 1.13, .152), RZ(.62), S(.055, .78, .02)), C.blanco);
  g.box(chain(T(0, 1.13, .156), RZ(-.62), S(.055, .78, .02)), C.blanco);
  g.box(chain(T(0, .86, 0), S(.5, .06, .31)), C.blanco);
  for (let k = 0; k < 4; k++) g.box(chain(T(0, 1.02 + k * .1, .162), S(.03, .03, .01)), C.bronce);
  // cabeza
  g.box(chain(T(0, 1.6, 0), S(.22, .25, .22)), C.piel);
  g.box(chain(T(0, 1.55, .113), S(.12, .025, .01)), C.negro);
  g.box(chain(T(0, 1.635, .112), S(.16, .02, .01)), shade(C.piel, .55));
  // morrión
  g.cyl(chain(T(0, 1.7, 0), S(1, .27, 1)), 10, .135, .155, C.negro);
  g.box(chain(T(0, 1.71, .13), RX(.35), S(.24, .03, .12)), C.negro);
  g.box(chain(T(0, 1.83, .15), S(.09, .09, .02)), C.dorado);
  g.cyl(chain(T(0, 1.97, .08), S(1, .16, 1)), 6, .035, .05, C.rojo);
  g.box(chain(T(0, 1.75, .152), S(.3, .03, .01)), C.rojo);
  // brazos en posición de tiro
  g.box(chain(T(.27, 1.3, .12), RX(-1.25), RY(-.15), S(.13, .5, .13)), C.azul);
  g.box(chain(T(.25, 1.33, .36), S(.14, .06, .14)), C.rojo);
  g.box(chain(T(-.2, 1.27, .26), RY(.55), RX(-1.35), S(.12, .55, .12)), C.azul);
  g.box(chain(T(.2, 1.33, .44), S(.09, .1, .1)), C.piel);
  g.box(chain(T(.02, 1.36, .52), S(.09, .1, .1)), C.piel);
  return upload(g);
})();
// Mosquete con bayoneta; pivote en el hombro (0.12,1.33,0.2); apunta a +Z
const musketPivot = [0.11, 1.34, 0.22];
const musket = (() => {
  const g = new Geo();
  g.box(chain(T(0, -.03, -.12), S(.07, .12, .42)), C.madera);
  g.box(chain(T(0, 0, .3), S(.06, .07, .55)), C.madera);
  g.cyl(chain(T(0, .03, .1), RX(Math.PI / 2), S(1, 1.05, 1)), 6, .017, .016, C.metal);
  g.box(chain(T(.04, .03, .12), S(.03, .05, .06)), C.metal);
  g.box(chain(T(.012, .02, 1.33), S(.012, .02, .32)), C.plata);
  return upload(g);
})();
const MUZZLE_LOCAL = [0, .03, 1.15];

// Caballo en primera persona (BP_Horse_player). Espacio de cámara: -Z hacia adelante.
const horseFP = (() => {
  const g = new Geo(), pelo = C.caballo, claro = shade(C.caballo, 1.25), osc = shade(C.caballo, .7);
  // cuello en tramos que se afinan hacia la cabeza
  const tramos = 6;
  for (let k = 0; k < tramos; k++) {
    const t = k / (tramos - 1);
    const z = lerp(-.25, -1.12, t), y = lerp(-1.12, -.62, t), w = lerp(.46, .25, t), h = lerp(.62, .34, t);
    g.box(chain(T(0, y, z), RX(.5), S(w, h, .26)), k % 2 ? pelo : claro);
  }
  // crin
  for (let k = 0; k < 9; k++) {
    const t = k / 8, z = lerp(-.3, -1.12, t), y = lerp(-.8, -.42, t);
    g.box(chain(T((k % 2 ? .02 : -.02), y, z), RX(.5 + (k % 3) * .08), S(.07, .16, .14)), C.crin);
  }
  // cabeza: frente, testuz y hocico
  g.box(chain(T(0, -.5, -1.3), RX(-.95), S(.27, .3, .42)), claro);
  g.box(chain(T(0, -.72, -1.52), RX(-1.05), S(.22, .26, .34)), pelo);
  g.box(chain(T(0, -.9, -1.66), RX(-1.05), S(.18, .2, .16)), osc);
  g.box(chain(T(0, -.46, -1.38), RX(-.95), S(.07, .2, .012)), hex('#efe6d6'));
  g.box(chain(T(0, -.38, -1.2), RX(-.4), S(.12, .07, .12)), C.crin);
  // orejas
  for (const sx of [-1, 1]) {
    g.cyl(chain(T(sx * .09, -.4, -1.14), RZ(sx * -.3), RX(-.15), S(1, .22, 1)), 5, .055, .008, pelo, true);
    g.cyl(chain(T(sx * .09, -.39, -1.16), RZ(sx * -.3), RX(-.15), S(1, .18, 1)), 5, .03, .004, osc, true);
    // ojos
    g.box(chain(T(sx * .14, -.56, -1.33), S(.03, .05, .06)), C.negro);
    // cabezada y riendas
    g.box(chain(T(sx * .125, -.62, -1.4), RX(-1), S(.015, .3, .03)), C.cuero);
    g.box(chain(T(sx * .2, -.78, -.75), RX(.3), S(.014, .014, 1.25)), C.cuero);
  }
  g.box(chain(T(0, -.43, -1.2), S(.27, .035, .035)), C.cuero);
  // cruz y montura
  g.box(chain(T(0, -1.05, -.02), S(.52, .2, .34)), C.cuero);
  g.box(chain(T(0, -.93, -.1), RX(.4), S(.18, .14, .12)), shade(C.cuero, 1.3));
  return upload(g);
})();
// Rifle del jugador (BP_Gun / rig_rifle). Apunta a -Z.
const rifleFP = (() => {
  const g = new Geo();
  g.box(chain(T(0, -.06, .18), RX(-.12), S(.06, .12, .38)), C.madera);
  g.box(chain(T(0, -.01, -.25), S(.055, .07, .55)), C.madera);
  g.cyl(chain(T(0, .03, -.05), RX(-Math.PI / 2), S(1, .95, 1)), 7, .016, .014, C.metal);
  g.box(chain(T(.035, .03, .02), S(.03, .05, .07)), C.metal);
  g.box(chain(T(0, -.06, .03), S(.012, .05, .05)), C.metal);
  g.box(chain(T(0, .055, -.97), S(.01, .02, .01)), C.bronce);
  g.box(chain(T(0, -.015, -.45), S(.065, .03, .03)), C.bronce);
  return upload(g);
})();
const RIFLE_MUZZLE = [0, .03, -1.0];
const flash = (() => {
  const g = new Geo();
  g.box(S(.12, .02, .3), C.fogon); g.box(S(.02, .12, .3), C.fogon); g.sph(S(.07), 2, 6, [1, .95, .7]);
  return upload(g);
})();
const puff = (() => { const g = new Geo(); g.sph(I4(), 3, 7, [1, 1, 1], .25); return upload(g); })();
// Recogibles (BP_Recogible)
const coin = (() => {
  const g = new Geo();
  g.cyl(chain(RX(Math.PI / 2), T(0, -.04, 0), S(1, .08, 1)), 14, .28, .28, C.plata);
  g.cyl(chain(RX(Math.PI / 2), T(0, -.05, 0), S(1, .1, 1)), 14, .16, .16, shade(C.plata, .8));
  return upload(g);
})();
const canteen = (() => {
  const g = new Geo();
  g.sph(S(.24, .3, .14), 3, 10, hex('#7b5a3a'));
  g.cyl(chain(T(0, .26, 0), S(1, .12, 1)), 6, .05, .05, C.metal);
  g.box(chain(T(0, 0, 0), S(.5, .03, .16)), C.rojo);
  return upload(g);
})();

/* ------------------------------------------------------------------ */
/* Cargador GLB mínimo (malla estática + textura base)                 */
/* ------------------------------------------------------------------ */
async function loadGLB(url, target) {
  let r; try { r = await fetch(url); } catch { return null; }
  if (!r.ok) return null;
  const buf = await r.arrayBuffer(), dv = new DataView(buf);
  if (buf.byteLength < 20 || dv.getUint32(0, true) !== 0x46546C67) return null;
  let off = 12, json = null, binOff = 0;
  while (off < buf.byteLength) {
    const L = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, L)));
    else if (type === 0x004E4942) binOff = off + 8;
    off += 8 + L;
  }
  if (!json) return null;
  const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const RD = { 5126: ['getFloat32', 4, 1], 5125: ['getUint32', 4, 4294967295], 5123: ['getUint16', 2, 65535], 5121: ['getUint8', 1, 255], 5122: ['getInt16', 2, 32767], 5120: ['getInt8', 1, 127] };
  function acc(i, asInt) {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView], n = NC[a.type], [fn, sz, mx] = RD[a.componentType];
    const stride = bv.byteStride || sz * n, base = binOff + (bv.byteOffset || 0) + (a.byteOffset || 0);
    const out = asInt ? new Uint32Array(a.count * n) : new Float32Array(a.count * n);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
      let v = dv[fn](base + k * stride + c * sz, true);
      if (!asInt && a.normalized) v = Math.max(v / mx, -1);
      out[k * n + c] = v;
    }
    return out;
  }
  function nodeMat(nd) {
    if (nd.matrix) return new Float32Array(nd.matrix);
    const [x, y, z, w] = nd.rotation || [0, 0, 0, 1], [sx, sy, sz] = nd.scale || [1, 1, 1], t = nd.translation || [0, 0, 0];
    const m = new Float32Array([
      (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
      (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
      (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
      t[0], t[1], t[2], 1]);
    return m;
  }
  const texCache = {};
  async function texture(ti) {
    if (ti == null) return null;
    if (texCache[ti]) return texCache[ti];
    const img = json.images[json.textures[ti].source];
    let blob;
    if (img.bufferView != null) { const bv = json.bufferViews[img.bufferView]; blob = new Blob([new Uint8Array(buf, binOff + (bv.byteOffset || 0), bv.byteLength)], { type: img.mimeType }); }
    else blob = await (await fetch(new URL(img.uri, new URL(url, location.href)))).blob();
    const bmp = await createImageBitmap(blob);
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return texCache[ti] = t;
  }
  const prims = [];
  const visit = (ni, parent) => {
    const nd = json.nodes[ni], m = mul(parent, nodeMat(nd));
    if (nd.mesh != null) for (const p of json.meshes[nd.mesh].primitives) prims.push({ p, m });
    for (const c of nd.children || []) visit(c, m);
  };
  for (const ni of json.scenes[json.scene || 0].nodes) visit(ni, I4());
  const parts = [], mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const { p, m } of prims) {
    if (p.mode != null && p.mode !== 4) continue;
    const pos = acc(p.attributes.POSITION), nv = pos.length / 3;
    let nor = p.attributes.NORMAL != null ? acc(p.attributes.NORMAL) : null;
    const uv = p.attributes.TEXCOORD_0 != null ? acc(p.attributes.TEXCOORD_0) : new Float32Array(nv * 2);
    const idx = p.indices != null ? acc(p.indices, true) : Uint32Array.from({ length: nv }, (_, i) => i);
    for (let k = 0; k < nv; k++) {
      const q = xf(m, [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]]);
      pos[k * 3] = q[0]; pos[k * 3 + 1] = q[1]; pos[k * 3 + 2] = q[2];
      for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], q[c]); mx[c] = Math.max(mx[c], q[c]); }
    }
    if (!nor) {
      nor = new Float32Array(nv * 3);
      for (let k = 0; k < idx.length; k += 3) {
        const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
        const n = cross(sub([pos[b], pos[b + 1], pos[b + 2]], [pos[a], pos[a + 1], pos[a + 2]]), sub([pos[c], pos[c + 1], pos[c + 2]], [pos[a], pos[a + 1], pos[a + 2]]));
        for (const v of [a, b, c]) { nor[v] += n[0]; nor[v + 1] += n[1]; nor[v + 2] += n[2]; }
      }
    } else for (let k = 0; k < nv; k++) { const q = norm(xfDir(m, [nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]])); nor.set(q, k * 3); }
    for (let k = 0; k < nv; k++) { const q = norm([nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]]); nor.set(q, k * 3); }
    const mat = p.material != null ? json.materials[p.material] : {};
    const pbr = mat.pbrMetallicRoughness || {};
    const col = (pbr.baseColorFactor || [1, 1, 1, 1]).slice(0, 3);
    const tex = await texture(pbr.baseColorTexture ? pbr.baseColorTexture.index : null);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    for (const [data, loc, size] of [[pos, 0, 3], [nor, 1, 3], [uv, 3, 2]]) {
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    parts.push({ vao, count: idx.length, tex, col });
  }
  if (!parts.length) return null;
  // normalización: centrar en XZ, apoyar en y=0, escalar a la medida objetivo
  const ext = sub(mx, mn), ax = target.eje === 'largo' ? Math.max(...ext) : ext[1];
  const k = (target.escala || target.medida / (ax || 1));
  const fix = chain(RY((target.rotY || 0) * Math.PI / 180), RX((target.rotX || 0) * Math.PI / 180), S(k), T(-(mn[0] + mx[0]) / 2, -mn[1], -(mn[2] + mx[2]) / 2));
  const o = target.offset || [0, 0, 0];
  return { glb: true, parts, fix: mul(T(o[0], o[1], o[2]), fix) };
}

/* ------------------------------------------------------------------ */
/* Dibujo                                                              */
/* ------------------------------------------------------------------ */
let fogD = 1 / 380;
function setCommon(proj, view, cam, sun) {
  gl.useProgram(P.p);
  gl.uniformMatrix4fv(P.u.uP, false, proj); gl.uniformMatrix4fv(P.u.uV, false, view);
  gl.uniform3fv(P.u.uSun, sun); gl.uniform3fv(P.u.uCam, cam); gl.uniform3fv(P.u.uFog, C.niebla);
  gl.uniform1f(P.u.uFogD, fogD); gl.uniform1i(P.u.uS, 0);
}
function draw(mesh, M, tint = [1, 1, 1], emit = [0, 0, 0], alpha = 1) {
  gl.uniformMatrix4fv(P.u.uM, false, M); gl.uniform3fv(P.u.uTint, tint); gl.uniform3fv(P.u.uEmit, emit); gl.uniform1f(P.u.uAlpha, alpha);
  if (mesh.glb) {
    const MM = mul(M, mesh.fix);
    gl.uniformMatrix4fv(P.u.uM, false, MM);
    for (const p of mesh.parts) {
      gl.bindVertexArray(p.vao);
      gl.disableVertexAttribArray(2); gl.vertexAttrib3f(2, p.col[0], p.col[1], p.col[2]);
      gl.uniform1i(P.u.uTex, p.tex ? 1 : 0);
      if (p.tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, p.tex); }
      gl.drawElements(gl.TRIANGLES, p.count, gl.UNSIGNED_INT, 0);
    }
    gl.uniform1i(P.u.uTex, 0);
    return;
  }
  gl.uniform1i(P.u.uTex, 0);
  gl.bindVertexArray(mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
}
let propsMesh = upload(props);

/* ------------------------------------------------------------------ */
/* Audio sintetizado                                                   */
/* ------------------------------------------------------------------ */
let AC = null, noiseBuf = null, master = null;
function initAudio() {
  if (AC) { AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = .8; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 1.2, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const wind = AC.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
    const wf = AC.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 380;
    const wg = AC.createGain(); wg.gain.value = .05;
    wind.connect(wf).connect(wg).connect(master); wind.start();
  } catch { AC = null; }
}
function shot(vol = 1, cutoff = 2400, dur = .45) {
  if (!AC) return;
  const t = AC.currentTime, s = AC.createBufferSource(); s.buffer = noiseBuf;
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(220, t + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + .05);
  const o = AC.createOscillator(), og = AC.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + .15);
  og.gain.setValueAtTime(vol * .7, t); og.gain.exponentialRampToValueAtTime(.001, t + .18); o.connect(og).connect(master); o.start(t); o.stop(t + .2);
}
function hoof(v = .25) {
  if (!AC) return;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.frequency.setValueAtTime(95 + Math.random() * 20, t); o.frequency.exponentialRampToValueAtTime(45, t + .08);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + .1); o.connect(g).connect(master); o.start(t); o.stop(t + .12);
}
function chime(f0 = 880) {
  if (!AC) return;
  const t = AC.currentTime;
  for (const [f, d] of [[f0, 0], [f0 * 1.5, .07]]) {
    const o = AC.createOscillator(), g = AC.createGain(); o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(.18, t + d + .01); g.gain.exponentialRampToValueAtTime(.001, t + d + .35);
    o.connect(g).connect(master); o.start(t + d); o.stop(t + d + .4);
  }
}
function click() {
  if (!AC) return; const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = 'square'; o.frequency.value = 1400; g.gain.setValueAtTime(.08, t); g.gain.exponentialRampToValueAtTime(.001, t + .04);
  o.connect(g).connect(master); o.start(t); o.stop(t + .05);
}

/* ------------------------------------------------------------------ */
/* Estado de juego                                                     */
/* ------------------------------------------------------------------ */
const ESC_SOLDADO = 1.15;
const MAX_VIDA = 6, CARGADOR = 6, VELOCIDAD = 8.2;
let G = null;
function nuevaPartida() {
  seed = 4242;
  const enemies = [], items = [];
  const N = 17;
  for (let k = 0; k < N; k++) {
    const sBase = START_S + 70 + k * (PATH_LEN - START_S - 130) / N;
    const grupo = k % 4 === 3 ? 3 : (k % 2 ? 2 : 1);
    for (let q = 0; q < grupo; q++) {
      const s = sBase + q * 9 + rnd() * 10, p = pathAt(s), side = (k + q) % 2 ? 1 : -1, lat = 13 + rnd() * 20;
      const x = p.x + p.side[0] * lat * side, z = p.z + p.side[2] * lat * side;
      enemies.push({ x, z, y: heightAt(x, z), s, estado: 'oculto', t: 0, cd: 1.6 + rnd() * 1.6, apunta: 0, muerte: 0, rise: 0, sway: rnd() * 6 });
      if (!coverListo) COVER.push({ x: x + p.dir[0] * 1.6 * side, z: z + p.dir[2] * 1.6 * side });
    }
  }
  for (let k = 0; k < 12; k++) {
    const s = START_S + 40 + k * (PATH_LEN - START_S - 90) / 12 + rnd() * 15, p = pathAt(s), side = k % 2 ? 1 : -1, lat = 3.5 + rnd() * 4;
    const x = p.x + p.side[0] * lat * side, z = p.z + p.side[2] * lat * side;
    items.push({ x, z, y: heightAt(x, z) + 2.3, tipo: k % 3 === 2 ? 'vida' : 'moneda', tomado: false, anim: 0, s });
  }
  G = {
    s: START_S, vida: MAX_VIDA, puntos: 0, bajas: 0, total: enemies.length, monedas: 0, balas: CARGADOR, recarga: 0,
    yaw: 0, pitch: -0.02, enemies, items, fx: [], recoil: 0, flash: 0, aimYaw: 0, aimPitch: 0, dano: 0, shake: 0,
    galope: 0, lastHoof: 0, fin: false, tiempo: 0, aviso: 0
  };
}
nuevaPartida();
// rocas de cobertura junto a cada enemigo (se agregan a la escenografía)
(() => { for (const c of COVER) addRock(props, c.x, c.z, 1.1 + rnd() * .5); propsMesh = upload(props); coverListo = true; })();

/* ------------------------------------------------------------------ */
/* Modelos externos opcionales                                         */
/* ------------------------------------------------------------------ */
const MODELOS = { caballo: null, soldado: null, rifle: null };
(async () => {
  let aj = {};
  try { const r = await fetch('./modelos/ajustes.json'); if (r.ok) aj = await r.json(); } catch { }
  const def = {
    caballo: { medida: 2.25, rotY: 0, offset: [0, 0, 0], alturaOjos: 2.45, adelante: 0.35 },
    soldado: { medida: 1.85, rotY: 0, offset: [0, 0, 0] },
    rifle: { medida: 1.05, eje: 'largo', rotY: 0, rotX: 0, offset: [0, 0, 0] }
  };
  const cargados = [];
  for (const k of Object.keys(def)) {
    const cfg = Object.assign({}, def[k], aj[k] || {});
    const m = await loadGLB(`./modelos/${k}.glb`, cfg).catch(e => { console.warn(k, e); return null; });
    if (m) { m.cfg = cfg; MODELOS[k] = m; cargados.push(k); }
  }
  if (cargados.length) document.getElementById('notaModelos').textContent = 'Modelos originales cargados: ' + cargados.join(', ');
})();

/* ------------------------------------------------------------------ */
/* Cámara y entrada táctil                                             */
/* ------------------------------------------------------------------ */
let W = 0, H = 0, ASP = 1, FOV = 1.1, cam = null;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  W = Math.floor(innerWidth * dpr); H = Math.floor(innerHeight * dpr);
  canvas.width = W; canvas.height = H; ASP = W / H;
  FOV = ASP < 1 ? 1.25 : (ASP < 1.5 ? 1.1 : 0.98);
}
addEventListener('resize', resize); resize();

const ptr = new Map();
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), mov: 0 });
});
canvas.addEventListener('pointermove', e => {
  const p = ptr.get(e.pointerId); if (!p || !G || estado !== 'juego') return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; p.mov += Math.abs(dx) + Math.abs(dy);
  const k = 2.4 / Math.max(innerWidth, innerHeight);
  G.yaw = clamp(G.yaw - dx * k, -1.9, 1.9); G.pitch = clamp(G.pitch - dy * k, -.55, .6);
});
const endPtr = e => {
  const p = ptr.get(e.pointerId); ptr.delete(e.pointerId);
  if (!p || estado !== 'juego') return;
  if (p.mov < 14 && performance.now() - p.t < 450) disparar(e.clientX, e.clientY);
};
canvas.addEventListener('pointerup', endPtr);
canvas.addEventListener('pointercancel', e => ptr.delete(e.pointerId));
addEventListener('keydown', e => { if (e.code === 'Space' && estado === 'juego') disparar(innerWidth / 2, innerHeight / 2); if (e.code === 'KeyR' && G) recargar(); });

function rayFromScreen(cx, cy) {
  const nx = cx / innerWidth * 2 - 1, ny = 1 - cy / innerHeight * 2, t = Math.tan(FOV / 2);
  const local = norm([nx * t * ASP, ny * t, -1]);
  const world = norm(add(add(scl(cam.s, local[0]), scl(cam.u, local[1])), scl(cam.f, -local[2])));
  return { local, world };
}
function raySphere(o, d, c, r) {
  const oc = sub(o, c), b = dot(oc, d), q = dot(oc, oc) - r * r, h = b * b - q;
  if (h < 0) return -1; const t = -b - Math.sqrt(h); return t > 0 ? t : -1;
}
function rayTerrain(o, d, maxT = 420) {
  for (let t = 2; t < maxT; t += 1.5) { const p = add(o, scl(d, t)); if (p[1] < heightAt(p[0], p[2])) return t; }
  return -1;
}
function recargar() { if (G.recarga > 0 || G.balas === CARGADOR) return; G.recarga = 1.35; click(); }

function disparar(cx, cy) {
  if (G.fin) return;
  initAudio();
  if (G.recarga > 0) { click(); return; }
  if (G.balas <= 0) { recargar(); return; }
  const { local, world } = rayFromScreen(cx, cy);
  G.balas--; G.recoil = 1; G.flash = .07; G.shake = Math.max(G.shake, .25);
  G.aimYaw = Math.atan2(-local[0], -local[2]); G.aimPitch = Math.atan2(local[1], Math.hypot(local[0], local[2]));
  shot(.9, 2600, .5);
  const o = cam.e, asist = 1.55;
  let best = 1e9, hit = null, item = null;
  for (const en of G.enemies) {
    if (en.estado === 'muerto' || en.estado === 'oculto') continue;
    const y0 = en.y + (en.rise - 1) * 1.3;
    for (const [hy, r] of [[1.62, .2], [1.15, .36], [.55, .3]]) {
      const t = raySphere(o, world, [en.x, y0 + hy * ESC_SOLDADO, en.z], r * ESC_SOLDADO * asist);
      if (t > 0 && t < best) { best = t; hit = en; item = null; }
    }
  }
  for (const it of G.items) {
    if (it.tomado) continue;
    const t = raySphere(o, world, [it.x, it.y, it.z], 1.1);
    if (t > 0 && t < best && t < 45) { best = t; item = it; hit = null; }
  }
  const tt = rayTerrain(o, world);
  if (tt > 0 && tt < best) { best = tt; hit = null; item = null; }
  if (hit) {
    hit.estado = 'muerto'; hit.muerte = 0; G.bajas++; G.puntos += 100;
    const cx2 = [hit.x, hit.y + 1.2, hit.z];
    for (let i = 0; i < 6; i++) G.fx.push({ p: cx2.slice(), v: [(Math.random() - .5) * 1.5, Math.random() * 1.6, (Math.random() - .5) * 1.5], age: 0, life: .7, size: .18, col: hex('#8a2a22'), a: .9 });
    setTimeout(() => chime(660), 60);
  } else if (item) {
    tomar(item);
  } else if (best < 1e9 && tt > 0) {
    const p = add(o, scl(world, tt));
    for (let i = 0; i < 5; i++) G.fx.push({ p: p.slice(), v: [(Math.random() - .5) * 1.4, 1 + Math.random() * 1.8, (Math.random() - .5) * 1.4], age: 0, life: 1.1, size: .45, col: hex('#c9a77c'), a: .75 });
  }
  if (G.balas === 0) setTimeout(() => G && recargar(), 250);
}
function tomar(it) {
  it.tomado = true;
  if (it.tipo === 'vida') { G.vida = Math.min(MAX_VIDA, G.vida + 1); aviso('+1 vida'); chime(740); }
  else { G.monedas++; G.puntos += 50; aviso('+50 · real de plata'); chime(988); }
  for (let i = 0; i < 10; i++) G.fx.push({ p: [it.x, it.y, it.z], v: [(Math.random() - .5) * 3, Math.random() * 2.5, (Math.random() - .5) * 3], age: 0, life: .6, size: .1, col: C.dorado, a: 1, glow: true });
}
function aviso(txt) { const a = document.getElementById('aviso'); a.textContent = txt; a.style.opacity = 1; G.aviso = 1.4; }

/* ------------------------------------------------------------------ */
/* Actualización                                                       */
/* ------------------------------------------------------------------ */
function update(dt) {
  G.tiempo += dt;
  if (!G.fin) G.s += VELOCIDAD * dt;
  G.galope += dt * 2.35 * Math.PI * 2;
  if (G.galope - G.lastHoof > Math.PI * .5) { G.lastHoof = G.galope; hoof(.12 + Math.random() * .06); }
  G.recoil = Math.max(0, G.recoil - dt * 6); G.flash = Math.max(0, G.flash - dt);
  G.aimYaw *= Math.pow(.02, dt); G.aimPitch *= Math.pow(.02, dt);
  G.dano = Math.max(0, G.dano - dt * 1.6); G.shake = Math.max(0, G.shake - dt * 2.5);
  if (G.recarga > 0) { G.recarga -= dt; if (G.recarga <= 0) { G.recarga = 0; G.balas = CARGADOR; click(); } }
  if (G.aviso > 0) { G.aviso -= dt; if (G.aviso <= 0) document.getElementById('aviso').style.opacity = 0; }

  const p = pathAt(G.s), eye = [p.x, heightAt(p.x, p.z), p.z];
  let izq = false, der = false;
  for (const en of G.enemies) {
    en.sway += dt;
    const dx = eye[0] - en.x, dz = eye[2] - en.z, dist = Math.hypot(dx, dz);
    en.yaw = Math.atan2(dx, dz);
    const delante = (en.x - eye[0]) * p.dir[0] + (en.z - eye[2]) * p.dir[2];
    if (en.estado === 'oculto' && en.s - G.s < 75) { en.estado = 'activo'; en.t = 0; }
    if (en.estado === 'activo') {
      en.rise = Math.min(1, en.rise + dt * 1.6);
      if (G.fin || delante < -6 || dist > 85) { en.apunta = Math.max(0, en.apunta - dt * 2); continue; }
      en.cd -= dt;
      if (en.cd < .7) en.apunta = Math.min(1, en.apunta + dt * 2.2);
      if (en.cd <= 0) {
        en.cd = 2.6 + Math.random() * 1.8; en.apunta = .2;
        const muzzle = xf(soldierMatrix(en), add(musketPivot, MUZZLE_LOCAL));
        en.flash = .08;
        for (let i = 0; i < 4; i++) G.fx.push({ p: muzzle.slice(), v: [(Math.random() - .5) * .6, .5 + Math.random() * .6, (Math.random() - .5) * .6], age: 0, life: 1.6, size: .35, col: C.humo, a: .7 });
        shot(clamp(1.2 - dist / 80, .15, .7), 1100, .6);
        const prob = .5 * clamp(1.15 - dist / 95, .35, 1);
        if (Math.random() < prob) { G.vida--; G.dano = 1; G.shake = .8; if (navigator.vibrate) navigator.vibrate(120); }
      }
      // indicador si apunta fuera de pantalla
      if (en.apunta > .3) {
        const rel = [en.x - cam.e[0], 0, en.z - cam.e[2]];
        const x = dot(rel, cam.s), z = dot(rel, cam.f);
        const ang = Math.atan2(x, z);
        if (ang < -FOV * ASP * .45) izq = true; else if (ang > FOV * ASP * .45) der = true;
      }
    } else if (en.estado === 'muerto') en.muerte += dt;
    if (en.flash) en.flash = Math.max(0, en.flash - dt);
  }
  document.getElementById('fIzq').style.opacity = izq ? 1 : 0;
  document.getElementById('fDer').style.opacity = der ? 1 : 0;
  for (const it of G.items) {
    if (it.tomado) continue;
    it.anim += dt;
    if (Math.hypot(it.x - eye[0], it.z - eye[2]) < 3.2) tomar(it);
  }
  for (const f of G.fx) { f.age += dt; f.p = add(f.p, scl(f.v, dt)); f.v[1] += (f.glow ? -4 : .25) * dt; }
  G.fx = G.fx.filter(f => f.age < f.life);

  if (!G.fin) {
    if (G.vida <= 0) terminar(false);
    else if (G.s >= PATH_LEN - 8) terminar(true);
  }
}
function soldierMatrix(en) {
  const y = en.y + (en.rise - 1) * 1.4 + (en.estado === 'muerto' ? -smooth(2.5, 4.5, en.muerte) * 1.5 : 0);
  const caer = en.estado === 'muerto' ? -smooth(0, .55, en.muerte) * 1.45 : Math.sin(en.sway * 1.3) * .02;
  return chain(T(en.x, y, en.z), RY(en.yaw), RX(caer), S(ESC_SOLDADO));
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */
function render() {
  const p = pathAt(G.s);
  const hc = MODELOS.caballo ? MODELOS.caballo.cfg : null;
  const bob = Math.sin(G.galope * 2) * .07, sway = Math.sin(G.galope) * .025;
  const eyeH = hc ? hc.alturaOjos : 2.45;
  const sh = G.shake * .05;
  const e = [p.x + p.side[0] * sway + (Math.random() - .5) * sh, heightAt(p.x, p.z) + eyeH + bob + (Math.random() - .5) * sh, p.z + p.side[2] * sway];
  const baseYaw = Math.atan2(p.dir[0], -p.dir[2]);
  const yaw = baseYaw + G.yaw, pitch = G.pitch + Math.sin(G.galope * 2 + .6) * .012;
  const f = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  const roll = Math.sin(G.galope) * .012;
  const up = norm([Math.sin(roll) * Math.cos(yaw), Math.cos(roll), Math.sin(roll) * Math.sin(yaw)]);
  const la = lookAt(e, f, up);
  cam = { e, f, s: la.s, u: la.u, yaw, pitch };
  const proj = persp(FOV, ASP, .08, 2200);

  gl.viewport(0, 0, W, H);
  gl.clearColor(...C.niebla, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  // cielo
  gl.disable(gl.DEPTH_TEST); gl.useProgram(SKY.p); gl.bindVertexArray(skyVAO);
  gl.uniform1f(SKY.u.uPitch, pitch); gl.uniform1f(SKY.u.uTanH, Math.tan(FOV / 2)); gl.uniform1f(SKY.u.uAsp, ASP); gl.uniform1f(SKY.u.uYaw, yaw);
  gl.uniform3fv(SKY.u.uZen, C.cielo); gl.uniform3fv(SKY.u.uHor, C.horizonte); gl.uniform3fv(SKY.u.uSunDir, SUN);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);

  setCommon(proj, la.m, e, SUN);
  fogD = 1 / 1500; gl.uniform1f(P.u.uFogD, fogD); draw(far, I4());
  fogD = 1 / 380; gl.uniform1f(P.u.uFogD, fogD);
  draw(terrain, I4());
  draw(propsMesh, I4());
  // caballo completo si hay modelo original
  if (MODELOS.caballo) {
    const hy = heightAt(p.x, p.z) + bob * .6;
    draw(MODELOS.caballo, chain(T(p.x - p.dir[0] * hc.adelante, hy, p.z - p.dir[2] * hc.adelante), RY(Math.atan2(p.dir[0], p.dir[2])), RX(Math.sin(G.galope * 2) * .02)));
  }
  for (const en of G.enemies) {
    if (en.estado === 'oculto') continue;
    if (en.estado === 'muerto' && en.muerte > 5) continue;
    const M = soldierMatrix(en);
    const tint = en.estado === 'muerto' ? [.75, .7, .7] : [1, 1, 1];
    const emit = en.apunta > .5 && en.estado !== 'muerto' ? [.18 * en.apunta, .05 * en.apunta, 0] : [0, 0, 0];
    if (MODELOS.soldado) draw(MODELOS.soldado, M, tint, emit);
    else draw(soldierBody, M, tint, emit);
    const aim = en.estado === 'muerto' ? .9 : lerp(.65, -.03, en.apunta);
    const MM = chain(M, T(...musketPivot), RX(aim));
    if (!MODELOS.soldado) draw(musket, MM, tint);
    if (en.flash > 0) draw(flash, chain(MM, T(...MUZZLE_LOCAL), RY(Math.PI), S(2.2)), [1, 1, 1], [1.2, .9, .4]);
  }
  for (const it of G.items) {
    if (it.tomado) continue;
    const pulse = .25 + .2 * Math.sin(it.anim * 5);
    const M = chain(T(it.x, it.y + Math.sin(it.anim * 2.4) * .18, it.z), RY(it.anim * 2.2), S(it.tipo === 'vida' ? 1.6 : 1.5));
    draw(it.tipo === 'vida' ? canteen : coin, M, [1, 1, 1], [pulse, pulse * .8, pulse * .35]);
  }
  // partículas
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  for (const fx of G.fx) {
    const k = fx.age / fx.life, s = fx.size * (fx.glow ? 1 - k : 1 + k * 2.5);
    draw(puff, chain(T(...fx.p), S(s)), fx.col, fx.glow ? scl(fx.col, .8) : [.08, .07, .06], fx.a * (1 - k));
  }
  gl.depthMask(true); gl.disable(gl.BLEND);

  // primera persona: caballo y rifle (BP_XRPawn_yo)
  gl.clear(gl.DEPTH_BUFFER_BIT);
  const sunView = norm(xfDir(la.m, SUN));
  setCommon(persp(FOV, ASP, .02, 20), I4(), [0, 0, 0], sunView);
  fogD = 0; gl.uniform1f(P.u.uFogD, 0);
  if (!MODELOS.caballo) {
    const hp = Math.sin(G.galope * 2 + 1.2) * .05;
    // el caballo sigue el camino: compensar la mirada del jugador
    draw(horseFP, chain(RX(-G.pitch), RY(G.yaw), T(0, -bob * .5, 0), RX(hp)));
  }
  const rec = G.recoil, rl = G.recarga > 0 ? Math.sin(clamp(1 - G.recarga / 1.35, 0, 1) * Math.PI) : 0;
  const RM = chain(T(.2 + Math.sin(G.galope) * .006, -.24 + bob * .25 - rl * .25, -.42 + rec * .09),
    RY(G.aimYaw * .9 + .03), RX(G.aimPitch * .9 + rec * .16 - rl * .9), RZ(rl * .5));
  if (MODELOS.rifle) draw(MODELOS.rifle, RM); else draw(rifleFP, RM);
  if (G.flash > 0) draw(flash, chain(RM, T(...RIFLE_MUZZLE), S(1.4)), [1, 1, 1], [1.3, 1, .5]);
}

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */
const elVida = document.getElementById('vida'), elPts = document.getElementById('puntos'), elProg = document.querySelector('#prog i'), elBalas = document.getElementById('balas'), elDano = document.getElementById('dano');
let hudCache = '';
function hud() {
  const key = [G.vida, G.puntos, G.balas, G.recarga > 0].join('|');
  if (key !== hudCache) {
    hudCache = key;
    const v = clamp(G.vida, 0, MAX_VIDA); elVida.innerHTML = '<b>' + '♥'.repeat(v) + '</b><em>' + '♥'.repeat(MAX_VIDA - v) + '</em>';
    elPts.innerHTML = G.puntos + '<small>puntos</small>';
    let b = ''; for (let i = 0; i < CARGADOR; i++) b += `<i class="${i < G.balas ? '' : 'v'}"></i>`;
    elBalas.innerHTML = b + (G.recarga > 0 ? '<span>recargando…</span>' : '');
  }
  elProg.style.width = (clamp((G.s - START_S) / (PATH_LEN - 8 - START_S), 0, 1) * 100).toFixed(1) + '%';
  elDano.style.opacity = G.dano.toFixed(2);
}

/* ------------------------------------------------------------------ */
/* Flujo: inicio, juego, fin (WB_FindePartida / BP_PantallaFin)        */
/* ------------------------------------------------------------------ */
let estado = 'menu';
const $ = id => document.getElementById(id);
function empezar() {
  initAudio();
  nuevaPartida(); hudCache = '';
  estado = 'juego';
  $('inicio').hidden = true; $('fin').hidden = true; $('hud').hidden = false;
  try { if (matchMedia('(pointer:coarse)').matches && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => { })).catch(() => { }); } catch { }
  if (innerHeight > innerWidth && matchMedia('(pointer:coarse)').matches) { $('girar').style.display = 'flex'; setTimeout(() => $('girar').style.display = 'none', 2200); }
  aviso('¡A galopar!');
}
function terminar(gano) {
  G.fin = true;
  setTimeout(() => {
    estado = 'fin';
    $('hud').hidden = true;
    const fin = $('fin'); fin.className = 'capa ' + (gano ? 'victoria' : 'derrota'); fin.hidden = false;
    $('finTitulo').textContent = gano ? 'Victoria' : 'Derrota';
    $('finTexto').textContent = gano ? 'Cruzaste la quebrada y el paso quedó libre.' : 'Las tropas realistas te cerraron el paso. ¡Volvé a intentarlo!';
    const bonus = gano ? G.vida * 75 : 0; G.puntos += bonus;
    $('finDatos').innerHTML = `Soldados derribados: <b>${G.bajas}/${G.total}</b><br>Reales de plata: <b>${G.monedas}</b><br>` + (gano ? `Bonus por vida: <b>${bonus}</b><br>` : '') + `Puntaje: <b>${G.puntos}</b>`;
  }, gano ? 400 : 900);
}
$('jugar').addEventListener('click', empezar);
$('otraVez').addEventListener('click', empezar);

let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  try {
  if (estado === 'juego') { update(dt); }
  else { G.galope += dt * 1.2; if (estado === 'menu') G.yaw = Math.sin(now / 4000) * .5; }
  if (!cam) { G.s = START_S; }
  if (estado !== 'juego') { cam = cam || { e: [0, 0, 0], f: [0, 0, -1], s: [1, 0, 0], u: [0, 1, 0] }; }
  render();
  if (estado === 'juego') hud();
  } catch (err) { console.error(err); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__juego = { get G() { return G; }, get cam() { return cam; }, get FOV() { return FOV; }, get ASP() { return ASP; }, empezar, disparar };
