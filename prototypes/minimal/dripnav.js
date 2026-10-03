/* DripNav — the approved "Drip · pass-through" nav indicator, ported from the lab (nav.html).
   A droplet indicator for a row of buttons: the selection pinches off as a drop, is thrown (accelerate → decelerate)
   across to the target, visibly passing through any buttons in between, and is swallowed with a small wobble.
   An SVG metaball ("goo") filter fuses nearby shapes, which is what makes the necks and the merge.
   Needs window.gsap.

   Markup:  <div class="pipenav"><div class="row"><button>…</button>…</div></div>
   The SVG is injected behind .row; labels use mix-blend-mode:difference so they invert under the drop. */

export const DRIP_SETTINGS = {
  // motion
  dur: 0.2, ease: 'expo.inOut', perHop: 0.3,           // perHop: extra time per button crossed (share of dur)
  drain: 0.75, jiggle: 0.14,                           // source empties / target fills over this share; landing wobble
  // drop
  dropW: 26, dropH: 22, stretch: 0.9, magnet: 12, range: 50, passBulge: 0,
  // shape
  height: 40, padX: 18, radius: 2, gap: 12, goo: 4.5,
  pipes: false, pipe: 8, swell: 6,
  fill: '#1c1a19', ink: '#f4f2ee',
  // hover: little beads keep flowing down toward the hovered button
  hover: 'ripple', hoverReach: 16, hoverDur: 0.7, hoverEase: 'expo.out', hoverSpeed: 0.2,
  // tray
  pad: 5, rim: 0.16,
};

const NS = 'http://www.w3.org/2000/svg';
const mk = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent?.appendChild(e); return e; };
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const put = (r, x, y, w, h, rx) => { r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', Math.max(0, w)); r.setAttribute('height', Math.max(0, h)); r.setAttribute('rx', Math.max(0, Math.min(rx, h / 2, w / 2))); };
let uid = 0;

export class DripNav {
  constructor(el, P = DRIP_SETTINGS, sel = 0) {
    const gsap = window.gsap;
    this.gsap = gsap; this.P = {...P}; this.el = el; this.id = `drip${uid++}`; this.sel = sel;
    this.S = {a: sel, b: sel, t: 1, jig: 0, h: 0, hi: null, clock: 0};
    this.btns = [...el.querySelectorAll('.row > button')];
    this.btns.forEach((b, i) => b.addEventListener('pointerenter', () => this.hover(i)));
    el.querySelector('.row').addEventListener('pointerleave', () => this.hover(null));
    this.tick = () => { this.S.clock += gsap.ticker.deltaRatio() / 60; this.render(); };
    new ResizeObserver(() => this.build()).observe(el);
    document.fonts?.ready.then(() => this.build());   // label widths change once the webfont lands
    this.build();
  }

  set(patch) { Object.assign(this.P, patch); this.build(); }

  build() {
    const P = this.P, el = this.el, H = P.height, gsap = this.gsap;
    el.style.setProperty('--gap', P.gap + 'px'); el.style.setProperty('--r', P.radius + 'px');
    el.style.setProperty('--h', H + 'px'); el.style.setProperty('--px', P.padX + 'px');
    el.parentElement?.style.setProperty('--pad', P.pad + 'px');
    el.parentElement?.style.setProperty('--rim', P.rim);
    this.B = this.btns.map(b => ({x: b.offsetLeft, w: b.offsetWidth}));
    const W = el.offsetWidth;
    if (!W) return;                                     // not laid out yet; the ResizeObserver will call again
    this.svg?.remove();
    const svg = this.svg = mk('svg', {width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true'});
    el.prepend(svg);
    const defs = mk('defs', {}, svg);
    // metaball filter: blur → alpha threshold → put the crisp original back on top
    const f = mk('filter', {id: this.id, x: -20, y: -20, width: W + 40, height: H + 40, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB'}, defs);
    mk('feGaussianBlur', {in: 'SourceGraphic', stdDeviation: P.goo, result: 'b'}, f);
    mk('feColorMatrix', {in: 'b', mode: 'matrix', values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9', result: 'g'}, f);
    mk('feComposite', {in: 'SourceGraphic', in2: 'g', operator: 'atop'}, f);

    // dark blocks (+ tubes when visible)
    const base = mk('g', {filter: `url(#${this.id})`, fill: P.fill}, svg);
    this.baseRects = this.B.map(b => mk('rect', {x: b.x, y: 0, width: b.w, height: H, rx: P.radius}, base));
    this.pipes = this.B.slice(0, -1).map((a, i) => {
      const b = this.B[i + 1], x = a.x + a.w - P.radius;
      return {i, r: P.pipes ? mk('rect', {x, width: b.x + P.radius - x, y: (H - P.pipe) / 2, height: P.pipe, rx: P.pipe / 2}, base) : null};
    });

    // the liquid: source remnant, target fill, magnet bud, the drop, and hover shapes — all fused by the goo
    const goo = mk('g', {filter: `url(#${this.id})`, fill: P.ink}, svg);
    this.src = mk('rect', {}, goo); this.dst = mk('rect', {}, goo); this.bud = mk('rect', {}, goo);
    this.drop = mk('rect', {}, goo);
    this.hl = mk('rect', {}, goo); this.hb = mk('rect', {}, goo);
    this.hBeads = Array.from({length: 3}, () => mk('rect', {}, goo));
    this.ease = gsap.parseEase(P.ease);
    this.render();
  }

  /** Move the selection to button j. Safe to call repeatedly with the same index. */
  go(j) {
    if (j === this.sel || j < 0 || j >= this.btns.length) return;
    const P = this.P, S = this.S, gsap = this.gsap;
    this.btns.forEach((b, i) => b.setAttribute('aria-selected', i === j));
    gsap.killTweensOf(S); gsap.ticker.remove(this.tick);
    const D = P.dur * (1 + P.perHop * (Math.abs(j - this.sel) - 1));   // longer jumps get a little more time
    Object.assign(S, {a: this.sel, b: j, t: 0, h: 0, hi: null});
    this.sel = j;
    const render = () => this.render();
    gsap.to(S, {t: 1, duration: D, ease: 'none', onUpdate: render});
    gsap.fromTo(S, {jig: 1}, {jig: 0, duration: 0.9, delay: D * 0.9, ease: 'elastic.out(1, 0.3)', immediateRender: false, overwrite: false, onUpdate: render});
  }

  hover(i) {
    const P = this.P, S = this.S, gsap = this.gsap;
    if (P.hover === 'none') return;
    const render = () => this.render();
    if (i === null || i === this.sel || S.t < 1) {
      gsap.to(S, {h: 0, duration: P.hoverDur * 0.6, ease: 'power2.out', overwrite: 'auto', onUpdate: render,
        onComplete: () => { S.hi = null; gsap.ticker.remove(this.tick); render(); }});
      return;
    }
    if (S.hi !== null && S.hi !== i) S.h *= 0.25;      // switching targets: collapse most of the old reach first
    S.hi = i;
    gsap.to(S, {h: 1, duration: P.hoverDur, ease: P.hoverEase, overwrite: 'auto', onUpdate: render});
    if (P.hover === 'ripple') { gsap.ticker.remove(this.tick); gsap.ticker.add(this.tick); }
  }

  render() {
    if (!this.svg) return;
    const {S, P, B} = this, H = P.height, e = this.ease;
    const A = B[S.a], T = B[S.b], dir = Math.sign((T.x - A.x) || 1), t = S.t;
    const ca = A.x + A.w / 2, cb = T.x + T.w / 2, moving = S.a !== S.b;

    // source drains toward its exit edge; target fills from its entry edge (buttons in between never fill)
    const rem = moving ? 1 - ss(0, P.drain, t) : 0, fill = moving ? ss(1 - P.drain, 1, t) : 1;
    const sh = H * (0.5 + 0.5 * rem), sw = A.w * rem;
    put(this.src, dir > 0 ? A.x + A.w - sw : A.x, (H - sh) / 2, sw, sh, P.radius);
    const J = P.jiggle * S.jig, fw = T.w * fill * (1 - J * 0.6), fh = H * (1 + J) * (0.55 + 0.45 * fill);
    put(this.dst, fill >= 1 ? T.x + (T.w - fw) / 2 : (dir > 0 ? T.x : T.x + T.w - fw), (H - fh) / 2, fw, fh, P.radius);

    // the drop: thrown centre → centre, stretching with speed, drawn in front of every block it crosses
    const tk = moving ? t : 1, x = ca + (cb - ca) * e(tk);
    const vis = ss(0, 0.12, tk) * (1 - ss(0.86, 1, tk));
    const v = Math.min(1.5, Math.abs(e(Math.min(1, tk + 0.005)) - e(Math.max(0, tk - 0.005))) / 0.01 / 2);
    const dw = P.dropW * (1 + P.stretch * v) * vis, dh = P.dropH / (1 + P.stretch * v * 0.4) * vis;
    put(this.drop, x - dw / 2, (H - dh) / 2, dw, dh, dh / 2);
    const xs = [{x, vis}];

    // blocks being passed through can swell a little (off by default)
    this.baseRects.forEach((r, k) => {
      const b = B[k], cx = b.x + b.w / 2;
      let o = 0;
      if (P.passBulge && moving && k > Math.min(S.a, S.b) && k < Math.max(S.a, S.b)) o = vis * Math.max(0, 1 - Math.abs(x - cx) / (b.w / 2 + P.dropW));
      o = o * o * (3 - 2 * o);
      const h = H * (1 + P.passBulge * o), w = b.w * (1 + P.passBulge * 0.35 * o);
      put(r, cx - w / 2, (H - h) / 2, w, h, P.radius);
    });

    // magnet: the target reaches out for the incoming drop
    const near = dir > 0 ? T.x : T.x + T.w, lead = moving && tk > 0 && tk < 1 ? x + dir * dw / 2 : null;
    const len = lead === null ? 0 : P.magnet * Math.pow(1 - ss(0, P.range, Math.abs(near - lead)), 1.5) * (1 - fill);
    const bh = P.dropH * 0.85, bw = len + P.radius;
    put(this.bud, dir > 0 ? near - bw : near - P.radius, (H - bh) / 2, len > 0.3 ? bw + P.radius : 0, bh, bh / 2);

    // hover (idle only)
    const hov = !moving && S.hi !== null && S.h > 0.001 ? S.h : 0;
    const HB = hov ? B[S.hi] : null, hdir = hov ? Math.sign(HB.x - A.x) : 0;
    const exitE = hov ? (hdir > 0 ? A.x + A.w : A.x) : 0, nearE = hov ? (hdir > 0 ? HB.x : HB.x + HB.w) : 0;
    const arm = (r, from, d, l, th) => (l <= 0.3 || th <= 0.3) ? put(r, 0, 0, 0, 0, 0) : put(r, d > 0 ? from - P.radius : from - l, (H - th) / 2, l + P.radius, th, th / 2);
    const R = P.hoverReach, dist = Math.abs(nearE - exitE), loose = [];
    let hl = 0, hlT = 0, hb = 0, hbT = 0;
    if (hov) switch (P.hover) {
      case 'ripple':
        hl = R * hov; hlT = P.dropH * 0.7; hb = R * 0.6 * hov; hbT = P.dropH * 0.7;
        for (let k = 0; k < 3; k++) {
          const ph = (S.clock * P.hoverSpeed + k / 3) % 1, s = hov * Math.sin(Math.PI * ph);
          loose.push({x: exitE + (nearE - exitE) * ph, w: P.dropH * 0.8 * s, h: P.dropH * 0.7 * s});
        }
        break;
      case 'lean':  hl = R * hov; hlT = P.dropH; hb = R * 0.5 * hov; hbT = P.dropH * 0.7; break;
      case 'reach': hb = R * hov; hbT = P.dropH * 0.8; hl = R * 0.25 * hov; hlT = P.dropH * 0.8; break;
    }
    if (hov && P.hover !== 'ripple') {                 // hints only — the two sides must never touch and fuse
      const room = Math.max(0, dist - P.goo * 0.8 - 2);
      if (hl + hb > room) { const k = room / (hl + hb); hl *= k; hb *= k; }
    }
    arm(this.hl, exitE, hdir, hl, hlT);
    arm(this.hb, nearE, -hdir, hb, hbT);
    this.hBeads.forEach((r, k) => { const b = loose[k]; b ? put(r, b.x - b.w / 2, (H - b.h) / 2, b.w, b.h, b.h / 2) : put(r, 0, 0, 0, 0, 0); });
    for (const b of loose) xs.push({x: b.x, vis: Math.min(1, b.h / P.dropH)});

    // visible tubes bulge around anything passing through them
    if (P.pipes && P.swell) this.pipes.forEach(p => {
      const pc = (B[p.i].x + B[p.i].w + B[p.i + 1].x) / 2;
      let k = 0; for (const b of xs) k = Math.max(k, b.vis * Math.exp(-(((b.x - pc) / (P.dropW + P.gap)) ** 2)));
      const h = P.pipe + P.swell * k;
      p.r.setAttribute('height', h); p.r.setAttribute('y', (H - h) / 2); p.r.setAttribute('rx', h / 2);
    });
  }
}
