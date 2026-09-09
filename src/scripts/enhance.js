// Intro/budget/CSP live at the emit point (Base.astro) — comments ship here.

const q = (m) => matchMedia(m).matches;
const still = q('(prefers-reduced-motion:reduce)');

// Chart pager. The arrows are links that already work without this; here
// they become one-screenful steps and learn when they have run out of row.
for (const box of document.querySelectorAll('.chart-cards')) {
  const btns = box.parentElement.querySelectorAll('[data-scroll]');
  if (!btns.length) continue;
  const sync = () => {
    const end = box.scrollWidth - box.clientWidth - 1;
    for (const b of btns) {
      const atEnd = b.dataset.scroll < 0 ? box.scrollLeft <= 0 : box.scrollLeft >= end;
      b.setAttribute('aria-disabled', atEnd);
    }
  };
  for (const b of btns)
    b.addEventListener('click', (e) => {
      e.preventDefault();
      box.scrollBy({ left: box.clientWidth * 0.8 * b.dataset.scroll, behavior: still ? 'auto' : 'smooth' });
    });
  box.addEventListener('scroll', sync, { passive: true });
  addEventListener('resize', sync, { passive: true });
  sync();
}

// Pointer tracking: --px/--py on :root, read by the cover zoom.
if (q('(hover:hover) and (pointer:fine)') && !still) {
  const s = document.documentElement.style;
  let f = null, b = null, x = 0, y = 0, r = 0;
  const clamp = (v) => (v < -0.5 ? -0.5 : v > 0.5 ? 0.5 : v);
  const write = () => {
    r = 0;
    s.setProperty('--px', x), s.setProperty('--py', y);
  };
  addEventListener('pointerover', (e) => {
    const n = e.target.closest ? e.target.closest('.cover-frame,.card-link') : null;
    if (n === f) return;
    if (!n) s.removeProperty('--px'), s.removeProperty('--py');
    b = (f = n) && n.getBoundingClientRect();
  }, { passive: true });
  addEventListener('pointermove', (e) => {
    if (!f) return;
    x = clamp((e.clientX - b.left) / b.width - 0.5);
    y = clamp((e.clientY - b.top) / b.height - 0.5);
    if (!r) r = requestAnimationFrame(write);
  }, { passive: true });
}

// Archive search + chips — one filter: type, click a chip, or land on ?q=.
const si = document.getElementById('archive-q');
if (si) {
  const rows = document.querySelectorAll('#archive-list [data-s]');
  const out = document.getElementById('archive-n');
  const chips = document.querySelectorAll('[data-axis-value]');
  const run = () => {
    const v = si.value.trim().toLowerCase();
    let n = 0;
    for (const row of rows) {
      const hit = !v || row.dataset.s.includes(v);
      row.hidden = !hit;
      n += hit;
    }
    out.hidden = !v;
    if (v) out.textContent = n ? `${n}개` : '일치하는 글이 없습니다.';
    for (const c of chips) c.setAttribute('aria-pressed', `${c.dataset.axisValue.toLowerCase() === v}`);
  };
  si.addEventListener('input', run);
  for (const c of chips)
    c.addEventListener('click', () => {
      si.value = c.getAttribute('aria-pressed') === 'true' ? '' : c.dataset.axisValue;
      run();
    });
  const p = new URLSearchParams(location.search).get('q');
  if (p) { si.value = p; run(); }
}
