// Escena 3D de la Quebrada que acompaña el scroll. WebGL2, sin dependencias.
const canvas = document.getElementById('escena');
const gl = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
if (!gl) { canvas.remove(); document.body.classList.add('sin-3d'); throw new Error('Sin WebGL2: se usa la ilustración de fondo'); }

/* ---------- matemática ---------- */
const I4 = () => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };
function mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
const chain = (...m) => m.reduce((a, b) => mul(a, b));
const T = (x, y, z) => { const m = I4(); m[12] = x; m[13] = y; m[14] = z; return m; };
const S = (x, y = x, z = x) => { const m = I4(); m[0] = x; m[5] = y; m[10] = z; return m; };
const RX = a => { const m = I4(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; };
const RY = a => { const m = I4(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; };
const RZ = a => { const m = I4(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; };
const persp = (f, a, n, fa) => { const t = 1 / Math.tan(f / 2), m = new Float32Array(16); m[0] = t / a; m[5] = t; m[10] = (fa + n) / (n - fa); m[11] = -1; m[14] = 2 * fa * n / (n - fa); return m; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const xf = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hex = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
function lookAt(e, f, up) {
  const s = norm(cross(f, up)), u = cross(s, f), m = I4();
  m[0] = s[0]; m[4] = s[1]; m[8] = s[2]; m[1] = u[0]; m[5] = u[1]; m[9] = u[2]; m[2] = -f[0]; m[6] = -f[1]; m[10] = -f[2];
  m[12] = -dot(s, e); m[13] = -dot(u, e); m[14] = dot(f, e); return m;
}
function hash2(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), u0 = x - xi, v0 = y - yi, u = u0 * u0 * (3 - 2 * u0), v = v0 * v0 * (3 - 2 * v0); return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v); }
function fbm(x, y, o = 4) { let s = 0, a = .5, t = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x, y); t += a; x *= 2.03; y *= 2.03; a *= .5; } return s / t; }
function ridged(x, y, o = 4) { let s = 0, a = .5, t = 0; for (let i = 0; i < o; i++) { s += a * (1 - Math.abs(vnoise(x, y) * 2 - 1)); t += a; x *= 2.1; y *= 2.1; a *= .5; } return s / t; }
let seed = 11; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

/* ---------- shaders ---------- */
const VS = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec3 aC;
uniform mat4 uP,uV,uM; out vec3 vN,vC,vW;
void main(){ vec4 w=uM*vec4(aP,1.); vW=w.xyz; vN=mat3(uM)*aN; vC=aC; gl_Position=uP*uV*w; }`;
const FS = `#version 300 es
precision highp float; in vec3 vN,vC,vW;
uniform vec3 uSun,uCam,uFog; uniform float uFogD,uLuz; out vec4 o;
void main(){
  vec3 n=normalize(vN); if(!gl_FrontFacing) n=-n;
  float d=max(dot(n,uSun),0.);
  // sombreado en escalones: aspecto de ilustración pintada
  float paso = d<.12 ? .0 : (d<.45 ? .55 : 1.);
  float luz = mix(.62, 1.06, mix(d, paso, .55));
  vec3 col = vC * luz * mix(vec3(.80,.78,.92), vec3(1.), luz) * uLuz;
  float f = 1.-exp(-pow(length(vW-uCam)*uFogD,1.5));
  o = vec4(mix(col,uFog,clamp(f,0.,1.)),1.);
}`;
const SKY_VS = `#version 300 es
out vec2 q; void main(){ vec2 p=vec2((gl_VertexID<<1)&2, gl_VertexID&2); q=p*2.-1.; gl_Position=vec4(q,.9999,1.); }`;
const SKY_FS = `#version 300 es
precision highp float; in vec2 q; uniform float uPitch,uTanH; uniform vec3 uTop,uHor; out vec4 o;
void main(){ float e=atan(q.y*uTanH)+uPitch; vec3 c=mix(uHor,uTop,smoothstep(-.02,.75,e)); o=vec4(c,1.); }`;
function prog(vs, fs) {
  const p = gl.createProgram();
  for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); gl.attachShader(p, sh); }
  gl.linkProgram(p); const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}
const P = prog(VS, FS), SKY = prog(SKY_VS, SKY_FS), skyVAO = gl.createVertexArray();

/* ---------- geometría ---------- */
class Geo {
  constructor() { this.p = []; this.n = []; this.c = []; }
  tri(a, b, c, col, cb, cc) { const n = norm(cross(sub(b, a), sub(c, a))); const cs = [col, cb || col, cc || col]; [a, b, c].forEach((q, i) => { this.p.push(...q); this.n.push(...n); this.c.push(...cs[i]); }); }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  box(m, col) { const v = []; for (let i = 0; i < 8; i++) v.push(xf(m, [(i & 1) - .5, ((i >> 1) & 1) - .5, ((i >> 2) & 1) - .5])); for (const f of [[1, 3, 7, 5], [0, 4, 6, 2], [2, 6, 7, 3], [0, 1, 5, 4], [4, 5, 7, 6], [0, 2, 3, 1]]) this.quad(v[f[0]], v[f[1]], v[f[2]], v[f[3]], col); }
  cyl(m, seg, rb, rt, col) { for (let i = 0; i < seg; i++) { const a0 = i / seg * 6.2832, a1 = (i + 1) / seg * 6.2832; const B0 = xf(m, [Math.cos(a0) * rb, 0, Math.sin(a0) * rb]), B1 = xf(m, [Math.cos(a1) * rb, 0, Math.sin(a1) * rb]), T0 = xf(m, [Math.cos(a0) * rt, 1, Math.sin(a0) * rt]), T1 = xf(m, [Math.cos(a1) * rt, 1, Math.sin(a1) * rt]); this.quad(B0, T0, T1, B1, col); if (rt > 0) this.tri(xf(m, [0, 1, 0]), T1, T0, col); if (rb > 0) this.tri(xf(m, [0, 0, 0]), B0, B1, col); } }
  sph(m, lat, lon, colF) { const pt = (i, j) => { const th = i / lat * Math.PI, ph = j / lon * 6.2832; return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]; }; for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) { const l = [pt(i, j), pt(i, j + 1), pt(i + 1, j + 1), pt(i + 1, j)]; const w = l.map(q => xf(m, q)); const col = typeof colF === 'function' ? colF((l[0][1] + l[2][1]) / 2) : colF; if (i === 0) this.tri(w[0], w[2], w[3], col); else if (i === lat - 1) this.tri(w[0], w[1], w[2], col); else this.quad(w[0], w[1], w[2], w[3], col); } }
}
function upload(g) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  [[g.p, 0], [g.n, 1], [g.c, 2]].forEach(([d, l]) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d), gl.STATIC_DRAW); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0); });
  gl.bindVertexArray(null); return { vao, count: g.p.length / 3 };
}

/* ---------- paleta de la ilustración ---------- */
const C = {
  cieloAlto: hex('#5d9bcb'), cieloBajo: hex('#b8d2db'), niebla: hex('#c9d6d2'),
  arena: hex('#ecd29b'), arena2: hex('#e2c083'), pasto: hex('#a5a565'), pasto2: hex('#8f9a58'),
  bandas: ['#f0d39a', '#e8b55c', '#e29a46', '#d9773a', '#c9542f', '#e7a462', '#f2c877', '#d88a52', '#efc58c'].map(hex),
  rojoLejos: hex('#b75a43'), violeta: hex('#7c6d97'), azulLejos: hex('#56699b'),
  nube: hex('#f6e8c6'), nubeSombra: hex('#a9a3c0'),
  agave: hex('#7f9c8c'), agave2: hex('#5f7d4f'), mata: hex('#8a9a4e'),
  caballo: hex('#7a4528'), caballo2: hex('#5b311c'), crin: hex('#2a1810'),
  poncho: hex('#c0392b'), poncho2: hex('#8e2219'), camisa: hex('#3f6aa8'), chaleco: hex('#2b2b38'),
  sombrero: hex('#ead9b6'), sombreroN: hex('#232020'), piel: hex('#c58f68'), bombacha: hex('#e8dcc4'), bota: hex('#2a1b12'),
  azulR: hex('#2c3c78'), rojoR: hex('#b0242a'), blanco: hex('#ece6d6'), negro: hex('#151210'), dorado: hex('#d9b24a'), madera: hex('#6a3b1f'), metal: hex('#44444a')
};
const SUN = norm([-0.6, 0.62, -0.25]);

/* ---------- camino ---------- */
const CTRL = [[0, 80], [0, 0], [16, -90], [-12, -190], [14, -290], [-18, -390], [8, -490], [26, -590], [0, -690], [-18, -790], [0, -880], [0, -960]];
const PATH = [];
(() => {
  const cr = (p0, p1, p2, p3, t) => [0, 1].map(k => .5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t));
  for (let i = 0; i < CTRL.length - 1; i++) for (let k = 0; k < 40; k++) PATH.push(cr(CTRL[Math.max(0, i - 1)], CTRL[i], CTRL[i + 1], CTRL[Math.min(CTRL.length - 1, i + 2)], k / 40));
  PATH.push(CTRL[CTRL.length - 1]);
  let acc = 0; PATH[0].s = 0; for (let i = 1; i < PATH.length; i++) { acc += Math.hypot(PATH[i][0] - PATH[i - 1][0], PATH[i][1] - PATH[i - 1][1]); PATH[i].s = acc; }
})();
function pathAt(s) {
  s = clamp(s, 0, PATH[PATH.length - 1].s); let lo = 0, hi = PATH.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (PATH[m].s < s) lo = m; else hi = m; }
  const a = PATH[lo], b = PATH[hi], t = (s - a.s) / Math.max(1e-6, b.s - a.s), d = norm([b[0] - a[0], 0, b[1] - a[1]]);
  return { x: lerp(a[0], b[0], t), z: lerp(a[1], b[1], t), dir: d, side: [-d[2], 0, d[0]] };
}
function distPath(x, z) { let b = 1e9; for (let i = 0; i < PATH.length; i += 2) { const dx = PATH[i][0] - x, dz = PATH[i][1] - z; b = Math.min(b, dx * dx + dz * dz); } return Math.sqrt(b); }

/* ---------- terreno ---------- */
const X0 = -380, X1 = 380, Z0 = -1060, Z1 = 160, ST = 7, NX = (X1 - X0) / ST | 0, NZ = (Z1 - Z0) / ST | 0, W = NX + 1;
const HG = new Float32Array(W * (NZ + 1)), DG = new Float32Array(W * (NZ + 1));
function rawH(x, z, d) {
  const m = smooth(10, 120, d);
  const lomas = (20 + 70 * fbm(x * .006 + 3, z * .006 - 7, 4)) * m;
  const cresta = 34 * Math.pow(ridged(x * .012, z * .006, 4), 2.2) * m;
  const lejos = smooth(150, 360, d) * 80 * fbm(x * .004 + 9, z * .004, 3);
  return 1.6 * fbm(x * .03, z * .03, 2) - .8 + lomas + cresta + lejos;
}
for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) { const x = X0 + i * ST, z = Z0 + j * ST, d = distPath(x, z); DG[j * W + i] = d; HG[j * W + i] = rawH(x, z, d); }
function grid(A, x, z) { const fx = clamp((x - X0) / ST, 0, NX - 1e-3), fz = clamp((z - Z0) / ST, 0, NZ - 1e-3), i = fx | 0, j = fz | 0, u = fx - i, v = fz - j; return lerp(lerp(A[j * W + i], A[j * W + i + 1], u), lerp(A[(j + 1) * W + i], A[(j + 1) * W + i + 1], u), v); }
const hAt = (x, z) => grid(HG, x, z), dAt = (x, z) => grid(DG, x, z);
function colorSuelo(x, y, z, d) {
  const k = .95 + hash2(Math.floor(x * 2.3), Math.floor(z * 1.9)) * .1;
  if (d < 3.6) return shade(mix3(C.arena, C.arena2, vnoise(x * .2, z * .2)), k);
  if (y < 3 + 3 * vnoise(x * .04, z * .04)) { const t = vnoise(x * .06, z * .06); return shade(t > .72 ? C.pasto : (t > .64 ? C.pasto2 : (t > .4 ? C.arena2 : C.arena)), k); }
  const t = (y + 16 * fbm(x * .004, z * .004, 2) + 6 * Math.sin(x * .02)) / 9;
  const i = ((Math.floor(t) % C.bandas.length) + C.bandas.length) % C.bandas.length;
  return shade(mix3(C.bandas[i], C.bandas[(i + 1) % C.bandas.length], smooth(.75, 1, t - Math.floor(t)) * .6), k);
}
const terreno = (() => {
  const g = new Geo(), V = (i, j) => [X0 + i * ST, HG[j * W + i], Z0 + j * ST];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const a = V(i, j), b = V(i + 1, j), c = V(i + 1, j + 1), d = V(i, j + 1), f = (i + j) & 1;
    for (const t of f ? [[a, d, b], [b, d, c]] : [[a, d, c], [a, c, b]]) { const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3, cz = (t[0][2] + t[1][2] + t[2][2]) / 3; g.tri(t[0], t[1], t[2], colorSuelo(cx, cy, cz, dAt(cx, cz))); }
  }
  return upload(g);
})();

/* ---------- cordones lejanos en capas (rojo, violeta, azul) ---------- */
const cordones = (() => {
  const g = new Geo();
  const capas = [[720, 90, 150, C.rojoLejos], [980, 150, 230, C.violeta], [1300, 220, 340, C.azulLejos]];
  const cz = -420;
  capas.forEach(([R, h0, h1, col], ci) => {
    const n = 90, picos = [];
    for (let k = 0; k <= n; k++) { const a = k / n * 6.2832; const r = R * (1 + .08 * Math.sin(a * 3 + ci)); const h = lerp(h0, h1, Math.pow(ridged(k * .23 + ci * 7, ci * 3.1, 3), 1.6)); picos.push([Math.sin(a) * r, h, cz + Math.cos(a) * r * 1.15]); }
    for (let k = 0; k < n; k++) {
      const p0 = picos[k], p1 = picos[k + 1];
      const b0 = [p0[0] * .97, -30, cz + (p0[2] - cz) * .97], b1 = [p1[0] * .97, -30, cz + (p1[2] - cz) * .97];
      const m0 = [lerp(b0[0], p0[0], .5) + (rnd() - .5) * 30, p0[1] * .45, lerp(b0[2], p0[2], .5)], m1 = [lerp(b1[0], p1[0], .5), p1[1] * .45, lerp(b1[2], p1[2], .5)];
      const cA = shade(col, .92 + rnd() * .16), cB = shade(col, .82 + rnd() * .12);
      g.tri(p0, m0, p1, cA); g.tri(p1, m0, m1, cB); g.quad(m0, b0, b1, m1, shade(col, .9));
    }
  });
  return upload(g);
})();

/* ---------- nubes planas color crema ---------- */
const nubes = (() => {
  const g = new Geo();
  for (let k = 0; k < 34; k++) {
    const a = rnd() * 6.2832, r = 420 + rnd() * 700, x = Math.sin(a) * r, z = -420 + Math.cos(a) * r, y = 230 + rnd() * 220;
    const w = 50 + rnd() * 90, puffs = 3 + (rnd() * 4 | 0);
    for (let q = 0; q < puffs; q++) {
      const px = x + (q - puffs / 2) * w * .35 + (rnd() - .5) * 15, pz = z + (rnd() - .5) * 25, s = w * (.28 + rnd() * .22);
      g.sph(chain(T(px, y + s * .15, pz), S(s, s * .5, s * .7)), 4, 9, t => mix3(C.nubeSombra, C.nube, smooth(-.75, -.1, t)));
    }
  }
  return upload(g);
})();

/* ---------- vegetación: agaves y matas ---------- */
const plantas = (() => {
  const g = new Geo();
  const agave = (x, z, s) => {
    const y = hAt(x, z) - .1, n = 9 + (rnd() * 5 | 0);
    for (let k = 0; k < n; k++) { const a = k / n * 6.2832 + rnd() * .3, inc = .35 + rnd() * .5; g.cyl(chain(T(x, y, z), RY(a), RZ(inc), S(s, s * (1.2 + rnd() * .6), s)), 3, .16, 0, k % 2 ? C.agave : shade(C.agave, .85)); }
  };
  const mata = (x, z, s) => { const y = hAt(x, z); for (let k = 0; k < 3; k++) g.sph(chain(T(x + (rnd() - .5) * s, y + s * .25, z + (rnd() - .5) * s), S(s * (.5 + rnd() * .3), s * .4, s * (.5 + rnd() * .3))), 2, 6, rnd() > .5 ? C.mata : C.agave2); };
  let n = 0, t = 0;
  while (n < 260 && t < 6000) { t++; const x = X0 + 10 + rnd() * (X1 - X0 - 20), z = Z0 + 10 + rnd() * (Z1 - Z0 - 20), d = dAt(x, z); if (d < 5 || d > 120 || hAt(x, z) > 40) continue; (rnd() > .45 ? agave : mata)(x, z, .7 + rnd() * 1.1); n++; }
  return upload(g);
})();

/* ---------- caballos y gauchos ---------- */
function caballoCuerpo(g, pelo) {
  g.box(chain(T(0, 1.32, 0), S(.56, .62, 1.55)), pelo);
  g.box(chain(T(0, 1.75, .78), RX(-.75), S(.32, .75, .38)), pelo);
  g.box(chain(T(0, 2.03, 1.12), RX(-1.9), S(.24, .55, .3)), pelo);
  g.box(chain(T(0, 2.02, .7), RX(-.75), S(.08, .7, .16)), C.crin);
  g.box(chain(T(0, 1.32, -.86), RX(.5), S(.12, .7, .14)), C.crin);
  g.box(chain(T(0, 1.64, -.05), S(.62, .1, .62)), C.poncho2);
}
function pata() { const g = new Geo(); g.box(chain(T(0, -.45, 0), S(.15, .9, .17)), C.caballo2); g.box(chain(T(0, -.95, .02), S(.17, .12, .2)), C.crin); return upload(g); }
function jinete(tipo) {
  const g = new Geo(), rojo = tipo === 'rojo';
  for (const sx of [-1, 1]) { g.box(chain(T(sx * .3, 1.55, .12), RX(-.4), S(.16, .55, .17)), C.bombacha); g.box(chain(T(sx * .32, 1.18, .25), S(.15, .3, .2)), C.bota); }
  g.box(chain(T(0, 2.05, 0), S(.42, .62, .26)), rojo ? C.poncho : C.camisa);
  if (rojo) { g.cyl(chain(T(0, 1.8, 0), S(1, .55, 1)), 7, .42, .2, C.poncho); }
  else { g.box(chain(T(0, 2.05, -.02), S(.44, .5, .24)), C.chaleco); g.box(chain(T(0, 1.83, 0), S(.46, .12, .28)), C.poncho); }
  for (const sx of [-1, 1]) g.box(chain(T(sx * .27, 2.0, .16), RX(-.9), S(.11, .45, .11)), rojo ? C.poncho2 : C.camisa);
  g.box(chain(T(0, 2.48, 0), S(.2, .23, .2)), C.piel);
  g.cyl(chain(T(0, 2.58, 0), S(1, .03, 1)), 12, .36, .36, rojo ? C.sombrero : C.sombreroN);
  g.cyl(chain(T(0, 2.6, 0), S(1, .16, 1)), 10, .17, .14, rojo ? C.sombrero : C.sombreroN);
  if (rojo) g.box(chain(T(0, 2.3, -.1), S(.24, .06, .02)), hex('#f1e4c8'));
  return upload(g);
}
const cuerpo1 = (() => { const g = new Geo(); caballoCuerpo(g, C.caballo); return upload(g); })();
const cuerpo2 = (() => { const g = new Geo(); caballoCuerpo(g, shade(C.caballo, .86)); return upload(g); })();
const PATA = pata(), JINETE_ROJO = jinete('rojo'), JINETE_AZUL = jinete('azul');

/* ---------- soldados realistas ---------- */
function soldado(gorro) {
  const g = new Geo();
  for (const sx of [-1, 1]) { g.box(chain(T(sx * .12, .13, .03), S(.15, .26, .28)), C.negro); g.box(chain(T(sx * .12, .58, 0), S(.17, .64, .19)), C.blanco); }
  g.box(chain(T(0, 1.13, 0), S(.48, .62, .29)), C.azulR);
  g.box(chain(T(0, 1.18, .148), S(.22, .44, .02)), C.rojoR); g.box(chain(T(0, 1.44, 0), S(.3, .09, .3)), C.rojoR);
  g.box(chain(T(0, 1.13, .152), RZ(.62), S(.055, .78, .02)), C.blanco); g.box(chain(T(0, 1.13, .156), RZ(-.62), S(.055, .78, .02)), C.blanco);
  g.box(chain(T(0, 1.6, 0), S(.22, .25, .22)), C.piel);
  if (gorro === 'oso') { g.cyl(chain(T(0, 1.7, 0), S(1, .45, 1)), 9, .16, .2, C.negro); g.cyl(chain(T(.12, 2.05, 0), S(1, .2, 1)), 5, .04, .05, C.rojoR); }
  else { g.cyl(chain(T(0, 1.7, 0), S(1, .3, 1)), 9, .135, .16, gorro === 'blanco' ? C.blanco : C.negro); g.box(chain(T(0, 1.84, .15), S(.09, .09, .02)), C.dorado); g.cyl(chain(T(0, 2.0, .06), S(1, .2, 1)), 5, .03, .05, C.rojoR); }
  for (const sx of [-1, 1]) g.box(chain(T(sx * .3, 1.12, .02), RZ(sx * .12), S(.12, .55, .13)), C.azulR);
  g.box(chain(T(.33, .95, .1), RX(-.15), S(.06, 1.5, .07)), C.madera);
  g.cyl(chain(T(.33, 1.5, .06), S(1, .5, 1)), 4, .015, .012, C.metal);
  return upload(g);
}
const SOLDADOS_MESH = [soldado('negro'), soldado('oso'), soldado('blanco')];
const sEnem = 455, pe = pathAt(sEnem);
const GRUPO = [];
for (let k = 0; k < 7; k++) {
  const lat = 34 + (k % 3) * 3 + rnd() * 3, adv = (k - 3) * 2.6;
  const x = pe.x + pe.side[0] * lat + pe.dir[0] * adv, z = pe.z + pe.side[2] * lat + pe.dir[2] * adv;
  GRUPO.push({ x, z, y: hAt(x, z), m: SOLDADOS_MESH[k % 3], fase: rnd() * 6 });
}
const centroEnem = [GRUPO.reduce((a, s) => a + s.x, 0) / GRUPO.length, GRUPO.reduce((a, s) => a + s.y, 0) / GRUPO.length + 1.2, GRUPO.reduce((a, s) => a + s.z, 0) / GRUPO.length];
// bandera realista
const bandera = (() => { const g = new Geo(); g.cyl(S(1, 4.2, 1), 5, .05, .05, C.madera); g.box(chain(T(.75, 3.6, 0), S(1.4, .9, .03)), C.blanco); g.box(chain(T(.75, 3.6, 0), RZ(.55), S(1.55, .14, .04)), C.rojoR); g.box(chain(T(.75, 3.6, 0), RZ(-.55), S(1.55, .14, .04)), C.rojoR); return upload(g); })();

/* ---------- cámara por sección ---------- */
// s: distancia en el camino · h: altura · lat: corrimiento lateral · yaw/pitch: mirada · lead: distancia de los jinetes
const K = {
  portada: { s: 30, h: 7.5, lat: 0, yaw: 0, pitch: -.05, lead: 22, fov: 1.0 },
  premisa: { s: 130, h: 5.5, lat: -2, yaw: .38, pitch: .02, lead: 18, fov: 1.0 },
  jugabilidad: { s: 245, h: 2.4, lat: -5, yaw: .62, pitch: -.02, lead: 9, fov: .95 },
  enemigos: { s: 405, h: 4, lat: -3, target: centroEnem, lead: 30, fov: .85 },
  entorno: { s: 540, h: 34, lat: 0, yaw: .1, pitch: -.12, lead: 26, fov: 1.15, orbita: .35 },
  referencias: { s: 650, h: 11, lat: 4, yaw: -.35, pitch: -.04, lead: 16, fov: 1.0 },
  jugar: { s: 760, h: 2.8, lat: 0, yaw: 0, pitch: -.02, lead: 9, fov: 1.05 },
  gracias: { s: 820, h: 9, lat: 0, yaw: 0, pitch: -.04, lead: 24, fov: 1.0 }
};
const secciones = [...document.querySelectorAll('.lamina')];
const keys = secciones.map(s => K[s.id] || K.portada);
// convertir objetivos en yaw/pitch fijos
keys.forEach(k => {
  if (!k.target) return;
  const p = pathAt(k.s), ex = p.x + p.side[0] * k.lat, ez = p.z + p.side[2] * k.lat, e = [ex, Math.max(hAt(ex, ez), hAt(p.x, p.z)) + k.h, ez], d = norm(sub(k.target, e));
  const base = Math.atan2(p.dir[0], -p.dir[2]);
  k.yaw = Math.atan2(d[0], -d[2]) - base; k.pitch = Math.asin(d[1]);
});
let progreso = 0, progresoSuave = 0;
function calcProgreso() {
  const c = scrollY + innerHeight * .5, cs = secciones.map(s => s.offsetTop + s.offsetHeight * .5);
  if (c <= cs[0]) return 0;
  for (let i = 0; i < cs.length - 1; i++) if (c < cs[i + 1]) return i + (c - cs[i]) / (cs[i + 1] - cs[i]);
  return cs.length - 1;
}
addEventListener('scroll', () => { progreso = calcProgreso(); }, { passive: true });
let toque = [0, 0];
addEventListener('pointermove', e => { toque = [e.clientX / innerWidth - .5, e.clientY / innerHeight - .5]; }, { passive: true });
addEventListener('deviceorientation', e => { if (e.gamma != null) toque = [clamp(e.gamma / 60, -.5, .5), clamp((e.beta - 45) / 90, -.5, .5)]; }, { passive: true });
let suaveToque = [0, 0];

/* ---------- render ---------- */
let Wc = 0, Hc = 0, ASP = 1;
function resize() { const dpr = Math.min(devicePixelRatio || 1, 1.5); Wc = Math.floor(innerWidth * dpr); Hc = Math.floor(innerHeight * dpr); canvas.width = Wc; canvas.height = Hc; ASP = Wc / Hc; progreso = calcProgreso(); }
addEventListener('resize', resize); resize(); progresoSuave = progreso;

function draw(mesh, M, fogD, luz = 1) { gl.uniformMatrix4fv(P.u.uM, false, M); gl.uniform1f(P.u.uFogD, fogD); gl.uniform1f(P.u.uLuz, luz); gl.bindVertexArray(mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, mesh.count); }
const angLerp = (a, b, t) => a + (b - a) * t;

function frame(now) {
  const t = now / 1000;
  progresoSuave += (progreso - progresoSuave) * .06;
  suaveToque[0] += (toque[0] - suaveToque[0]) * .05; suaveToque[1] += (toque[1] - suaveToque[1]) * .05;
  const i = clamp(Math.floor(progresoSuave), 0, keys.length - 1), f = progresoSuave - i, a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
  const e_ = f * f * (3 - 2 * f);
  const k = {}; for (const n of ['s', 'h', 'lat', 'yaw', 'pitch', 'lead', 'fov']) k[n] = lerp(a[n] ?? 0, b[n] ?? 0, e_);
  const orb = lerp(a.orbita || 0, b.orbita || 0, e_) * Math.sin(t * .12);
  const deriva = t * .35; // la escena siempre avanza un poco: sensación de cabalgata
  const sCam = k.s + deriva % 6;
  const p = pathAt(sCam);
  const ex = p.x + p.side[0] * k.lat, ez = p.z + p.side[2] * k.lat;
  let suelo = hAt(ex, ez); for (const [ox, oz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) suelo = Math.max(suelo, hAt(ex + ox, ez + oz));
  const eye = [ex, Math.max(suelo, hAt(p.x, p.z)) + k.h + Math.sin(t * 1.1) * .05, ez];
  const yaw = Math.atan2(p.dir[0], -p.dir[2]) + k.yaw + orb - suaveToque[0] * .18, pitch = k.pitch - suaveToque[1] * .08;
  const fwd = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  const V = lookAt(eye, fwd, [0, 1, 0]), PR = persp(ASP < 1 ? k.fov * 1.25 : k.fov, ASP, .3, 4200);

  gl.viewport(0, 0, Wc, Hc); gl.clearColor(...C.cieloBajo, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST); gl.useProgram(SKY.p); gl.bindVertexArray(skyVAO);
  gl.uniform1f(SKY.u.uPitch, pitch); gl.uniform1f(SKY.u.uTanH, Math.tan((ASP < 1 ? k.fov * 1.25 : k.fov) / 2)); gl.uniform3fv(SKY.u.uTop, C.cieloAlto); gl.uniform3fv(SKY.u.uHor, C.cieloBajo);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST);
  gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uP, false, PR); gl.uniformMatrix4fv(P.u.uV, false, V);
  gl.uniform3fv(P.u.uSun, SUN); gl.uniform3fv(P.u.uCam, eye); gl.uniform3fv(P.u.uFog, C.niebla);
  const I = I4();
  draw(nubes, chain(T(Math.sin(t * .01) * 30, 0, 0)), 1 / 6500, 1.22);
  draw(cordones, I, 1 / 3600);
  draw(terreno, I, 1 / 900);
  draw(plantas, I, 1 / 900);
  // tropas realistas
  for (const s of GRUPO) { const yaw2 = Math.atan2(pe.x - s.x, pe.z - s.z); draw(s.m, chain(T(s.x, s.y, s.z), RY(yaw2), RZ(Math.sin(t * 1.3 + s.fase) * .015), S(1.15)), 1 / 900); }
  draw(bandera, chain(T(GRUPO[3].x + 1.2, GRUPO[3].y, GRUPO[3].z), RY(Math.sin(t) * .1)), 1 / 900);
  // los dos gauchos a caballo
  const sJ = sCam + k.lead;
  for (const [lado, cuerpo, jin, fase] of [[-1.1, cuerpo1, JINETE_ROJO, 0], [1.1, cuerpo2, JINETE_AZUL, 1.7]]) {
    const q = pathAt(sJ + (lado > 0 ? .8 : 0)), x = q.x + q.side[0] * lado, z = q.z + q.side[2] * lado;
    const ph = t * 4.2 + fase, bob = Math.abs(Math.sin(ph)) * .06;
    const base = chain(T(x, hAt(x, z) + bob, z), RY(Math.atan2(q.dir[0], q.dir[2])), RX(Math.sin(ph * 2) * .015));
    draw(cuerpo, base, 1 / 900);
    for (const [px, pz, o] of [[-.2, .6, 0], [.2, .6, Math.PI], [-.2, -.6, Math.PI], [.2, -.6, 0]]) draw(PATA, chain(base, T(px, 1.05, pz), RX(Math.sin(ph + o) * .45)), 1 / 900);
    draw(jin, chain(base, T(0, -.15, -.05), RZ(Math.sin(ph) * .03)), 1 / 900);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
