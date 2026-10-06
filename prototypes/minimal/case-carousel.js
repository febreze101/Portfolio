/* CaseCarousel — the approved case-study carousel ("Hairline" cards) with the "Expand" opened state,
   ported from the lab (cases.html). Plain DOM + CSS (case-carousel.css); no dependencies.

   - Cards: big landscape frame + editorial caption inside one rounded hairline border; neighbours fade back.
   - Hover plays: a muted looping video if a project has `video`, otherwise its full-page screenshot scrolls
     like a screen recording. On touch, the centred card plays automatically.
   - Click a card (or call open(i)) → the case study grows out of the card's rectangle to fill the host.
     Case layout is one screen, no page scroll: label + serif headline + three fact columns, then a bordered
     panel filling the rest — only its left column scrolls, through sections; the visual on the right stays put
     and switches to the active section. ← → buttons (bottom right) / keys move between projects.
   - layout 'rail': the same cards as small, caption-less thumbnails stacked down the right edge (sketch 2 /
     layouts.html #01). No native scrolling: wheel / trackpad / drag move a target, the position eases toward it
     every frame (Lenis-style lerp) and settles onto a thumb once input stops. Cards are placed with transforms,
     wrapped modulo the list length, so it scrolls infinitely with no copy-jump. setLayout() switches at runtime.

   works: [{name, summary, cats[], link, text, imgs[cover, fullPage, detail, portrait], video?}]
   src(file, width) → image URL                                                                          */

const pad = n => String(n).padStart(2, '0');
const host = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
const TOOLS = ['Webflow', 'Figma', 'Framer', 'Astro', 'Sanity', 'React'];
const ICON = {   // 16px line icons for the fact columns
  tools: '<path d="M10.5 2.5a3 3 0 0 0-3.9 3.9L2.5 10.5l3 3 4.1-4.1a3 3 0 0 0 3.9-3.9l-1.8 1.8-1.9-.4-.4-1.9z"/>',
  format: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 6h12M4.5 4.5h.01M6.5 4.5h.01"/>',
  live: '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c1.8 1.7 2.6 3.7 2.6 6S9.8 12.3 8 14C6.2 12.3 5.4 10.3 5.4 8S6.2 3.7 8 2z"/>',
  panel: '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>',
};
const icon = k => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

export class CaseCarousel {
  constructor({root, overlayHost, works, src, onOpen = () => {}, onClose = () => {}, drift = 22, layout = 'carousel'}) {
    Object.assign(this, {root, overlayHost, works, src, onOpen, onClose});
    this.rail = layout === 'rail';
    this.RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.TOUCH = matchMedia('(hover: none)').matches;
    this.dragging = false; this.moved = 0; this.openCard = null;
    // idle drift (px/s): pauses on hover, input and while a case is open; resumes after a short rest
    this.driftSpeed = drift; this.driftOn = drift > 0; this.hovering = false; this.restUntil = 0; this.drifting = false;

    root.classList.add('cc');
    root.innerHTML = '<div class="cc-track"></div>';
    this.track = root.firstElementChild;
    this.build();

    this.caseEl = document.createElement('div');
    this.caseEl.className = 'cc-case';
    this.caseEl.setAttribute('role', 'dialog'); this.caseEl.setAttribute('aria-modal', 'true'); this.caseEl.setAttribute('aria-label', 'Case study');
    overlayHost.appendChild(this.caseEl);
    let sraf = 0;
    this.caseEl.addEventListener('scroll', () => { cancelAnimationFrame(sraf); sraf = requestAnimationFrame(() => this.syncSteps()); }, {passive: true, capture: true});
    this.caseEl.addEventListener('click', e => {
      if (e.target.closest('.cc-close')) return this.close();
      const nv = e.target.closest('[data-go]'); if (nv) this.shift(+nv.dataset.go);
    });

    this.bindInput();
    requestAnimationFrame(() => this.centreOn(works.length));   // middle copy of the first project
    document.fonts?.ready.then(() => this.centreOn(this.nearIndex()));
    this.rest(2500);                                            // let the intro settle before drifting
    this.driftLoop();
  }

  /** (re)build the cards for the current layout */
  build() {
    const works = this.works, n = works.length;
    this.root.classList.toggle('rail', this.rail);
    // carousel: three copies so there's always something either side. rail: enough copies that the wrapped
    // list is taller than any screen plus a thumb at each end, so the wrap point is always off-screen.
    const copies = this.rail ? Math.ceil((Math.max(screen.height, innerHeight) / 70 + 4) / n) : 3;
    this.track.innerHTML = Array.from({length: n * copies}, (_, k) => this.cardHTML(works[k % n], k % n)).join('');
    this.cards = [...this.track.children];
    this.cards.forEach(card => {
      if (!this.TOUCH) {
        card.addEventListener('pointerenter', () => { this.hovering = true; this.hoverCard = card; if (!this.dragging) this.play(card); if (this.rail) this.render(); });
        card.addEventListener('pointerleave', () => { this.hovering = false; this.hoverCard = null; this.rest(1200); this.stop(card); if (this.rail) this.render(); });
      }
      card.addEventListener('click', e => { if (this.moved > 6 || e.target.closest('.cc-visit')) return; this.open(+card.dataset.i, card); });
    });
    this.nearK = -1;
    if (this.rail) { this.cur = this.target = 0; this.measure(); this.render(); }
  }
  setLayout(layout) {
    const rail = layout === 'rail'; if (rail === this.rail) return;
    const p = +(this.cards[this.nearIndex()]?.dataset.i ?? 0);
    this.close(); this.stopDrift(); this.rail = rail; this.build();
    requestAnimationFrame(() => this.centreOn(this.works.length + p));
  }

  /* ── rail: virtual infinite list ──
     cur/target are unbounded px along the list; card k is centred when cur ≡ k·pitch (mod list length). */
  measure() {
    this.ch = this.cards[0].offsetHeight;
    this.pitch = this.ch + 14;                                     // thumb + gap
    this.L = this.pitch * this.cards.length;
    this.vh = this.track.clientHeight;
  }
  /** signed distance (px) from the rail's centre to card k, wrapped into [-L/2, L/2) */
  dist(k) { const L = this.L, d = ((k * this.pitch - this.cur) % L + L) % L; return d >= L / 2 ? d - L : d; }
  render() {
    let near = 0, bd = Infinity;
    this.cards.forEach((c, k) => {
      const d = this.dist(k), t = Math.min(1, Math.abs(d) / this.pitch);
      c.style.transform = `translate3d(0,${((this.vh - this.ch) / 2 + d).toFixed(2)}px,0) scale(${(1 - .2 * t).toFixed(4)})`;
      c.style.opacity = c === this.hoverCard ? 1 : (1 - .68 * t).toFixed(3);
      if (Math.abs(d) < bd) { bd = Math.abs(d); near = k; }
    });
    if (near !== this.nearK) {
      this.cards[this.nearK]?.classList.remove('near'); this.cards[near].classList.add('near');
      if (this.TOUCH) { this.stop(this.cards[this.nearK]); if (!this.RM && !this.isOpen) this.play(this.cards[near]); }
      this.nearK = near;
    }
  }
  /** run the easing loop until cur reaches target (idle otherwise — nothing moves on its own) */
  kick() {
    if (this.raf) return;
    let last = performance.now();
    const tick = now => {
      if (!this.rail) { this.raf = 0; return; }
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      // frame-rate independent lerp; ≈ Lenis' lerp .14 at 60fps — responsive but still soft
      this.cur += (this.target - this.cur) * (this.RM ? 1 : 1 - Math.exp(-dt * 9));
      if (Math.abs(this.target - this.cur) < .05) this.cur = this.target;
      this.render();
      this.raf = this.cur !== this.target ? requestAnimationFrame(tick) : 0;
    };
    this.raf = requestAnimationFrame(tick);
  }
  snapTarget() { this.target = Math.round(this.target / this.pitch) * this.pitch; }
  /** settle onto the nearest thumb once input has been quiet for a moment (trackpad momentum included) */
  settleSoon(ms = 140) { clearTimeout(this.settleT); this.settleT = setTimeout(() => { if (!this.dragging) { this.snapTarget(); this.kick(); } }, ms); }

  /* ── carousel axis (native horizontal scrolling) ── */
  get pos() { return this.track.scrollLeft; }
  set pos(v) { this.track.scrollLeft = v; }

  /* ── idle drift (carousel only) ── */
  setDrift(on) { this.driftOn = on; if (!on) this.rest(0); }
  /** pause drifting for `ms` (any user input calls this) */
  rest(ms) { this.restUntil = Math.max(this.restUntil, performance.now() + ms); }
  driftLoop() {
    let last = performance.now();
    const tick = now => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const go = !this.rail && this.driftOn && !this.RM && !this.TOUCH && !this.isOpen && !this.hovering && !this.dragging && now > this.restUntil;
      if (go) {
        if (!this.drifting) { this.drifting = true; this.fpos = this.pos; this.track.classList.add('drifting'); }
        this.fpos += this.driftSpeed * dt;
        // three identical copies: when we pass the middle copy, jump back exactly one set — invisible
        const setW = this.cards[this.works.length].offsetLeft - this.cards[0].offsetLeft;
        if (setW > 0 && this.fpos > setW * 1.5) this.fpos -= setW;
        this.pos = this.fpos;                                      // keep our own float; scrollLeft rounds
      } else if (this.drifting) {
        this.drifting = false; this.track.classList.remove('drifting');
        if (!this.isOpen && !this.dragging && !this.rail) this.centreOn(this.nearIndex(), true);   // settle onto a card
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  get isOpen() { return !!this.caseEl?.classList.contains('on'); }   // caseEl doesn't exist yet during the first build()

  /* ── markup ── */
  chips(w) { return `<div class="cc-chips">${w.cats.map(c => `<span>${c}</span>`).join('')}</div>`; }
  visit(w) {
    return `<a class="cc-visit" href="${w.link}" target="_blank" rel="noopener" title="Open full site" aria-label="Open the ${w.name} site in a new tab">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 2.5h4.5V7"/><path d="M13.5 2.5 7.5 8.5"/><path d="M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"/></svg></a>`;
  }
  media(w, badge = true) {
    const s = this.src;
    return `<div class="cc-media">
      <img class="cc-cover" src="${s(w.imgs[0], 1400)}" alt="" loading="lazy" draggable="false">
      ${w.video ? `<video src="${w.video}" muted loop playsinline preload="none"></video>` : `<img class="cc-page" src="${s(w.imgs[1], 1200)}" alt="" loading="lazy" draggable="false">`}
      ${badge ? `<span class="cc-badge">${this.TOUCH ? 'Tap to open' : 'Hover to play'}</span>` : ''}
    </div>`;
  }
  cardHTML(w, i) {
    if (this.rail) return `<article class="cc-card" data-i="${i}" aria-label="${w.name}">${this.media(w, false)}</article>`;
    return `<article class="cc-card" data-i="${i}">${this.media(w)}
      <div class="cc-cap"><span class="cc-mono">${pad(i + 1)}</span><div><h3>${w.name}</h3><p>${w.summary}</p></div>
        <div class="cc-tail">${this.chips(w)}${this.visit(w)}</div></div></article>`;
  }
  caseHTML(w, i) {
    const s = this.src, n = this.works.length;
    const tools = w.cats.filter(c => TOOLS.includes(c)), format = w.cats.filter(c => !TOOLS.includes(c));
    const [lede, ...rest] = w.text.split(/(?<=\.)\s+/);           // first sentence leads the panel; the rest is the overview
    const fact = (k, t, d) => `<div class="cc-fact">${icon(k)}<b>${t}</b><span>${d}</span></div>`;
    const win = (inner, cls = '') => `<div class="cc-win ${cls}"><div class="cc-bar"><i></i><i></i><i></i><span>${host(w.link)}</span></div>${inner}</div>`;
    const img = (f, px) => `<img src="${s(f, px)}" alt="" loading="lazy" draggable="false">`;
    const steps = [
      ['Overview', `<p>${rest.join(' ') || w.text}</p>`],
      ['Details', '<p>A closer look at the layout, type and imagery.</p>'],
      ['Close-up', '<p>A tighter crop of one section of the site.</p>'],
      ['Built with', `${this.chips(w)}<p><a class="cc-link" href="${w.link}" target="_blank" rel="noopener">${host(w.link)} ↗</a></p>`],
    ];
    return `<div class="cc-in">
      <div class="cc-top"><span class="cc-label"><i></i>Case study · ${pad(i + 1)} / ${pad(n)}</span>
        <button class="cc-close" aria-label="Close case study">×</button></div>
      <header class="cc-head">
        <h2>${w.summary}</h2>
        <div class="cc-facts">
          ${fact('tools', 'Built with', tools.join(', ') || '—')}
          ${fact('format', 'Format', format.join(', ') || '—')}
          ${fact('live', 'Live site', `<a href="${w.link}" target="_blank" rel="noopener">${host(w.link)} ↗</a>`)}
        </div>
      </header>
      <section class="cc-panel">
        <div class="cc-left">
          <h3>${icon('panel')}${w.name}</h3>
          <p class="cc-lede">${lede}</p>
          <a class="cc-btn" href="${w.link}" target="_blank" rel="noopener">Visit the site ↗</a>
          <div class="cc-steps">${steps.map(([t, body], k) => `<div class="cc-step" data-s="${k}"><b>${t}</b><div class="cc-sbody">${body}</div></div>`).join('')}</div>
        </div>
        <div class="cc-right">
          <div class="cc-bd" style="background-image:url('${s(w.imgs[0], 1200)}')"></div>
          <div class="cc-shot" data-s="0"><div class="cc-hero">${win(this.media(w, false))}</div></div>
          <div class="cc-shot" data-s="1">${win(img(w.imgs[2], 1400))}</div>
          <div class="cc-shot" data-s="2">${win(img(w.imgs[3], 800), 'tall')}</div>
          <div class="cc-shot full" data-s="3">${img(w.imgs[0], 1800)}</div>
          <nav class="cc-nav" aria-label="Projects">
            <button data-go="-1" aria-label="Previous project">←</button><span>${pad(i + 1)} / ${pad(n)}</span><button data-go="1" aria-label="Next project">→</button>
          </nav>
        </div>
      </section>
    </div>`;
  }

  /** the left column's section nearest the middle of the screen drives the pinned visual on the right */
  syncSteps(force = false) {
    const steps = [...this.caseEl.querySelectorAll('.cc-step')]; if (!steps.length) return;
    const left = this.caseEl.querySelector('.cc-left');
    const sc = left.scrollHeight > left.clientHeight + 1 ? left : this.caseEl;   // phone layout scrolls the page instead
    const box = sc.getBoundingClientRect(), mid = box.top + box.height * .55;
    let a = 0;
    steps.forEach((st, k) => {
      const r = st.getBoundingClientRect();
      if (r.top <= mid) a = k;
      st.style.setProperty('--p', Math.max(0, Math.min(1, (mid - r.top) / r.height)).toFixed(3));   // progress line
    });
    if (a === this.activeStep && !force) return;
    this.activeStep = a;
    steps.forEach((st, k) => st.classList.toggle('on', k === a));
    this.caseEl.querySelectorAll('.cc-shot').forEach(x => x.classList.toggle('on', +x.dataset.s === a));
    const hero = this.caseEl.querySelector('.cc-hero');
    if (a === 0) this.play(hero); else this.stop(hero);
  }

  /* ── playback: video plays; the screenshot stand-in scrolls down the page and back while active ── */
  play(el) {
    if (el.classList.contains('playing')) return;
    el.classList.add('playing');
    const v = el.querySelector('video');
    if (v) { v.play().catch(() => {}); return; }
    const pg = el.querySelector('.cc-page'), box = el.querySelector('.cc-media');
    if (!pg || this.RM) return;
    let down = true;
    const leg = () => {
      if (!el.classList.contains('playing')) return;
      const dist = Math.max(0, pg.offsetHeight - box.clientHeight);
      if (!dist) { el._t = setTimeout(leg, 300); return; }           // image not loaded yet
      const secs = Math.max(2.5, dist / 140);                         // ~140 px/s reads like a calm screen recording
      pg.style.transition = `transform ${secs}s cubic-bezier(.45,0,.55,1), opacity .45s ease`;
      pg.style.transform = `translateY(${down ? -dist : 0}px)`;
      down = !down;
      el._t = setTimeout(leg, secs * 1000 + 700);
    };
    el._t = setTimeout(leg, 250);
  }
  stop(el) {
    if (!el) return;
    el.classList.remove('playing'); clearTimeout(el._t);
    const v = el.querySelector('video'); if (v) { v.pause(); return; }
    const pg = el.querySelector('.cc-page');
    if (pg) { pg.style.transition = 'transform .9s cubic-bezier(.2,.7,0,1), opacity .45s ease'; pg.style.transform = 'translateY(0)'; }
  }

  /* ── position ── */
  nearIndex() {
    if (this.rail) return Math.max(0, this.nearK);
    const mid = this.pos + this.track.clientWidth / 2;
    let best = 0, bd = Infinity;
    this.cards.forEach((c, k) => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = k; } });
    return best;
  }
  markNear() {
    if (this.rail) return this.render();
    const k = this.nearIndex();
    this.cards.forEach((c, j) => {
      c.classList.toggle('near', j === k);
      if (this.TOUCH && j !== k && c.classList.contains('playing')) this.stop(c);
    });
    if (this.TOUCH && !this.RM && !this.isOpen) this.play(this.cards[k]);
  }
  centreOn(k, smooth = false) {
    k = ((k % this.cards.length) + this.cards.length) % this.cards.length;
    if (this.rail) {
      this.target = this.cur + this.dist(k);                      // shortest way round
      if (!smooth || this.RM) { this.cur = this.target; this.render(); } else this.kick();
      return;
    }
    const c = this.cards[k];
    this.track.scrollTo({left: c.offsetLeft + c.offsetWidth / 2 - this.track.clientWidth / 2, behavior: smooth && !this.RM ? 'smooth' : 'auto'});
    this.markNear();
  }
  step(dir) {
    if (this.rail) { this.snapTarget(); this.target += dir * this.pitch; return this.kick(); }
    this.rest(4000); this.stopDrift(); this.centreOn(this.nearIndex() + dir, true);
  }
  stopDrift() { if (this.drifting) { this.drifting = false; this.track.classList.remove('drifting'); } }
  /** scroll to the nearest copy of project p (e.g. hovering its title in the works list) */
  focus(p) {
    this.rest(4000); this.stopDrift();
    if (this.rail) {
      let best = -1; this.cards.forEach((c, k) => { if (+c.dataset.i === p && (best < 0 || Math.abs(this.dist(k)) < Math.abs(this.dist(best)))) best = k; });
      return best >= 0 && this.centreOn(best, true);
    }
    const cur = this.nearIndex();
    let best = -1; this.cards.forEach((c, k) => { if (+c.dataset.i === p && (best < 0 || Math.abs(k - cur) < Math.abs(best - cur))) best = k; });
    if (best >= 0) this.centreOn(best, true);
  }
  wheel(e) {
    e.preventDefault();
    let d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (this.rail) {
      d *= e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.vh : 1;   // lines / pages → px
      this.target += d; this.kick(); this.settleSoon();
      return;
    }
    this.rest(3000); this.stopDrift();
    this.pos += d;
  }

  bindInput() {
    const t = this.track;
    let raf = 0, x0 = 0, s0 = 0, lastY = 0, lastT = 0, vel = 0;
    t.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => this.markNear()); }, {passive: true});
    t.addEventListener('pointerdown', e => {
      if (e.target.closest('.cc-visit')) return;
      if (!this.rail && e.pointerType !== 'mouse') return;          // carousel: touch scrolls natively
      this.stopDrift(); clearTimeout(this.settleT);
      this.dragging = true; this.moved = 0; t.classList.add('drag');
      if (this.rail) { x0 = lastY = e.clientY; lastT = e.timeStamp; vel = 0; s0 = this.target = this.cur; }
      else { x0 = e.clientX; s0 = this.pos; }
    });
    addEventListener('pointermove', e => {
      if (!this.dragging) return;
      if (this.rail) {
        const d = e.clientY - x0;
        this.moved = Math.max(this.moved, Math.abs(d));
        const dtm = e.timeStamp - lastT; if (dtm > 0) vel = .8 * ((lastY - e.clientY) / dtm) + .2 * vel;   // px/ms, smoothed
        lastY = e.clientY; lastT = e.timeStamp;
        this.target = this.cur = s0 - d; this.render();              // 1:1 under the finger / cursor
        return;
      }
      const d = e.clientX - x0;
      this.moved = Math.max(this.moved, Math.abs(d)); this.pos = s0 - d;
    });
    addEventListener('pointerup', e => {
      if (!this.dragging) return;
      this.dragging = false; t.classList.remove('drag');
      if (this.rail) {
        if (e.timeStamp - lastT > 80) vel = 0;                      // held still before letting go: no fling
        this.target += vel * 220; this.snapTarget(); this.kick();
        return;
      }
      this.rest(3000); this.centreOn(this.nearIndex(), true);
    });
    new ResizeObserver(() => {
      if (this.rail) { this.measure(); this.render(); } else this.centreOn(this.nearIndex());
    }).observe(t);
  }

  /* ── Expand: the case study grows out of the card's rectangle (clip-path), content rises in after ── */
  clipTo(card) {
    const r = card.getBoundingClientRect(), h = this.overlayHost.getBoundingClientRect(), st = this.caseEl.style;
    st.setProperty('--ct', r.top - h.top + 'px'); st.setProperty('--cl', r.left - h.left + 'px');
    st.setProperty('--cr', h.right - r.right + 'px'); st.setProperty('--cb', h.bottom - r.bottom + 'px');
  }
  open(i, card) {
    clearTimeout(this._close);
    card = card || this.cards.find(c => +c.dataset.i === i && c.classList.contains('near')) || this.cards.find(c => +c.dataset.i === i);
    this.cards.forEach(c => this.stop(c));
    this.openCard = card;
    this.caseEl.innerHTML = this.caseHTML(this.works[i], i); this.openIndex = i;
    this.caseEl.classList.remove('ready');
    if (card) this.clipTo(card); else this.caseEl.style.removeProperty('--ct');
    this.caseEl.scrollTop = 0;
    this.caseEl.classList.add('on');
    void this.caseEl.offsetWidth;                                  // commit the start state so the transition runs
    requestAnimationFrame(() => {
      this.caseEl.classList.add('ready');
      this.activeStep = -1; this.syncSteps(true);
      this.caseEl.querySelector('.cc-close').focus({preventScroll: true});
    });
    this.onOpen(i);
  }
  close() {
    if (!this.isOpen) return;
    if (this.openCard?.isConnected) this.clipTo(this.openCard);   // shrink back onto the card
    this.caseEl.classList.remove('ready');
    this.stop(this.caseEl.querySelector('.cc-hero'));
    this._close = setTimeout(() => { this.caseEl.classList.remove('on'); this.caseEl.innerHTML = ''; }, 750);
    this.onClose();
  }
  /** previous / next project while a case is open */
  shift(dir) { if (this.isOpen) this.swapTo(((this.openIndex + dir) % this.works.length + this.works.length) % this.works.length); }
  swapTo(i) {                                                      // "Next project" — swap content in place
    const inEl = this.caseEl.querySelector('.cc-in'); if (inEl) inEl.style.opacity = '0';
    setTimeout(() => {
      this.stop(this.caseEl.querySelector('.cc-hero'));
      this.caseEl.innerHTML = this.caseHTML(this.works[i], i); this.caseEl.scrollTop = 0; this.openIndex = i;
      this.activeStep = -1; this.syncSteps(true);
      this.openCard = this.cards.find(c => +c.dataset.i === i && c.classList.contains('near')) || this.openCard;
      this.focus(i);                                               // keep the carousel behind in step
    }, 300);
  }
}
