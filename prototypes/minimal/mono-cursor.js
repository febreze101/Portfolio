/* MonoLens — the "Mono lens" cursor from the lab (cursors.html, option 2), standalone.

   A small circle with a greyscale backdrop-filter trails the pointer, with a difference-blended dot at the exact
   point. It grows over links and buttons, opens into a VIEW lens over project images, collapses to a caret over
   text, and squeezes on press. On whenever a mouse / trackpad exists; touch input itself is ignored.

   What's under the pointer is read from the page itself (no markup needed); an element can override with
   data-kind="link|img|text|none" and data-cursor="label".                                                    */

const KIND_SELECTORS = [
  ['none', '[data-kind="none"]'],
  ['img', '[data-kind="img"], .cc-card'],
  ['link', '[data-kind="link"], a, button, [role="tab"], [data-open], label, select, input[type="range"], input[type="checkbox"], .cc-next'],
  ['text', '[data-kind="text"], p, h1, h2, h3, h4, li, dd, input:not([type]), input[type="text"], input[type="email"], textarea'],
];
const SIZE = {link: 66, img: 120};

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);              // frame-rate independent lerp factor
const spring = (v, k = 420, d = 30) => ({v, t: v, vel: 0, step(dt) { this.vel += (k * (this.t - this.v) - d * this.vel) * dt; this.v += this.vel * dt; return this.v; }});

const CSS = `
@media (any-pointer:fine){html.mono-cursor,html.mono-cursor *{cursor:none!important}}
.ml{position:fixed;left:0;top:0;z-index:2147483000;pointer-events:none;will-change:transform;transition:opacity .25s}
html:not(.mono-cursor) .ml,html.ml-away .ml{opacity:0!important}
.ml-ring{--mono-f:grayscale(1) contrast(1.25) brightness(1.12);backdrop-filter:var(--mono-f);-webkit-backdrop-filter:var(--mono-f);
  box-shadow:0 0 0 1px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.75);display:grid;place-items:center}
.ml-ring span{font-family:ui-monospace,"SF Mono","Cascadia Mono",Consolas,monospace;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.6)}
.ml-dot{width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:#fff;mix-blend-mode:difference}`;

export class MonoLens {
  constructor({label = 'View'} = {}) {
    this.label = label;
    this.fine = matchMedia('(any-pointer: fine)').matches;   // any: touchscreen laptops report a coarse primary pointer
    this.on = false; this.seen = false; this.down = false; this.kind = null;
    this.mx = this.my = this.x = this.y = -200;
    if (!this.fine) return;

    const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
    // appended straight to <body>: no wrapper, so nothing becomes a stacking context / backdrop root for the filter
    this.ring = Object.assign(document.createElement('div'), {className: 'ml ml-ring', innerHTML: '<span></span>'});
    this.dot = Object.assign(document.createElement('div'), {className: 'ml ml-dot'});
    this.lbl = this.ring.firstChild;
    document.body.append(this.ring, this.dot);
    this.w = spring(40); this.h = spring(40); this.lo = spring(0, 300, 30);

    addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      this.mx = e.clientX; this.my = e.clientY;
      if (!this.seen) { this.seen = true; this.x = this.mx; this.y = this.my; }
      document.documentElement.classList.remove('ml-away');
      this.classify(e.target);
    }, {passive: true});
    addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') this.down = true; });
    addEventListener('pointerup', () => { this.down = false; });
    document.addEventListener('mouseout', e => { if (!e.relatedTarget) document.documentElement.classList.add('ml-away'); });
    // content under a still pointer can change (carousel moves, a case study opens) — re-check now and then
    setInterval(() => { if (this.on && this.seen) this.classify(document.elementFromPoint(this.mx, this.my)); }, 200);
    this.enable(true);
  }

  classify(el) {
    this.kind = null; this.text = '';
    if (!el?.closest) return;
    for (const [kind, sel] of KIND_SELECTORS) {
      const hit = el.closest(sel);
      if (hit) { this.kind = kind === 'none' ? null : kind; this.text = hit.dataset.cursor || ''; return; }
    }
  }

  enable(on) {
    if (!this.fine) return;
    this.on = on;
    document.documentElement.classList.toggle('mono-cursor', on);
    if (on && !this.raf) {
      let last = performance.now();
      const tick = now => {
        const dt = Math.min((now - last) / 1000, 1 / 30) || 1 / 60; last = now;
        if (this.seen) this.frame(dt);
        this.raf = this.on ? requestAnimationFrame(tick) : 0;
      };
      this.raf = requestAnimationFrame(tick);
    }
  }

  frame(dt) {
    const k = this.kind, caret = k === 'text', press = this.down ? .85 : 1;
    this.w.t = (caret ? 3 : SIZE[k] || 40) * press; this.h.t = (caret ? 30 : SIZE[k] || 40) * press;
    const w = Math.max(2, this.w.step(dt)), h = Math.max(2, this.h.step(dt));
    const f = ease(caret ? 40 : 20, dt); this.x += (this.mx - this.x) * f; this.y += (this.my - this.y) * f;
    const r = this.ring.style;
    r.width = w + 'px'; r.height = h + 'px'; r.borderRadius = Math.min(w, h) / 2 + 'px';
    r.transform = `translate3d(${this.x - w / 2}px,${this.y - h / 2}px,0)`;
    this.lo.t = k === 'img' ? 1 : 0;
    this.lbl.style.opacity = clamp(this.lo.step(dt)); this.lbl.textContent = this.text || this.label;
    this.dot.style.transform = `translate3d(${this.mx}px,${this.my}px,0)`; this.dot.style.opacity = caret ? 0 : 1;
  }
}
