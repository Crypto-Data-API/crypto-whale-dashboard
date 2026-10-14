import type * as ThreeNs from "three";
import { coinLogoUrl } from "@/components/deck/coin-logo";
import { fmtUsd } from "@/lib/format";
import { DECK } from "@/lib/palette";
import type { RadarCoin } from "./radar-model";

type Three = typeof ThreeNs;

/** What the scene reads every frame; the React side swaps it in without rebuilding the scene. */
export interface OceanInputs {
  coins: RadarCoin[];
  selected: string | null;
  query: string;
}

export interface OceanHandle {
  dispose(): void;
}

const LONG = DECK.long;
const SHORT = DECK.short;
const CAM_Z = 30;
const FOV = 36;
/** Half the visible height at z = 0. */
const HV = Math.tan(((FOV / 2) * Math.PI) / 180) * CAM_Z;
/** Depth of a 100th (or 0th) percentile whale. */
const YMAX = HV * 0.82;

const WHALE_VS = `attribute float aEye;varying float vEye;uniform float uTime;uniform float uAmp;varying vec3 vN;varying vec3 vV;varying float vX;varying float vY;
void main(){vec3 p=position;float tail=1.0-smoothstep(-2.2,0.35,p.x);p.y+=sin(uTime-p.x*2.1)*uAmp*tail*tail;vEye=aEye;vX=p.x;vY=position.y;vec4 mv=modelViewMatrix*vec4(p,1.0);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`;
const WHALE_FS = `varying float vEye;uniform vec3 uColor;uniform float uSel;uniform float uTime;uniform float uDim;varying vec3 vN;varying vec3 vV;varying float vX;varying float vY;
void main(){if(vEye>0.5){gl_FragColor=vec4(vec3(1.0)*uDim,1.0);return;}float fr=pow(1.0-abs(dot(normalize(vN),normalize(vV))),2.2);float belly=smoothstep(0.02,-0.22,vY);float grooves=belly*smoothstep(0.55,1.0,0.5+0.5*sin(vY*90.0))*step(-0.2,vX);float scan=smoothstep(0.93,1.0,0.5+0.5*sin(vX*9.0-uTime*0.8));vec3 base=vec3(0.015,0.025,0.06)+uColor*0.07;vec3 col=base+uColor*(fr*1.5+grooves*0.45+scan*0.3)+vec3(0.6,0.9,1.0)*pow(fr,6.0)*0.4;col+=uColor*uSel*(0.28+0.16*sin(uTime*2.0));gl_FragColor=vec4(col*uDim,1.0);}`;
const PLANE_VS = "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}";
const SURF_FS =
  "varying vec2 vUv;uniform float uTime;void main(){float x=vUv.x*90.0;float w=0.45+0.07*sin(x*0.35+uTime*1.1)+0.04*sin(x*1.1-uTime*1.7);float d=abs(vUv.y-w);float a=smoothstep(0.035,0.0,d)*0.8+smoothstep(0.25,0.0,d)*0.16+step(w,vUv.y)*0.1;gl_FragColor=vec4(vec3(0.5,1.0,0.95)*a,a);}";
const BED_FS =
  "varying vec2 vUv;uniform float uTime;void main(){float x=vUv.x*60.0;float h=0.42+0.09*sin(x*0.23)+0.05*sin(x*0.71+1.3)+0.025*sin(x*2.3);float d=vUv.y-h;vec3 pink=vec3(1.0,0.18,0.46);float rim=smoothstep(0.03,0.0,abs(d));float glow=smoothstep(0.5,0.0,d)*step(0.0,d)*0.3;vec3 col=d<0.0?mix(vec3(0.04,0.01,0.05),vec3(0.11,0.02,0.09),vUv.y/h)+pink*rim:pink*(glow+rim);float a=d<0.0?1.0:(glow+rim);gl_FragColor=vec4(col,a);}";

/** Coins the ocean search matches: an exact symbol if there is one, else symbols starting with the query. */
export function oceanMatch(coins: RadarCoin[], query: string): RadarCoin[] {
  const q = query.trim().toUpperCase();
  if (!q) return coins;
  const exact = coins.filter((c) => c.symbol.toUpperCase() === q);
  return exact.length ? exact : coins.filter((c) => c.symbol.toUpperCase().startsWith(q));
}

/** Target size of a whale: 0.34 + sqrt(gross / largest gross) * 2. */
function whaleScale(gross: number, maxGross: number): number {
  return 0.34 + Math.sqrt(Math.max(0, gross) / Math.max(1, maxGross)) * 2.0;
}

function pctText(c: RadarCoin): string {
  return c.usedFallback ? `${c.pct.toFixed(1)}% long` : `${Math.round(c.pct)} pctl`;
}

interface Whale {
  s: string;
  g: ThreeNs.Group;
  mat: ThreeNs.ShaderMaterial;
  glow: ThreeNs.Sprite;
  lab: HTMLButtonElement;
  logo: HTMLSpanElement;
  sym: HTMLSpanElement;
  meta: HTMLSpanElement;
  x: number;
  z: number;
  yaw: number;
  yawT: number;
  sy: number;
  scale: number;
  rnd: number;
  ph: number;
  long: boolean | null;
  key: string;
  vis: boolean | null;
}

/**
 * Whale ocean: every coin is a whale swimming at a depth set by its whale
 * positioning. Long-leaning coins (30-day percentile above 50) swim near the
 * surface, short-leaning ones dive; size follows gross whale notional.
 * Builds the three.js scene inside `el` and animates it until disposed.
 */
export function createOcean(THREE: Three, el: HTMLElement, read: () => OceanInputs, onPick: (symbol: string) => void): OceanHandle {
  const W = () => Math.max(1, el.clientWidth);
  const H = () => Math.max(1, el.clientHeight);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(W(), H(), false);
  const cv = renderer.domElement;
  cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
  cv.setAttribute("aria-hidden", "true");
  el.appendChild(cv);
  const layer = document.createElement("div");
  layer.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;";
  el.appendChild(layer);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, W() / H(), 0.1, 300);
  camera.position.set(0, 0, CAM_Z);

  const mkTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    if (g) draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const radial = (g: CanvasRenderingContext2D, w: number, h: number, a: number) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(a, "rgba(255,255,255,.3)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  };
  const glowTex = mkTex(128, 128, (g, w, h) => radial(g, w, h, 0.3));
  const dotTex = mkTex(32, 32, (g, w, h) => radial(g, w, h, 0.5));
  const rayTex = mkTex(64, 256, (g, w, h) => {
    let gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "destination-in";
    gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, "rgba(0,0,0,0)");
    gr.addColorStop(0.5, "rgba(0,0,0,1)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  const ringTex = mkTex(128, 128, (g, w, h) => {
    g.strokeStyle = "#fff";
    g.lineWidth = 4;
    g.beginPath();
    g.arc(w / 2, h / 2, w / 2 - 5, 0, Math.PI * 2);
    g.stroke();
  });
  const add = <T extends ThreeNs.Object3D>(o: T): T => {
    scene.add(o);
    return o;
  };

  // Light rays from the surface.
  const rays: ThreeNs.Mesh[] = [];
  const rayGeo = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
  for (let i = 0; i < 9; i++) {
    const m = add(
      new THREE.Mesh(
        rayGeo,
        new THREE.MeshBasicMaterial({ map: rayTex, color: 0x8ff7ff, transparent: true, opacity: 0.04 + Math.random() * 0.07, blending: THREE.AdditiveBlending, depthWrite: false }),
      ),
    );
    m.position.set(-34 + i * 8.5 + Math.random() * 4, HV * 1.35, -12);
    m.scale.set(1.5 + Math.random() * 3.5, HV * 3, 1);
    m.userData = { base: -0.32 + Math.random() * 0.12, ph: Math.random() * 6 };
    rays.push(m);
  }

  // Wavy surface line and the glowing pink seabed.
  const surfMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 } }, vertexShader: PLANE_VS, fragmentShader: SURF_FS });
  const surf = add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), surfMat));
  surf.position.set(0, HV + 0.35, -1);
  surf.scale.set(140, 1.6, 1);
  const bedZ = -5;
  const bedMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 } }, vertexShader: PLANE_VS, fragmentShader: BED_FS });
  const bed = add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bedMat));
  bed.position.set(0, (-HV * (CAM_Z - bedZ)) / CAM_Z + 0.9, bedZ);
  bed.scale.set(160, 3.6, 1);

  // Rising bubbles.
  const NB = 700;
  const bp = new Float32Array(NB * 3);
  const bv = new Float32Array(NB);
  for (let i = 0; i < NB; i++) {
    bp[i * 3] = (Math.random() - 0.5) * 80;
    bp[i * 3 + 1] = (Math.random() - 0.5) * HV * 2.5;
    bp[i * 3 + 2] = -14 + Math.random() * 16;
    bv[i] = 0.15 + Math.random() * 0.5;
  }
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute("position", new THREE.BufferAttribute(bp, 3));
  add(new THREE.Points(bgeo, new THREE.PointsMaterial({ map: dotTex, color: 0xbff6ff, size: 0.16, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })));

  // One merged whale mesh (body, flukes, dorsal, flippers, eyes), shared by every whale.
  const pts = [new THREE.Vector2(0, -1.6)];
  for (let i = 0; i <= 44; i++) {
    const u = 1 - i / 44;
    const r = 0.44 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.55)), 0.8) * (1 - 0.82 * u) + 0.035 * u;
    pts.push(new THREE.Vector2(Math.max(r, 0.0001), 1.0 - u * 2.6));
  }
  const bodyGeo = new THREE.LatheGeometry(pts, 30);
  bodyGeo.rotateZ(-Math.PI / 2);
  bodyGeo.scale(1, 0.8, 0.95);
  const fs = new THREE.Shape();
  fs.moveTo(0, 0);
  fs.quadraticCurveTo(-0.12, 0.32, -0.42, 0.62);
  fs.quadraticCurveTo(-0.52, 0.68, -0.54, 0.58);
  fs.quadraticCurveTo(-0.38, 0.3, -0.44, 0.0);
  fs.quadraticCurveTo(-0.38, -0.3, -0.54, -0.58);
  fs.quadraticCurveTo(-0.52, -0.68, -0.42, -0.62);
  fs.quadraticCurveTo(-0.12, -0.32, 0, 0);
  const flukeGeo = new THREE.ShapeGeometry(fs, 10);
  flukeGeo.rotateX(Math.PI / 2);
  flukeGeo.translate(-1.56, 0, 0);
  const ps = new THREE.Shape();
  ps.moveTo(0, 0.05);
  ps.quadraticCurveTo(-0.2, 0.09, -0.62, 0.03);
  ps.quadraticCurveTo(-0.68, -0.01, -0.6, -0.04);
  ps.quadraticCurveTo(-0.25, -0.06, 0, -0.05);
  const finGeo = new THREE.ShapeGeometry(ps, 8);
  finGeo.rotateX(Math.PI / 2);
  const ds = new THREE.Shape();
  ds.moveTo(0.05, 0);
  ds.quadraticCurveTo(-0.04, 0.1, -0.2, 0.16);
  ds.quadraticCurveTo(-0.16, 0.05, -0.2, 0);
  ds.lineTo(0.05, 0);
  const dorsalGeo = new THREE.ShapeGeometry(ds, 6);
  dorsalGeo.translate(-0.62, 0.12, 0);
  const eyeGeo = new THREE.SphereGeometry(0.03, 8, 6);
  const parts: [ThreeNs.BufferGeometry, ThreeNs.Matrix4 | null, number][] = [
    [bodyGeo, null, 0],
    [flukeGeo, null, 0],
    [dorsalGeo, null, 0],
  ];
  for (const sd of [1, -1]) {
    parts.push([
      finGeo,
      new THREE.Matrix4().compose(new THREE.Vector3(0.42, -0.17, 0.27 * sd), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.75 * sd, 0.4)), new THREE.Vector3(1, 1, 1)),
      0,
    ]);
    parts.push([eyeGeo, new THREE.Matrix4().makeTranslation(0.6, -0.05, 0.3 * sd), 1]);
  }
  const pg = parts.map(([g, m, e]) => {
    const q = g.index ? g.toNonIndexed() : g.clone();
    if (m) q.applyMatrix4(m);
    return [q, e] as const;
  });
  let nv = 0;
  for (const [q] of pg) nv += q.attributes.position.count;
  const PA = new Float32Array(nv * 3);
  const NA = new Float32Array(nv * 3);
  const EA = new Float32Array(nv);
  let off = 0;
  for (const [q, e] of pg) {
    const n = q.attributes.position.count;
    PA.set(q.attributes.position.array as Float32Array, off * 3);
    NA.set(q.attributes.normal.array as Float32Array, off * 3);
    if (e) EA.fill(1, off, off + n);
    off += n;
    q.dispose();
  }
  for (const g of [bodyGeo, flukeGeo, finGeo, dorsalGeo, eyeGeo]) g.dispose();
  const whaleGeo = new THREE.BufferGeometry();
  whaleGeo.setAttribute("position", new THREE.BufferAttribute(PA, 3));
  whaleGeo.setAttribute("normal", new THREE.BufferAttribute(NA, 3));
  whaleGeo.setAttribute("aEye", new THREE.BufferAttribute(EA, 1));
  whaleGeo.computeBoundingSphere();

  const whales = new Map<string, Whale>();
  const bodies: ThreeNs.Mesh[] = [];
  let hover: string | null = null;
  let labHover: string | null = null;

  const addWhale = (c: RadarCoin, maxGross: number): Whale => {
    const col = c.long ? LONG : SHORT;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAmp: { value: 0.2 }, uColor: { value: new THREE.Color(col) }, uSel: { value: 0 }, uDim: { value: 1 } },
      vertexShader: WHALE_VS,
      fragmentShader: WHALE_FS,
      side: THREE.DoubleSide,
    });
    const g = new THREE.Group();
    const body = new THREE.Mesh(whaleGeo, mat);
    body.userData.s = c.symbol;
    g.add(body);
    bodies.push(body);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(5.2, 2.4, 1);
    glow.position.x = -0.3;
    g.add(glow);
    scene.add(g);

    const lab = document.createElement("button");
    lab.type = "button";
    lab.style.cssText =
      "position:absolute;left:0;top:0;margin:0;border:0;display:flex;align-items:center;gap:5px;white-space:nowrap;cursor:pointer;font-family:var(--font-chakra),sans-serif;font-weight:700;letter-spacing:.04em;color:#f2f4ff;text-align:left;transition:opacity .3s;will-change:transform;padding:2px 7px 2px 3px;border-radius:999px;background:rgba(5,6,11,.35);backdrop-filter:blur(2px);opacity:0;pointer-events:none;outline-offset:2px;";
    lab.tabIndex = -1;
    lab.setAttribute("aria-hidden", "true");
    const logo = document.createElement("span");
    logo.style.cssText = `border-radius:50%;flex-shrink:0;background:${DECK.logoBg} url("${coinLogoUrl(c.symbol)}") center/cover no-repeat;`;
    const text = document.createElement("span");
    text.style.cssText = "display:flex;flex-direction:column;line-height:1.15;";
    const sym = document.createElement("span");
    sym.textContent = c.symbol;
    const meta = document.createElement("span");
    meta.style.cssText = "font-family:var(--font-jetbrains),monospace;font-weight:500;font-size:10.5px;color:#d5d9f2;text-shadow:0 1px 2px #000;";
    text.append(sym, meta);
    lab.append(logo, text);
    lab.addEventListener("click", () => onPick(c.symbol));
    lab.addEventListener("mouseenter", () => (labHover = c.symbol));
    lab.addEventListener("mouseleave", () => {
      if (labHover === c.symbol) labHover = null;
    });
    lab.addEventListener("focus", () => (labHover = c.symbol));
    lab.addEventListener("blur", () => {
      if (labHover === c.symbol) labHover = null;
    });
    layer.appendChild(lab);

    const yaw = Math.random() < 0.5 ? 0 : Math.PI;
    const w: Whale = {
      s: c.symbol,
      g,
      mat,
      glow,
      lab,
      logo,
      sym,
      meta,
      x: (Math.random() - 0.5) * 1.6 * HV * (W() / H()),
      z: -5 + Math.random() * 7,
      yaw,
      yawT: yaw,
      sy: ((c.pct - 50) / 50) * YMAX,
      scale: whaleScale(c.gross, maxGross),
      rnd: Math.random(),
      ph: Math.random() * 6,
      long: null,
      key: "",
      vis: null,
    };
    whales.set(c.symbol, w);
    return w;
  };

  const ring = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })));

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const onMove = (e: PointerEvent) => {
    const r = cv.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(bodies, false)[0];
    hover = hit ? (hit.object.userData.s as string) : null;
    cv.style.cursor = hover ? "pointer" : "default";
  };
  const onLeave = () => {
    hover = null;
  };
  const onClick = () => {
    if (hover) onPick(hover);
  };
  cv.addEventListener("pointermove", onMove);
  cv.addEventListener("pointerleave", onLeave);
  cv.addEventListener("click", onClick);

  const ro = new ResizeObserver(() => {
    renderer.setSize(W(), H(), false);
    camera.aspect = W() / H();
    camera.updateProjectionMatrix();
  });
  ro.observe(el);

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const v3 = new THREE.Vector3();
  let raf = 0;
  let last = performance.now();
  let t = 0;
  let lastCoins: RadarCoin[] | null = null;
  let cmap = new Map<string, RadarCoin>();
  let mg = 1;

  const tick = () => {
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt;
    const { coins, selected: sel, query } = read();
    const sp = reduceMotion?.matches ? 0.35 : 1;
    const oq = query.trim();
    const mset = oq ? new Set(oceanMatch(coins, oq).map((c) => c.symbol)) : null;
    const hov = hover ?? labHover;
    if (coins !== lastCoins) {
      lastCoins = coins;
      cmap = new Map(coins.map((c) => [c.symbol, c]));
      mg = Math.max(1, ...coins.map((c) => c.gross));
      for (const c of coins) if (!whales.has(c.symbol)) addWhale(c, mg);
    }
    const w_ = W();
    const h_ = H();
    const asp = w_ / h_;
    surfMat.uniforms.uTime.value = t;
    bedMat.uniforms.uTime.value = t;
    for (const m of rays) m.rotation.z = (m.userData.base as number) + Math.sin(t * 0.15 + (m.userData.ph as number)) * 0.05;
    for (let i = 0; i < NB; i++) {
      bp[i * 3 + 1] += bv[i] * dt * sp;
      bp[i * 3] += Math.sin(t * 0.5 + i) * dt * 0.05;
      if (bp[i * 3 + 1] > HV * 1.3) {
        bp[i * 3 + 1] = -HV * 1.3;
        bp[i * 3] = (Math.random() - 0.5) * 80;
      }
    }
    bgeo.attributes.position.needsUpdate = true;

    let selW: Whale | null = null;
    for (const w of whales.values()) {
      const c = cmap.get(w.s);
      if (!c) {
        w.g.visible = false;
        if (w.vis !== false) {
          w.vis = false;
          w.lab.style.opacity = "0";
          w.lab.style.pointerEvents = "none";
          w.lab.tabIndex = -1;
          w.lab.setAttribute("aria-hidden", "true");
        }
        continue;
      }
      w.g.visible = true;
      const long = c.long;
      const col = long ? LONG : SHORT;
      if (w.long !== long) {
        w.long = long;
        (w.mat.uniforms.uColor.value as ThreeNs.Color).set(col);
        w.glow.material.color.set(col);
        w.key = "";
      }
      w.scale += (whaleScale(c.gross, mg) - w.scale) * Math.min(1, dt * 1.5);
      w.sy += (((c.pct - 50) / 50) * YMAX - w.sy) * Math.min(1, dt * 0.9);
      const speed = ((0.7 + w.rnd * 0.9) / (0.55 + w.scale * 0.55)) * sp * 1.3;
      w.yaw += (w.yawT - w.yaw) * Math.min(1, dt * 1.1);
      w.x += Math.cos(w.yaw) * speed * dt;
      w.z = Math.max(-6, Math.min(3, w.z - Math.sin(w.yaw) * speed * dt * 0.5));
      const k = (CAM_Z - w.z) / CAM_Z;
      const bound = HV * asp * k * 0.94 - w.scale * 1.1;
      if (w.x > bound && Math.cos(w.yawT) > 0) w.yawT += (w.z > -1.5 ? 1 : -1) * Math.PI;
      else if (w.x < -bound && Math.cos(w.yawT) < 0) w.yawT += (w.z > -1.5 ? -1 : 1) * Math.PI;
      const y = w.sy * k + Math.sin(t * 0.6 + w.ph) * 0.12;
      w.g.position.set(w.x, y, w.z);
      w.g.rotation.set(0, w.yaw, Math.sin(t * 0.8 + w.ph) * 0.05);
      w.g.scale.setScalar(w.scale);
      w.ph += dt * sp * (2.6 / (0.7 + w.scale * 0.45));
      w.mat.uniforms.uTime.value = w.ph;
      const isSel = w.s === sel;
      const isHov = w.s === hov;
      const miss = !!mset && !mset.has(w.s) && !isSel;
      const depth = (0.55 + (0.45 * (w.z + 6)) / 9) * (miss ? 0.22 : 1);
      w.mat.uniforms.uSel.value += ((isSel ? 1 : isHov ? 0.6 : 0) - w.mat.uniforms.uSel.value) * Math.min(1, dt * 6);
      w.mat.uniforms.uDim.value = depth;
      w.glow.material.opacity = (isSel ? 0.55 : isHov ? 0.4 : 0.2) * depth;
      if (isSel) selW = w;

      // Label: logo + ticker at the whale's head; selected/hovered whales add percentile and gross.
      const headOff = 0.12 * w.scale;
      v3.set(w.x + Math.cos(w.yaw) * headOff, y - 0.02 * w.scale, w.z - Math.sin(w.yaw) * headOff).project(camera);
      const px = (v3.x * 0.5 + 0.5) * w_;
      const py = (-v3.y * 0.5 + 0.5) * h_;
      const vis = !miss;
      const meta = isSel || isHov;
      const fsz = Math.round(Math.max(10, Math.min(16, 9 + w.scale * 3)));
      const key = `${long}|${fsz}|${isSel}|${meta ? `${pctText(c)}|${Math.round(c.gross)}` : ""}`;
      if (key !== w.key) {
        w.key = key;
        const box = `${fsz + 6}px`;
        w.logo.style.width = box;
        w.logo.style.height = box;
        w.logo.style.boxShadow = `0 0 0 1.5px ${col},0 0 12px ${col}`;
        w.sym.style.fontSize = `${fsz}px`;
        w.sym.style.textShadow = `0 0 10px ${col},0 1px 2px #000`;
        w.meta.textContent = meta ? `${pctText(c)} · ${fmtUsd(c.gross)}` : "";
        w.meta.style.display = meta ? "" : "none";
        w.lab.setAttribute("aria-label", `${c.symbol}: ${long ? "long" : "short"}-leaning, ${c.usedFallback ? `long share ${c.pct.toFixed(1)}%` : `30-day percentile ${Math.round(c.pct)}`}, gross ${fmtUsd(c.gross)}`);
        w.lab.setAttribute("aria-pressed", String(isSel));
      }
      w.lab.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px) translate(-50%,-50%)`;
      w.lab.style.zIndex = isSel ? "3" : isHov ? "2" : "1";
      if (vis !== w.vis) {
        w.vis = vis;
        w.lab.style.opacity = vis ? "1" : "0";
        w.lab.style.pointerEvents = vis ? "auto" : "none";
        w.lab.tabIndex = vis ? 0 : -1;
        if (vis) w.lab.removeAttribute("aria-hidden");
        else w.lab.setAttribute("aria-hidden", "true");
      }
    }
    if (selW) {
      const p = (t * 0.55) % 1;
      ring.position.copy(selW.g.position);
      ring.scale.setScalar(selW.scale * (1.4 + p * 4));
      ring.material.opacity = (1 - p) * 0.6;
      ring.material.color.set(selW.long ? LONG : SHORT);
    } else ring.material.opacity = 0;
    renderer.render(scene, camera);
  };

  // Only animate while the ocean is on screen.
  const start = () => {
    if (raf) return;
    last = performance.now();
    tick();
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) start();
    else stop();
  });
  io.observe(el);
  start();

  return {
    dispose() {
      stop();
      io.disconnect();
      ro.disconnect();
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerleave", onLeave);
      cv.removeEventListener("click", onClick);
      scene.traverse((o) => {
        const m = (o as ThreeNs.Mesh).material as ThreeNs.Material | undefined;
        if (m) m.dispose();
      });
      for (const tex of [glowTex, dotTex, rayTex, ringTex]) tex.dispose();
      for (const g of [whaleGeo, rayGeo, bgeo, surf.geometry, bed.geometry]) g.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      cv.remove();
      layer.remove();
    },
  };
}
