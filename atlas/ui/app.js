'use strict';
/* =================== Atlas — front-end =================== */
const TA = window.__TAURI__;
const invoke = (cmd, args) => TA.core.invoke(cmd, args);
const fileSrc = p => TA.core.convertFileSrc(p);
const appWin = TA.window.getCurrentWindow();

const S = {
  steam: [], steamFound: false, config: null, stats: {}, running: {}, dataDir: '',
  view: 'home', sel: null, coll: null,
  filter: 'all', q: '', sort: 'name', ready: false, closed: {},
};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const frag = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LOC = 'en-US';

/* ---------- icons ---------- */
const svg = (d, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 16 16">${d}</svg>`;
const I = {
  play: svg('<path d="M4.5 2.6v10.8L13.2 8z"/>', 'fill'),
  download: svg('<path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10"/>'),
  gear: svg('<circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7L3.6 3.6"/>'),
  info: svg('<circle cx="8" cy="8" r="6"/><path d="M8 7.2v4M8 4.8v.1"/>'),
  heart: svg('<path d="M8 13.5S2.5 10.2 2.5 6.2A2.9 2.9 0 0 1 8 4.6a2.9 2.9 0 0 1 5.5 1.6c0 4-5.5 7.3-5.5 7.3z"/>'),
  folder: svg('<path d="M2 4.5A1 1 0 0 1 3 3.5h3.2l1.3 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/>'),
  plus: svg('<path d="M8 3v10M3 8h10"/>'),
  check: svg('<path d="M3 8.5l3.2 3L13 4.5"/>'),
  right: svg('<path d="M6 3.5L10.5 8 6 12.5"/>'),
  down: svg('<path d="M4 6l4 4 4-4"/>'),
  clock: svg('<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/>'),
  disk: svg('<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 9.5h12M11 11.3h.1"/>'),
  cal: svg('<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>'),
  store: svg('<path d="M2.5 6l1-3h9l1 3M2.5 6v7h11V6M2.5 6c0 1.2 1 2 2 2s2-.8 2-2c0 1.2 1 2 1.5 2s1.5-.8 1.5-2c0 1.2 1 2 2 2s2-.8 2-2"/>'),
  edit: svg('<path d="M10.5 2.8l2.7 2.7L6 12.7l-3.3.6.6-3.3z"/>'),
  trash: svg('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9"/>'),
  eyeoff: svg('<path d="M2 2l12 12M6.6 6.6a2 2 0 0 0 2.8 2.8M4.2 4.4C2.9 5.3 2 6.6 1.6 8c.9 2.9 3.4 5 6.4 5 1.3 0 2.5-.4 3.6-1M7 3.1c.3 0 .7-.1 1-.1 3 0 5.5 2.1 6.4 5-.3.9-.7 1.7-1.3 2.4"/>'),
  eye: svg('<path d="M1.6 8C2.5 5.1 5 3 8 3s5.5 2.1 6.4 5c-.9 2.9-3.4 5-6.4 5S2.5 10.9 1.6 8z"/><circle cx="8" cy="8" r="2"/>'),
  user: svg('<circle cx="8" cy="5.5" r="2.8"/><path d="M2.8 14c.6-2.7 2.7-4.3 5.2-4.3s4.6 1.6 5.2 4.3"/>'),
  camera: svg('<path d="M2 5.5h2.5L6 3.5h4l1.5 2H14v7.5H2z"/><circle cx="8" cy="9" r="2.3"/>'),
  image: svg('<rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="6" cy="6.5" r="1.2"/><path d="M2.5 11.5l3.5-3 2.5 2 2-1.5 3 2.5"/>'),
  scan: svg('<path d="M2 5V3a1 1 0 0 1 1-1h2M11 2h2a1 1 0 0 1 1 1v2M14 11v2a1 1 0 0 1-1 1h-2M5 14H3a1 1 0 0 1-1-1v-2M4.5 8h7"/>'),
  refresh: svg('<path d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5v3h-3"/>'),
  coll: svg('<rect x="2" y="2.5" width="12" height="4" rx="1"/><path d="M3 6.5v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-6M6.5 9h3"/>'),
  x: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
  power: svg('<path d="M8 2v5.5M4.6 4.2a5 5 0 1 0 6.8 0"/>'),
  minus: svg('<path d="M3 8h10"/>'),
  window: svg('<rect x="2.5" y="3.5" width="11" height="9" rx="1"/><path d="M2.5 6h11"/>'),
  arrowR: svg('<path d="M3 8h10M9 4l4 4-4 4"/>'),
  arrowL: svg('<path d="M13 8H3M7 4L3 8l4 4"/>'),
};

/* ---------- formatting ---------- */
const DAY = 864e5;
const plural = (n, one, many) => `${n.toLocaleString(LOC)} ${n === 1 ? one : many}`;
function fmtPlay(min) {
  min = +min || 0;
  if (min <= 0) return 'Never';
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  const h = min / 60;
  return `${h < 10 ? h.toFixed(1) : Math.round(h).toLocaleString(LOC)} hours`;
}
function fmtDate(ms, long) {
  if (!ms) return '—';
  const d = new Date(+ms), now = new Date();
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / DAY);
  if (!long) {
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
  }
  return d.toLocaleDateString(LOC, { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() && !long ? undefined : 'numeric' });
}
function bucket(ms) {
  const days = Math.floor((new Date(new Date().toDateString()) - new Date(new Date(+ms).toDateString())) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  if (days < 31) return 'This month';
  return 'Earlier';
}
function fmtSize(b) {
  if (!b) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(i >= 3 ? 1 : 0)} ${u[i]}`;
}
const dirOf = p => (p || '').replace(/[\\/][^\\/]*$/, '');
function countUp(el, to, ms = 1100, fmt = n => Math.round(n).toLocaleString(LOC)) {
  const t0 = performance.now();
  const tick = t => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 4);
    el.textContent = fmt(to * e);
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------- data ---------- */
function ensureConfig(c) {
  c = c || {};
  c.games ??= []; c.meta ??= {}; c.collections ??= []; c.archive ??= [];
  c.settings = Object.assign({ onLaunch: 'close', showUninstalled: true }, c.settings || {});
  return c;
}
let saveT;
function save(now) {
  clearTimeout(saveT);
  if (S.uninstalling) return Promise.resolve(); // never recreate data while uninstalling
  const run = () => invoke('save_config', { config: S.config }).catch(e => toast('Could not save: ' + e, true));
  if (now) return run();
  saveT = setTimeout(run, 400);
}
const meta = key => (S.config.meta[key] ??= {});

function allGames() {
  const out = [];
  const M = S.config.meta;
  for (const s of S.steam) {
    const key = 's' + s.appId, m = M[key] || {}, st = S.stats[key] || {};
    out.push({
      key, kind: 'steam', appId: s.appId, name: s.name, installed: s.installed, dir: s.installDir,
      size: s.sizeOnDisk || 0, playtime: s.playtimeMin || 0,
      lastPlayed: Math.max(s.lastPlayed || 0, st.lastPlayed || 0), firstPlayed: st.firstPlayed || 0,
      launches: st.launches || 0, longest: 0, assets: s.assets || {}, iconUrl: s.iconUrl, logoPos: s.logoPos || m.art?.logoPos || null,
      fav: !!m.fav, hidden: !!m.hidden, notes: m.notes || '', cover: m.cover || null, addedAt: m.addedAt || 0, art: m.art || null,
      args: m.launchArgs || '',
    });
  }
  for (const g of S.config.games) {
    const m = M[g.id] || {}, st = S.stats[g.id] || {};
    out.push({
      key: g.id, kind: 'local', appId: g.storeAppId || null, name: g.name, installed: true, exe: g.exe, args: g.args || '',
      dir: dirOf(g.exe), size: m.size || 0, playtime: st.minutes || 0, lastPlayed: st.lastPlayed || 0,
      firstPlayed: st.firstPlayed || 0, launches: st.launches || 0, longest: st.longest || 0, assets: {}, iconUrl: null,
      logoPos: m.art?.logoPos || null, art: m.art || null,
      fav: !!m.fav, hidden: !!m.hidden, notes: m.notes || '', cover: g.cover || null, addedAt: g.addedAt || 0, raw: g,
    });
  }
  return out;
}
let GAMES = [];
const byKey = k => GAMES.find(g => g.key === k);
const isRunning = g => !!S.running[g.key];

const SORTS = {
  name: ['Alphabetical', (a, b) => a.name.localeCompare(b.name, LOC, { sensitivity: 'base' })],
  recent: ['Recently played', (a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || SORTS.name[1](a, b)],
  playtime: ['Hours played', (a, b) => b.playtime - a.playtime || SORTS.name[1](a, b)],
  added: ['Recently added', (a, b) => (b.addedAt || 0) - (a.addedAt || 0) || SORTS.name[1](a, b)],
  size: ['Size on disk', (a, b) => (b.size || 0) - (a.size || 0) || SORTS.name[1](a, b)],
};
const FILTERS = { all: 'All games', installed: 'Installed', steam: 'Steam', local: 'Non-Steam', fav: 'Favorites', hidden: 'Hidden' };

function visible(list = GAMES) {
  const q = S.q.trim().toLowerCase();
  return list.filter(g => {
    if (S.filter === 'hidden') { if (!g.hidden) return false; } else if (g.hidden) return false;
    if (!S.config.settings.showUninstalled && !g.installed && S.filter !== 'hidden') return false;
    if (S.ready && !g.installed) return false;
    if (S.filter === 'installed' && !g.installed) return false;
    if (S.filter === 'steam' && g.kind !== 'steam') return false;
    if (S.filter === 'local' && g.kind !== 'local') return false;
    if (S.filter === 'fav' && !g.fav) return false;
    return !q || g.name.toLowerCase().includes(q);
  }).sort(SORTS[S.sort][1]);
}

/* ---------- images ---------- */
const CDN = ['https://cdn.cloudflare.steamstatic.com/steam/apps/', 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/'];
const src = p => /^(https?:|data:)/i.test(p) ? p : fileSrc(p);
const cdn = (id, f) => id ? CDN.map(c => `${c}${id}/${f}`) : [];
const L = {
  cover: g => [g.cover && src(g.cover), g.assets?.cover && src(g.assets.cover), ...cdn(g.appId, 'library_600x900.jpg')].filter(Boolean),
  hero: g => [g.assets?.hero && src(g.assets.hero), ...cdn(g.appId, 'library_hero.jpg')].filter(Boolean),
  logo: g => [g.assets?.logo && src(g.assets.logo), ...cdn(g.appId, 'logo.png')].filter(Boolean),
  header: g => [g.assets?.header && src(g.assets.header), ...cdn(g.appId, 'header.jpg')].filter(Boolean),
  icon: g => [g.assets?.icon && src(g.assets.icon), g.iconUrl].filter(Boolean),
};
const failed = new Set();
function hue(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
function ph(g, text = g.name) {
  const d = document.createElement('div'); d.className = 'ph';
  const h = hue(g.name);
  d.style.background = `linear-gradient(160deg,hsl(${h},42%,34%),hsl(${(h + 40) % 360},48%,16%))`;
  d.textContent = text; return d;
}
/** <img> that walks through a list of sources, then calls fallback(). */
/** Real logos are wide; a portrait/square "logo" is box art and would look wrong on the banner. */
const isLogo = im => im.naturalWidth >= im.naturalHeight * 1.2;
function img(list, fallback, cls = '', check) {
  list = list.filter(u => u && !failed.has(u));
  if (!list.length) return fallback();
  const im = new Image(); let i = 0;
  im.className = 'fade ' + cls; im.alt = ''; im.decoding = 'async'; im.draggable = false;
  im.loading = 'lazy'; // only images that are (nearly) on screen get loaded and decoded
  im.onload = () => { if (check && !check(im)) return im.onerror(); im.classList.add('in'); };
  im.onerror = () => {
    failed.add(list[i]); i++;
    if (i < list.length) im.src = list[i];
    else { const f = fallback(); if (f) im.replaceWith(f); else im.remove(); }
  };
  im.src = list[0];
  if (im.complete && im.naturalWidth && (!check || check(im))) im.classList.add('in'); // cached: no flicker
  return im;
}
/** Capsule fallback: header art + name, like Steam does for games without a capsule. */
function capFallback(g) {
  const d = ph(g, '');
  const hl = L.header(g);
  if (hl.length) {
    const im = img(hl, () => null);
    if (im) { im.style.cssText = 'position:absolute;left:0;right:0;top:28%;width:100%;height:auto'; d.appendChild(im); }
  }
  const t = document.createElement('div'); t.textContent = g.name;
  t.style.cssText = 'position:absolute;left:10px;right:10px;bottom:14%;font-size:15px';
  d.appendChild(t); return d;
}
const coverEl = g => img(L.cover(g), () => capFallback(g));
const iconEl = g => img([...L.icon(g), ...L.cover(g)], () => ph(g, g.name.slice(0, 1).toUpperCase()));
function avatarEl(size, p = S.config.profile || {}) {
  if (p.avatar) { const im = new Image(); im.className = 'avatar'; im.src = fileSrc(p.avatar); im.style.width = im.style.height = size + 'px'; return im; }
  const d = document.createElement('div'); d.className = 'avatar'; d.style.width = d.style.height = size + 'px';
  d.textContent = (p.name || '?').trim().slice(0, 1).toUpperCase(); return d;
}

/* ---------- toasts / overlays ---------- */
function toast(msg, err) {
  const t = frag(`<div class="toast ${err ? 'err' : ''}"></div>`); t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, err ? 5200 : 3200);
}
function busy(text) {
  const b = frag(`<div class="busy"><div class="spinner"></div><div>${esc(text)}</div></div>`);
  document.body.appendChild(b); return () => b.remove();
}
function modal({ title, sub, body, foot, cls = '', onClose }) {
  closeMenu();
  const ov = frag(`<div class="overlay"><div class="modal ${cls}"><header><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</header><div class="body"></div><footer></footer></div></div>`);
  const m = ov.querySelector('.modal');
  if (typeof body === 'string') m.querySelector('.body').innerHTML = body; else if (body) m.querySelector('.body').appendChild(body);
  if (!body) m.querySelector('.body').remove();
  const f = m.querySelector('footer');
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    ov.classList.add('out'); document.removeEventListener('keydown', onKey, true);
    setTimeout(() => ov.remove(), 180); onClose && onClose();
  };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  (foot || []).forEach(b => {
    const el = frag(`<button class="btn ${b.cls || ''}">${esc(b.label)}</button>`);
    el.onclick = () => (b.onClick ? b.onClick(close) : close());
    f.appendChild(el);
  });
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  document.body.appendChild(ov);
  return { el: m, close };
}
function confirmDlg(title, text, ok = 'Confirm', danger) {
  return new Promise(res => {
    modal({
      title, sub: text, cls: 'sm', onClose: () => res(false), foot: [
        { label: 'Cancel', cls: 'ghost' },
        { label: ok, cls: danger ? 'danger' : 'primary', onClick: c => { res(true); c(); } },
      ],
    });
  });
}
function promptDlg(title, label, value = '', ok = 'Save') {
  return new Promise(res => {
    const body = frag(`<div class="field"><label>${esc(label)}</label><input class="inp" maxlength="40"></div>`);
    const inp = body.querySelector('input'); inp.value = value;
    const submit = c => { const v = inp.value.trim(); if (!v) { inp.focus(); return; } res(v); c(); };
    const m = modal({ title, body, cls: 'sm', onClose: () => res(null), foot: [{ label: 'Cancel', cls: 'ghost' }, { label: ok, cls: 'primary', onClick: submit }] });
    inp.onkeydown = e => { if (e.key === 'Enter') submit(m.close); };
    setTimeout(() => { inp.focus(); inp.select(); }, 60);
  });
}

/* ---------- menus ---------- */
let openMenuEl = null;
function closeMenu() { if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; } }
function buildMenu(items) {
  const m = document.createElement('div'); m.className = 'menu';
  for (const it of items) {
    if (!it) continue;
    if (it.sep) { m.appendChild(frag('<div class="sep"></div>')); continue; }
    if (it.sub) {
      const mi = frag(`<div class="mi">${it.icon || '<span class="chk"></span>'}<span>${esc(it.label)}</span><span class="arrow">${I.right}</span><div class="sub"></div></div>`);
      mi.querySelector('.sub').appendChild(buildMenu(it.sub));
      m.appendChild(mi); continue;
    }
    const b = frag(`<button class="${it.disabled ? 'dis' : ''}">${it.check !== undefined ? `<span class="chk">${it.check ? I.check : ''}</span>` : (it.icon || '<span class="chk"></span>')}<span>${esc(it.label)}</span></button>`);
    b.onclick = e => { e.stopPropagation(); closeMenu(); it.action && it.action(); };
    m.appendChild(b);
  }
  return m;
}
function showMenu(x, y, items) {
  closeMenu();
  const m = buildMenu(items); document.body.appendChild(m); openMenuEl = m;
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
}
const menuAt = (el, items) => { const r = el.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, items); };
document.addEventListener('mousedown', e => { if (openMenuEl && !openMenuEl.contains(e.target)) closeMenu(); });
window.addEventListener('blur', closeMenu);

/* ---------- actions ---------- */
async function launch(g, btn) {
  if (!g) return;
  if (isRunning(g)) return toast(`${g.name} is already running.`);
  if (!g.installed) return install(g);
  btn && btn.classList.add('launching');
  try {
    await invoke('launch', { req: {
      id: g.key, name: g.name,
      steamAppId: g.kind === 'steam' ? g.appId : null,
      storeAppId: g.kind === 'local' ? g.appId : null,
      exe: g.exe || null, args: g.args || null,
      art: discordArt(g),
    } });
    const mode = S.config.settings.onLaunch;
    toast(mode === 'close' ? `Launching ${g.name}… Atlas will close to free up resources.` : `Launching ${g.name}…`);
    S.running[g.key] = Date.now(); // until the status poll confirms it
    refresh(); presence();
    setTimeout(refreshStatus, 4000);
  } catch (e) {
    if (g.kind === 'local' && /not found/i.test(String(e)) && !g._retried) {
      // the game was moved: look for it on every drive, then try once more
      const done = busy(`Looking for ${g.name} on your drives…`);
      await checkMoved(); done();
      const ng = allGames().find(x => x.key === g.key);
      if (ng) { ng._retried = true; return launch(ng, btn); }
      return;
    }
    toast(String(e), true);
  }
  finally { setTimeout(() => btn && btn.classList.remove('launching'), 1200); }
}
function install(g) { if (g.kind === 'steam') invoke('steam_action', { action: 'install', appId: g.appId }).catch(e => toast(String(e), true)); }
function steamAct(action, g) { invoke('steam_action', { action, appId: g.appId }).catch(e => toast(String(e), true)); }
function toggleFav(g) { meta(g.key).fav = !g.fav; save(); refresh(); toast(g.fav ? 'Removed from Favorites' : 'Added to Favorites'); }
function toggleHidden(g) { meta(g.key).hidden = !g.hidden; save(); if (!g.hidden && S.sel === g.key) go('home'); else refresh(); toast(g.hidden ? 'Game is visible again' : 'Game hidden. Find it under the “Hidden” filter.'); }
function inColl(c, g) { return c.keys.includes(g.key); }
function toggleColl(c, g) {
  if (inColl(c, g)) c.keys = c.keys.filter(k => k !== g.key); else c.keys.push(g.key);
  save(); refresh();
}
async function newCollection(g) {
  const name = await promptDlg('New collection', 'Collection name', '', 'Create');
  if (!name) return;
  const c = { id: uid(), name, keys: g ? [g.key] : [] };
  S.config.collections.push(c); save(); refresh();
  toast(`Collection “${name}” created.`);
  return c;
}
async function removeGame(g) {
  if (g.kind === 'steam') return toggleHidden(g);
  const ok = await confirmDlg(`Remove “${g.name}” from your library?`, 'Nothing is deleted from your PC. Your hours stay on your profile, and if you add the game back it gets its stats back.', 'Remove from library', true);
  if (!ok) return;
  archiveGame(g.raw);
  save(); if (S.sel === g.key) go('home'); else refresh();
}
/** Takes a non-Steam game out of the library but keeps its stats for the profile. */
function archiveGame(raw) {
  S.config.games = S.config.games.filter(x => x.id !== raw.id);
  S.config.archive.push({ id: raw.id, name: raw.name, exe: raw.exe, storeAppId: raw.storeAppId || null, removedAt: Date.now() });
  S.config.collections.forEach(c => c.keys = c.keys.filter(k => k !== raw.id));
}
/** Non-Steam games whose exe vanished: find them on any drive, or drop them (stats stay on the profile). */
let relocating = null;
function checkMoved() {
  if (relocating) return relocating;
  const list = S.config.games.map(g => ({ id: g.id, exe: g.exe }));
  if (!list.length) return Promise.resolve();
  relocating = invoke('relocate_games', { games: list }).then(res => {
    let changed = false;
    for (const r of res || []) {
      const g = S.config.games.find(x => x.id === r.id); if (!g) continue;
      if (r.status === 'moved') {
        g.exe = r.exe; delete meta(g.id).size; changed = true;
        toast(`${g.name} was moved — Atlas found it in ${dirOf(r.exe)}`);
      } else if (r.status === 'gone') {
        archiveGame(g); changed = true;
        if (S.sel === g.id) S.view = 'home';
        toast(`${g.name} isn't on any drive anymore, so it was removed from your library. Its hours stay on your profile.`);
      } else if (r.status === 'offline') {
        toast(`${g.name} is on a drive that isn't connected right now.`);
      }
    }
    if (changed) { save(); refresh(); }
  }).catch(() => {}).finally(() => { relocating = null; });
  return relocating;
}
const revealGame = g => invoke('reveal', { path: g.kind === 'local' ? g.exe : g.dir }).catch(e => toast(String(e), true));
function gameMenu(g) {
  return [
    g.installed ? { label: isRunning(g) ? 'Running…' : 'Play', icon: I.play, action: () => launch(g), disabled: isRunning(g) }
      : { label: 'Install', icon: I.download, action: () => install(g) },
    { sep: 1 },
    { label: g.fav ? 'Remove from Favorites' : 'Add to Favorites', icon: I.heart, action: () => toggleFav(g) },
    { label: 'Add to collection', icon: I.coll, sub: [
      ...S.config.collections.map(c => ({ label: c.name, check: inColl(c, g), action: () => toggleColl(c, g) })),
      S.config.collections.length ? { sep: 1 } : null,
      { label: 'New collection…', icon: I.plus, action: () => newCollection(g) },
    ] },
    { sep: 1 },
    g.appId ? { label: 'View in Steam Store', icon: I.store, action: () => steamAct('store', g) } : null,
    g.dir && g.installed ? { label: 'Browse local files', icon: I.folder, action: () => revealGame(g) } : null,
    { label: 'Properties…', icon: I.gear, action: () => properties(g) },
    { sep: 1 },
    { label: g.hidden ? 'Unhide game' : 'Hide game', icon: g.hidden ? I.eye : I.eyeoff, action: () => toggleHidden(g) },
    g.kind === 'steam' && g.installed ? { label: 'Uninstall (via Steam)…', icon: I.trash, action: () => steamAct('uninstall', g) } : null,
    g.kind === 'local' ? { label: 'Remove from library', icon: I.trash, action: () => removeGame(g) } : null,
  ];
}

/* ---------- auto-update ---------- */
let pendingUpdate = null, onUpdateProgress = null;
TA.event.listen('update-progress', e => onUpdateProgress && onUpdateProgress(e.payload)).catch(() => {});
const mb = b => `${(b / 1048576).toFixed(1)} MB`;

function ensureUpdatePill() {
  if (!pendingUpdate || document.querySelector('.upd')) return;
  const pill = frag(`<button class="upd" title="Atlas ${esc(pendingUpdate.version)} is available">${I.download}<span>Update available</span></button>`);
  pill.onclick = () => settings('updates');
  $('#meBtn').before(pill);
}
/** Startup check (only when automatic updates are on). */
async function checkForUpdate() {
  if (S.config?.settings?.autoUpdate === false) return;
  try { pendingUpdate = await invoke('check_update'); } catch { return; }
  ensureUpdatePill();
}
/** The card shown in Settings > Updates when a newer version exists. */
function updateCard(box, u) {
  box.innerHTML = '';
  const c = frag(`<div class="ucard">
    <div class="uhead"><img src="logo.png" alt=""><div class="ut"><b>Atlas ${esc(u.version)}</b><small>${u.date ? `Released ${fmtDate(u.date, true)} · ` : ''}you have ${esc(u.current)}</small></div><button class="stbtn primary" data-a="dl">${I.download} Download and install</button></div>
    ${u.notes ? '<div class="unotes"></div>' : ''}
    <div class="uprog"><div class="ubar"><i></i></div><small>Starting download…</small></div></div>`);
  if (u.notes) c.querySelector('.unotes').textContent = u.notes;
  const btn = c.querySelector('[data-a=dl]'), prog = c.querySelector('.uprog'), bar = c.querySelector('.ubar i'), txt = c.querySelector('.uprog small');
  btn.onclick = async () => {
    btn.style.display = 'none'; c.classList.add('busy');
    onUpdateProgress = p => {
      if (p.installing) { bar.style.width = '100%'; txt.textContent = 'Installing… Atlas restarts on its own in a moment.'; return; }
      const pct = p.total ? Math.min(100, p.done / p.total * 100) : 0;
      bar.style.width = pct.toFixed(1) + '%';
      txt.textContent = p.total ? `Downloading… ${mb(p.done)} of ${mb(p.total)} (${Math.round(pct)}%)` : `Downloading… ${mb(p.done)}`;
    };
    try { await invoke('install_update'); }
    catch (e) { onUpdateProgress = null; c.classList.remove('busy'); btn.style.display = ''; txt.textContent = String(e); toast(String(e), true); }
  };
  box.appendChild(c);
}

/* ---------- Discord: what Atlas shows while it's open ---------- */
/** Small round image for Discord: the game's icon, else its cover (web URLs only). */
function discordArt(g) {
  if (!g) return null;
  const u = [g.iconUrl, g.cover && /^https?:/.test(g.cover) ? g.cover : null, g.appId ? `${CDN[0]}${g.appId}/library_600x900.jpg` : null].find(Boolean);
  return u || null;
}
let presenceSig = '', presenceT;
function presence() {
  clearTimeout(presenceT);
  presenceT = setTimeout(() => {
    let s;
    // a running game's tracker owns Discord while you play
    if (S.config?.settings?.discord === false || Object.keys(S.running || {}).length) s = { details: '', clear: true };
    else if (document.querySelector('.wiz')) s = { details: 'Setting up Atlas' };
    else if (document.querySelector('.spage')) s = { details: 'Tweaking settings' };
    else if (S.view === 'game' && byKey(S.sel)) {
      const g = byKey(S.sel);
      s = { details: `Looking at ${g.name}`, state: g.playtime ? `${fmtPlay(g.playtime)} played` : (g.installed ? 'Ready to play' : 'Not installed yet'), image: discordArt(g), imageText: g.name };
    } else if (S.view === 'profile') {
      const hrs = Math.round(GAMES.reduce((a, g) => a + (g.playtime || 0), 0) / 60);
      s = { details: 'Viewing their profile', state: `${hrs.toLocaleString(LOC)} hours played` };
    } else if (S.view === 'coll') {
      const c = S.config.collections.find(x => x.id === S.coll);
      s = { details: `Browsing “${c?.name || 'a collection'}”`, state: plural(GAMES.filter(g => c && inColl(c, g)).length, 'game', 'games') };
    } else {
      s = { details: 'Browsing the library', state: plural(GAMES.filter(g => !g.hidden).length, 'game', 'games') };
    }
    const sig = JSON.stringify(s);
    if (sig === presenceSig) return;
    presenceSig = sig;
    invoke('discord_status', { s }).catch(() => {});
  }, 500);
}

/* ---------- navigation ---------- */
function go(view, opts = {}) {
  S.view = view;
  if (opts.sel !== undefined) S.sel = opts.sel;
  if (opts.coll !== undefined) S.coll = opts.coll;
  closeMenu();
  render(true);
  $('#scroll').scrollTop = 0;
}
function refresh() { render(false); }

let renderAnim = false;
function render(anim) {
  renderAnim = anim;
  GAMES = allGames();
  document.body.classList.toggle('instant', !anim);
  renderTop(); renderSide(); renderMain(); presence();
  if (!anim) requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('instant')));
}
let topSig = '';
function renderTop() {
  const p = S.config.profile || {};
  const sig = `${p.name}|${p.avatar}`;
  if (sig !== topSig) { // only rebuild when it actually changed (no flicker)
    topSig = sig;
    const me = $('#meBtn'); me.innerHTML = ''; me.appendChild(avatarEl(24));
    me.insertAdjacentHTML('beforeend', `<span>${esc(p.name || 'Profile')}</span>${I.down}`);
  }
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', (b.dataset.v === 'profile') === (S.view === 'profile')));
  $('#homeBtn').classList.toggle('on', S.view === 'home');
  $('#gridBtn').classList.toggle('on', S.view === 'grid');
  $('#filterLbl').textContent = FILTERS[S.filter];
  $('#recentBtn').classList.toggle('on', S.sort === 'recent');
  $('#readyBtn').classList.toggle('on', S.ready);
}

/* ---------- sidebar ---------- */
function sideItem(g) {
  const el = document.createElement('div');
  el.className = `item${g.key === S.sel && S.view === 'game' ? ' sel' : ''}${g.installed ? '' : ' off'}${isRunning(g) ? ' running' : ''}`;
  const ic = document.createElement('div'); ic.className = 'ic'; ic.appendChild(iconEl(g)); el.appendChild(ic);
  el.insertAdjacentHTML('beforeend', `<span class="nm">${esc(g.name)}${isRunning(g) ? ' <span class="tag-run">– Running</span>' : ''}</span>`);
  el.onclick = () => go('game', { sel: g.key });
  el.ondblclick = () => launch(g);
  el.oncontextmenu = e => { e.preventDefault(); showMenu(e.clientX, e.clientY, gameMenu(g)); };
  return el;
}
function group(id, title, list) {
  const g = frag(`<div class="group${S.closed[id] ? ' closed' : ''}"><div class="group-h">${I.down}${esc(title)} <span>(${list.length})</span></div><div class="group-b"><div></div></div></div>`);
  g.querySelector('.group-h').onclick = () => { S.closed[id] = !S.closed[id]; g.classList.toggle('closed'); };
  const box = g.querySelector('.group-b > div');
  const f = document.createDocumentFragment(); list.forEach(x => f.appendChild(sideItem(x))); box.appendChild(f);
  return g;
}
function renderSide() {
  const L2 = $('#list'), st = L2.scrollTop; L2.innerHTML = '';
  const v = visible();
  if (!S.q && S.filter === 'all') {
    const favs = v.filter(g => g.fav);
    if (favs.length) L2.appendChild(group('fav', 'Favorites', favs));
    for (const c of S.config.collections) {
      const items = v.filter(g => inColl(c, g));
      if (items.length) L2.appendChild(group('c' + c.id, c.name, items));
    }
  }
  L2.appendChild(group('all', S.q ? 'Results' : FILTERS[S.filter], v));
  if (!v.length) L2.insertAdjacentHTML('beforeend', `<div style="padding:14px 24px;color:var(--dim)">${S.q ? 'No games found.' : 'Nothing here yet.'}</div>`);
  L2.scrollTop = st;
}

/* ---------- main views ---------- */
function renderMain() {
  const sc = $('#scroll'), top = sc.scrollTop;
  sc.innerHTML = '';
  const view = document.createElement('div'); view.className = 'view' + (renderAnim ? ' enter' : '');
  if (S.view === 'game' && byKey(S.sel)) viewGame(view, byKey(S.sel));
  else if (S.view === 'profile') viewProfile(view);
  else if (S.view === 'coll') viewCollection(view);
  else if (S.view === 'grid') viewGrid(view);
  else { S.view = 'home'; viewHome(view); }
  sc.appendChild(view);
  if (!renderAnim) sc.scrollTop = top;
}
function secHead(title, count, extra = '') {
  return frag(`<div class="sec-h"><h2>${esc(title)}${count !== undefined ? `<span>(${count})</span>` : ''}</h2><div class="rule"></div>${extra}</div>`);
}
function card(g, i = 0, sub) {
  const c = document.createElement('div');
  c.className = `card${g.installed ? '' : ' off'}${S.sel === g.key && S.view === 'game' ? ' sel' : ''}`;
  c.style.setProperty('--i', Math.min(i, 30));
  const cap = document.createElement('div'); cap.className = 'cap'; cap.appendChild(coverEl(g));
  if (isRunning(g)) cap.insertAdjacentHTML('beforeend', '<div class="badge">RUNNING</div>');
  const qp = frag(`<button class="qp ${g.installed ? '' : 'inst'}" title="${g.installed ? 'Play' : 'Install'}">${g.installed ? I.play : I.download}</button>`);
  qp.onclick = e => { e.stopPropagation(); launch(g); };
  cap.appendChild(qp); c.appendChild(cap);
  c.insertAdjacentHTML('beforeend', `<div class="label">${esc(g.name)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}`);
  c.onclick = () => go('game', { sel: g.key });
  c.oncontextmenu = e => { e.preventDefault(); showMenu(e.clientX, e.clientY, gameMenu(g)); };
  return c;
}
function gridSection(title, list) {
  const s = document.createElement('div'); s.className = 'section';
  const h = secHead(title, list.length, `<div class="opt">Sort by <button>${esc(SORTS[S.sort][0])} ${I.down}</button></div>`);
  h.querySelector('.opt button').onclick = e => menuAt(e.currentTarget, sortMenu());
  s.appendChild(h);
  const grid = document.createElement('div'); grid.className = 'grid';
  list.forEach((g, i) => grid.appendChild(card(g, i)));
  if (!list.length) grid.innerHTML = '<div style="color:var(--dim);padding:20px 0">No games to show.</div>';
  s.appendChild(grid); return s;
}
function sortMenu() { return Object.entries(SORTS).map(([k, [lbl]]) => ({ label: lbl, check: S.sort === k, action: () => { S.sort = k; refresh(); } })); }

function viewHome(v) {
  if (!GAMES.length) {
    v.appendChild(frag(`<div class="empty"><img src="logo.png" alt=""><h1>Your library is empty</h1>
      <p>${S.steamFound ? 'No games were found in your Steam account on this PC.' : 'Steam was not found on this PC.'} Add your games to keep them all in one place.</p>
      <div class="row"><button class="btn primary lg" data-a="add">${I.plus} Add a game</button><button class="btn lg" data-a="scan">${I.scan} Scan a folder</button></div></div>`));
    v.querySelector('[data-a=add]').onclick = () => properties();
    v.querySelector('[data-a=scan]').onclick = scanFolder;
    return;
  }
  const recent = GAMES.filter(g => g.lastPlayed && !g.hidden).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 12);
  if (recent.length) {
    const s = document.createElement('div'); s.className = 'section';
    s.appendChild(secHead('Recent games'));
    const shelf = document.createElement('div'); shelf.className = 'shelf';
    let last = '';
    recent.forEach((g, i) => {
      const b = bucket(g.lastPlayed);
      const wrap = document.createElement('div'); wrap.style.flex = 'none';
      wrap.appendChild(frag(`<div class="when">${b !== last ? esc(b) : ''}</div>`)); last = b;
      wrap.appendChild(card(g, i, g.playtime ? fmtPlay(g.playtime) : ''));
      shelf.appendChild(wrap);
    });
    s.appendChild(shelf); v.appendChild(s);
  }
  const s2 = document.createElement('div'); s2.className = 'section';
  s2.appendChild(secHead('Your collections'));
  const cs = document.createElement('div'); cs.className = 'colls';
  const favs = GAMES.filter(g => g.fav && !g.hidden);
  if (favs.length) cs.appendChild(collTile({ id: 'fav', name: 'Favorites' }, favs, 0));
  S.config.collections.forEach((c, i) => cs.appendChild(collTile(c, GAMES.filter(g => inColl(c, g) && !g.hidden), i + 1)));
  const nw = frag(`<div class="coll new">${I.plus}Create a new collection</div>`);
  nw.onclick = () => newCollection(); cs.appendChild(nw);
  s2.appendChild(cs); v.appendChild(s2);
  v.appendChild(gridSection(S.q ? 'Results' : FILTERS[S.filter], visible()));
}
function collTile(c, list, i) {
  const t = document.createElement('div'); t.className = 'coll'; t.style.animationDelay = i * 50 + 'ms';
  const mo = document.createElement('div'); mo.className = 'mosaic';
  list.slice(0, 4).forEach(g => mo.appendChild(img(L.cover(g), () => ph(g, ''))));
  t.appendChild(mo);
  t.insertAdjacentHTML('beforeend', `<div class="shade"></div><div class="t"><b>${esc(c.name)}</b><span>${plural(list.length, 'game', 'games')}</span></div>`);
  t.onclick = () => { if (c.id === 'fav') { S.filter = 'fav'; go('grid'); } else go('coll', { coll: c.id }); };
  if (c.id !== 'fav') t.oncontextmenu = e => { e.preventDefault(); showMenu(e.clientX, e.clientY, collMenu(c)); };
  return t;
}
function collMenu(c) {
  return [
    { label: 'Rename…', icon: I.edit, action: async () => { const n = await promptDlg('Rename collection', 'New name', c.name); if (n) { c.name = n; save(); refresh(); } } },
    { label: 'Delete collection', icon: I.trash, action: async () => {
      if (!await confirmDlg(`Delete “${c.name}”?`, 'The games stay in your library, only the collection goes away.', 'Delete', true)) return;
      S.config.collections = S.config.collections.filter(x => x !== c); save(); go('home');
    } },
  ];
}
function viewGrid(v) { v.appendChild(gridSection(S.q ? 'Results' : FILTERS[S.filter], visible())); }
function viewCollection(v) {
  const c = S.config.collections.find(x => x.id === S.coll);
  if (!c) return viewHome(v);
  const s = gridSection(c.name, visible(GAMES.filter(g => inColl(c, g))));
  const opt = frag(`<button class="btn ghost" style="height:28px">${I.edit} Edit</button>`);
  opt.onclick = e => menuAt(e.currentTarget, collMenu(c));
  s.querySelector('.sec-h').appendChild(opt);
  v.appendChild(s);
}

/* ---------- game page ---------- */
const PIN = { // Steam pinned_position -> CSS placement inside the logo area
  BottomLeft: { left: 0, bottom: 0, pos: 'left bottom' },
  UpperLeft: { left: 0, top: 0, pos: 'left top' },
  CenterCenter: { left: '50%', top: '50%', tx: '-50%', ty: '-50%', pos: 'center center' },
  UpperCenter: { left: '50%', top: 0, tx: '-50%', pos: 'center top' },
  BottomCenter: { left: '50%', bottom: 0, tx: '-50%', pos: 'center bottom' },
};
function placeLogo(box, lp) {
  const p = PIN[lp?.pin] || PIN.BottomLeft;
  const w = lp?.w || 40, h = lp?.h || 55;
  Object.assign(box.style, { width: w + '%', height: h + '%', left: p.left ?? '', top: p.top ?? '', bottom: p.bottom ?? '', translate: `${p.tx || 0} ${p.ty || 0}` });
  return p.pos;
}
function heroEl(g) {
  const hero = document.createElement('div'); hero.className = 'hero';
  const bg = document.createElement('div'); bg.className = 'bg';
  const area = document.createElement('div'); area.className = 'logo-area';
  const logo = document.createElement('div'); logo.className = 'logo';
  const pos = placeLogo(logo, g.logoPos);
  const title = () => { const h = document.createElement('h1'); h.textContent = g.name; logo.style.width = 'auto'; logo.style.height = 'auto'; return h; };
  const addLogo = () => {
    if (logo.firstChild) return;
    const li = img(L.logo(g), title, '', isLogo); if (li.style) li.style.objectPosition = pos;
    logo.appendChild(li);
  };
  // 1) Steam library hero  2) clean in-game screenshot from the store  3) blurred cover
  const blurCover = () => { bg.className = 'bg blur'; addLogo(); return img(L.cover(g), () => ph(g, '')); };
  const shot = () => {
    const shots = g.art?.screenshots || [];
    if (!shots.length) return blurCover();
    bg.className = 'bg shot'; addLogo();
    return img(shots, blurCover);
  };
  const hl = L.hero(g);
  bg.appendChild(hl.length ? img(hl, shot) : shot());
  if (hl.length) addLogo();
  hero.append(bg, area); area.appendChild(logo);
  return hero;
}
async function ensureArt(g) {
  if (!g.appId) return;
  const m = meta(g.key);
  const needs = !m.art || Date.now() - (m.art.at || 0) > 7 * DAY;
  if (!needs) return;
  try {
    const a = await invoke('store_art', { appId: g.appId });
    m.art = { screenshots: a.screenshots || [], logoPos: a.logoPos || null, at: Date.now() };
    save();
    if (S.view === 'game' && S.sel === g.key) {
      const old = document.querySelector('.hero');
      if (old) { GAMES = allGames(); const ng = byKey(g.key); if (ng) old.replaceWith(heroEl(ng)); }
    }
  } catch {}
}
/** Latest news / patch notes from Steam, like the "Activity" section of a Steam game page. */
const NEWS = {};
function newsPanel(g) {
  const sk = '<div class="nitem"><div class="nimg skel"></div><div style="flex:1"><div class="skel" style="height:11px;width:35%;margin:4px 0 10px"></div><div class="skel" style="height:15px;width:75%;margin-bottom:8px"></div><div class="skel" style="height:11px;width:90%"></div></div></div>';
  const p = frag(`<div class="panel news"><h3>News <button class="more">View all ${I.right}</button></h3><div class="nl">${sk.repeat(3)}</div></div>`);
  p.querySelector('.more').onclick = () => invoke('open_url', { url: `https://store.steampowered.com/news/app/${g.appId}` }).catch(e => toast(String(e), true));
  const fill = list => {
    const nl = p.querySelector('.nl'); nl.innerHTML = '';
    if (!list.length) { p.remove(); return; }
    list.slice(0, 4).forEach((n, i) => {
      const it = frag(`<div class="nitem" style="--i:${i}"><div class="nimg"></div><div class="nt"><small></small><b></b><p></p></div></div>`);
      it.querySelector('.nimg').appendChild(img([n.image, ...L.header(g)].filter(Boolean), () => ph(g, '')));
      it.querySelector('small').textContent = `${n.feed || 'News'} · ${fmtDate(n.date, true)}`;
      it.querySelector('b').textContent = n.title;
      it.querySelector('p').textContent = n.snippet;
      it.onclick = () => invoke('open_url', { url: n.url }).catch(e => toast(String(e), true));
      nl.appendChild(it);
    });
  };
  const c = NEWS[g.appId];
  if (c && Date.now() - c.at < 30 * 60e3) fill(c.list);
  else invoke('game_news', { appId: g.appId }).then(list => { NEWS[g.appId] = { list: list || [], at: Date.now() }; fill(list || []); }).catch(() => p.remove());
  return p;
}

function viewGame(v, g) {
  v.appendChild(heroEl(g));
  if (g.kind === 'local' || !g.logoPos) ensureArt(g);

  const run = isRunning(g);
  const bar = document.createElement('div'); bar.className = 'bar';
  const big = frag(run ? `<button class="big running">${I.play} Running</button>`
    : g.installed ? `<button class="big play">${I.play} Play</button>` : `<button class="big install">${I.download} Install</button>`);
  big.onclick = () => launch(g, big);
  bar.appendChild(big);
  const stat = (icon, label, val) => `<div class="stat ic">${icon}<div class="stat"><small>${label}</small><b>${val}</b></div></div>`;
  bar.insertAdjacentHTML('beforeend',
    (g.installed ? stat(I.disk, 'Size on disk', `<span id="sizeVal">${fmtSize(g.size)}</span>`) : '') +
    stat(I.cal, 'Last played', fmtDate(g.lastPlayed)) +
    stat(I.clock, 'Play time', fmtPlay(g.playtime)) + '<div class="spacer"></div>');
  const bGear = frag(`<button class="round" title="Manage">${I.gear}</button>`);
  bGear.onclick = e => menuAt(e.currentTarget, gameMenu(g));
  const bInfo = frag(`<button class="round" title="Properties">${I.info}</button>`);
  bInfo.onclick = () => properties(g);
  const bFav = frag(`<button class="round ${g.fav ? 'on' : ''}" title="Favorite">${I.heart}</button>`);
  bFav.onclick = () => toggleFav(g);
  bar.append(bGear, bInfo, bFav);
  v.appendChild(bar);
  if (g.kind === 'steam' && (S.downloads || []).some(d => d.appId === g.appId)) {
    const gd = frag(`<div class="game-dl" data-key="${g.key}"></div>`); v.appendChild(gd); setTimeout(paintDownloads);
  }

  const links = document.createElement('div'); links.className = 'links';
  const link = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; links.appendChild(b); };
  if (g.appId) {
    link('Store Page', () => steamAct('store', g));
    link('Community Hub', () => steamAct('hub', g));
    link('Discussions', () => steamAct('discussions', g));
    link('Guides', () => steamAct('guides', g));
    if (g.kind === 'steam') link('Achievements', () => steamAct('achievements', g));
  }
  if (g.installed && g.dir) link('Browse local files', () => revealGame(g));
  if (g.kind === 'local' && !g.appId) link('Match with a Steam game…', () => properties(g));
  v.appendChild(links);

  const cols = document.createElement('div'); cols.className = 'cols';
  const left = document.createElement('div');
  if (g.appId) left.appendChild(newsPanel(g));
  const det = frag(`<div class="panel"><h3>Stats</h3><div class="kv"></div></div>`);
  const kv = det.querySelector('.kv');
  const row = (k, val, cls = '') => kv.insertAdjacentHTML('beforeend', `<div><small>${k}</small><b class="${cls}">${val}</b></div>`);
  row('Play time', fmtPlay(g.playtime));
  row('First played', fmtDate(g.firstPlayed, true));
  row('Last played', fmtDate(g.lastPlayed, true));
  if (g.kind === 'local') row('Longest session', fmtPlay(g.longest));
  row('Launched from Atlas', plural(g.launches || 0, 'time', 'times'));
  row('Size on disk', `<span id="sizeVal2">${g.installed ? fmtSize(g.size) : 'Not installed'}</span>`);
  row('Source', g.kind === 'steam' ? 'Steam' : (g.appId ? 'Non-Steam · matched with Steam' : 'Non-Steam'));
  if (g.addedAt) row('Added to Atlas', fmtDate(g.addedAt, true));
  if (g.installed && (g.exe || g.dir)) row('Location', esc(g.exe || g.dir), 'path');
  left.appendChild(det);
  const notes = frag(`<div class="panel"><h3>My notes</h3><textarea class="notes" placeholder="Where you left off, codes, settings — anything you want to remember about this game…"></textarea></div>`);
  const ta = notes.querySelector('textarea'); ta.value = g.notes;
  ta.oninput = () => { meta(g.key).notes = ta.value; save(); };
  left.appendChild(notes);
  cols.appendChild(left);

  const right = document.createElement('div');
  const cp = frag(`<div class="panel"><h3>Collections</h3><div class="chips"></div></div>`);
  const chips = cp.querySelector('.chips');
  const favChip = frag(`<button class="chip ${g.fav ? 'on' : ''}">${I.heart} Favorites</button>`); favChip.onclick = () => toggleFav(g); chips.appendChild(favChip);
  S.config.collections.forEach(c => {
    const ch = frag(`<button class="chip ${inColl(c, g) ? 'on' : ''}">${inColl(c, g) ? I.check : I.plus} ${esc(c.name)}</button>`);
    ch.onclick = () => toggleColl(c, g); chips.appendChild(ch);
  });
  const nc = frag(`<button class="chip">${I.plus} New collection</button>`); nc.onclick = () => newCollection(g); chips.appendChild(nc);
  right.appendChild(cp);
  const hdr = L.header(g);
  if (hdr.length) {
    const art = frag(`<div class="panel" style="padding:0"></div>`);
    const im = img(hdr, () => null);
    if (im) { im.style.cssText = 'width:100%;display:block'; art.appendChild(im); right.appendChild(art); }
  }
  cols.appendChild(right);
  v.appendChild(cols);

  if (g.kind === 'local' && g.installed) {
    const m = meta(g.key);
    if (!m.size || Date.now() - (m.sizeAt || 0) > DAY) {
      invoke('folder_size', { path: g.exe }).then(sz => {
        if (!sz) return;
        m.size = sz; m.sizeAt = Date.now(); save();
        const a = document.getElementById('sizeVal'), b = document.getElementById('sizeVal2');
        if (a) a.textContent = fmtSize(sz); if (b) b.textContent = fmtSize(sz);
      }).catch(() => {});
    }
  }
}

/* ---------- profile ---------- */
function profileData() {
  const libKeys = new Set(GAMES.map(g => g.key));
  const removed = Object.entries(S.stats).filter(([k, st]) => !libKeys.has(k) && (st.minutes > 0 || st.launches > 0)).map(([k, st]) => {
    const a = S.config.archive.find(x => x.id === k);
    return { key: k, name: a?.name || st.name || 'Unknown game', appId: a?.storeAppId || st.appId || null, playtime: st.minutes || 0, lastPlayed: st.lastPlayed || 0, firstPlayed: st.firstPlayed || 0, removed: true, assets: {}, kind: 'local' };
  });
  const played = [...GAMES.filter(g => g.playtime > 0 || g.launches > 0), ...removed];
  return { removed, played, total: played.reduce((s, g) => s + (g.playtime || 0), 0), top: [...played].sort((a, b) => b.playtime - a.playtime) };
}
function viewProfile(v) {
  const p = S.config.profile || {};
  const { removed, played, total, top } = profileData();
  const inLib = GAMES.filter(g => !g.hidden);

  // header: background, avatar, name and a clean stats strip
  const head = frag(`<div class="pf-head"><div class="pf-bg"></div><div class="pf-id"><div class="pf-name"><h1></h1><p></p></div><div class="pf-stats"></div></div></div>`);
  { const im = new Image(); im.src = p.banner ? fileSrc(p.banner) : 'default-banner.jpg'; head.querySelector('.pf-bg').appendChild(im); }
  const chg = frag(`<button class="btn chg">${I.image} ${p.banner ? 'Change background' : 'Add a background'}</button>`);
  chg.onclick = changeBanner; head.appendChild(chg);
  const av = avatarEl(132); av.title = 'Change avatar'; av.onclick = changeAvatar;
  head.querySelector('.pf-id').prepend(av);
  head.querySelector('h1').textContent = p.name || 'Player';
  head.querySelector('.pf-name p').textContent = `Atlas member since ${fmtDate(p.createdAt, true)}`;
  const strip = head.querySelector('.pf-stats');
  [[inLib.length, 'Games'], [played.length, 'Played'], [Math.round(total / 60), 'Hours']].forEach(([n, lbl]) => {
    const d = frag(`<div><b>0</b><small>${lbl}</small></div>`);
    const b = d.querySelector('b');
    if (renderAnim) countUp(b, n, 1300); else b.textContent = n.toLocaleString(LOC);
    strip.appendChild(d);
  });
  const ed = frag(`<button class="btn" style="align-self:center;margin-left:8px">${I.edit} Edit profile</button>`); ed.onclick = editProfile;
  head.querySelector('.pf-id').appendChild(ed);
  v.appendChild(head);

  const body = frag('<div class="pf-body"><div class="pf-main"></div><div class="pf-side"></div></div>');
  const main = body.querySelector('.pf-main'), side = body.querySelector('.pf-side');

  // favourite game showcase
  const fav = top.find(g => g.playtime > 0 && !g.removed);
  if (fav) {
    const s = frag(`<div class="pf-sec" style="--d:0"><h3>Most played game</h3><div class="show"><div class="bg"></div><div class="in"><div class="lg"></div><div class="nums"></div></div></div></div>`);
    const sh = s.querySelector('.show');
    // header art already has the game's name on it: if that's all there is, don't write the name twice
    const toHeader = () => { sh.classList.add('hdr'); return img(L.header(fav), () => ph(fav, '')); };
    s.querySelector('.bg').appendChild(img([...L.hero(fav), ...(fav.art?.screenshots || [])], toHeader));
    const lg = s.querySelector('.lg');
    lg.appendChild(img(L.logo(fav), () => { const h = document.createElement('h2'); h.textContent = fav.name; return h; }, '', isLogo));
    s.querySelector('.nums').innerHTML = `<div><b>${fmtPlay(fav.playtime)}</b><small>On record</small></div><div><b>${fmtDate(fav.lastPlayed, true)}</b><small>Last played</small></div>`;
    sh.onclick = () => go('game', { sel: fav.key });
    main.appendChild(s);
  }

  // recent activity, Steam-profile style rows
  const recent = [...played].filter(g => g.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 8);
  const act = frag(`<div class="pf-sec" style="--d:1"><h3>Recent activity <span>${fmtPlay(total)} on record</span></h3><div></div></div>`);
  const list = act.querySelector('div');
  recent.forEach((g, i) => {
    const r = frag(`<div class="act" style="--i:${i}"><div class="cap2"></div><div class="nm"></div><div class="rt"></div></div>`);
    r.querySelector('.cap2').appendChild(img(L.header({ ...g, assets: g.assets || {} }), () => ph(g, g.name)));
    r.querySelector('.nm').innerHTML = `${esc(g.name)}${g.removed ? '<small>Removed from library — stats kept</small>' : ''}`;
    r.querySelector('.rt').innerHTML = `${fmtPlay(g.playtime)} on record<br><span>last played ${fmtDate(g.lastPlayed, true)}</span>`;
    if (!g.removed) r.onclick = () => go('game', { sel: g.key });
    list.appendChild(r);
  });
  if (!recent.length) list.innerHTML = '<div class="pf-empty">No activity yet. Launch a game from Atlas and it shows up here.</div>';
  main.appendChild(act);

  // side: ranking + library facts
  const rk = frag(`<div class="pf-sec" style="--d:2"><h3>Top games</h3><div></div></div>`);
  const rl = rk.querySelector('div'); const max = top[0]?.playtime || 1;
  top.filter(g => g.playtime > 0).slice(0, 8).forEach((g, i) => {
    const r = frag(`<div class="rank" style="--i:${i}"><span class="no">${i + 1}</span><div class="ic2"></div><div class="mid"><b></b><div class="ln"><i style="width:${Math.max(3, g.playtime / max * 100)}%"></i></div></div><span class="h">${fmtPlay(g.playtime)}</span></div>`);
    r.querySelector('b').textContent = g.name;
    r.querySelector('.ic2').appendChild(img([...L.icon({ ...g, assets: g.assets || {} }), ...L.cover({ ...g, cover: null, assets: g.assets || {} })], () => ph(g, g.name.slice(0, 1))));
    if (!g.removed) r.onclick = () => go('game', { sel: g.key });
    rl.appendChild(r);
  });
  if (!rl.children.length) rl.innerHTML = '<div class="pf-empty">Nothing played yet.</div>';
  side.appendChild(rk);

  const fx = frag(`<div class="pf-sec" style="--d:3"><h3>Library</h3><div class="facts"></div></div>`);
  const facts = fx.querySelector('.facts');
  [[GAMES.filter(g => g.installed && !g.hidden).length, 'Installed'], [GAMES.filter(g => g.kind === 'steam' && !g.hidden).length, 'Steam'],
   [GAMES.filter(g => g.kind === 'local' && !g.hidden).length, 'Non-Steam'], [GAMES.filter(g => g.fav).length, 'Favorites'],
   [S.config.collections.length, 'Collections'], [removed.length, 'Removed, stats kept']]
    .forEach(([n, l]) => facts.insertAdjacentHTML('beforeend', `<div><b>${n.toLocaleString(LOC)}</b><small>${l}</small></div>`));
  side.appendChild(fx);

  v.appendChild(body);
}
async function changeAvatar() {
  const p = await invoke('pick_avatar', { kind: 'avatar' });
  if (!p) return;
  S.config.profile = Object.assign(S.config.profile || {}, { avatar: p }); save(); refresh();
}
async function changeBanner() {
  const p = await invoke('pick_avatar', { kind: 'banner' });
  if (!p) return;
  S.config.profile = Object.assign(S.config.profile || {}, { banner: p }); save(); render(true);
}
/** Edit profile: live preview on the left, Steam-style fields on the right. Nothing changes until Save. */
function editProfile() {
  const p = S.config.profile || {};
  const draft = { name: p.name || '', avatar: p.avatar || null, banner: p.banner || null };
  const body = frag(`<div class="ep">
    <div class="ep-prev">
      <div class="pcard"><div class="bn"><div class="ep-hover"><button data-a="bn">${I.image} Change</button><button data-a="rb" title="Remove background">${I.trash}</button></div></div>
        <div class="who"><div class="av"><span class="ini"></span><div class="ep-hover round-h"><button data-a="av" title="Change picture">${I.camera}</button></div></div><div><b class="pn"></b><small>Atlas member since ${fmtDate(p.createdAt, true)}</small></div></div></div>
      <small class="ep-note">Live preview — this is how your profile looks.</small>
    </div>
    <div class="sform">
      <div class="field"><label>Profile name</label><input class="sinput" maxlength="32" spellcheck="false" placeholder="Enter a profile name"></div>
      <div class="field"><label>Avatar</label><div class="sbtns"><button class="sbtn" data-a="av2">${I.camera} Upload avatar</button><button class="sbtn ghost-s" data-a="rm">Remove</button></div><div class="hintline">A square picture looks best.</div></div>
      <div class="field"><label>Profile background</label><div class="sbtns"><button class="sbtn" data-a="bn2">${I.image} Upload background</button><button class="sbtn ghost-s" data-a="rb2">Remove</button></div><div class="hintline">A wide image, at least 1600 px across.</div></div>
    </div></div>`);
  const inp = body.querySelector('input'); inp.value = draft.name;
  const paint = () => {
    body.querySelector('.pn').textContent = draft.name || 'Your name';
    body.querySelector('.ini').textContent = (draft.name || '?').slice(0, 1).toUpperCase();
    const setImg = (box, src) => { box.querySelectorAll(':scope > img').forEach(x => x.remove()); const im = new Image(); im.src = src; box.prepend(im); };
    setImg(body.querySelector('.bn'), draft.banner ? fileSrc(draft.banner) : 'default-banner.jpg');
    const av = body.querySelector('.av'); av.querySelectorAll(':scope > img').forEach(x => x.remove());
    if (draft.avatar) { const im = new Image(); im.src = fileSrc(draft.avatar); av.prepend(im); }
    body.querySelector('[data-a=rm]').disabled = !draft.avatar;
    body.querySelector('[data-a=rb2]').disabled = !draft.banner;
  };
  inp.oninput = () => { draft.name = inp.value.trim(); inp.classList.remove('bad'); paint(); };
  const pickAv = async () => { const x = await invoke('pick_avatar', { kind: 'avatar' }); if (x) { draft.avatar = x; paint(); } };
  const pickBn = async () => { const x = await invoke('pick_avatar', { kind: 'banner' }); if (x) { draft.banner = x; paint(); } };
  body.querySelector('[data-a=av]').onclick = pickAv; body.querySelector('[data-a=av2]').onclick = pickAv;
  body.querySelector('[data-a=bn]').onclick = pickBn; body.querySelector('[data-a=bn2]').onclick = pickBn;
  body.querySelector('[data-a=rm]').onclick = () => { draft.avatar = null; paint(); };
  body.querySelector('[data-a=rb]').onclick = body.querySelector('[data-a=rb2]').onclick = () => { draft.banner = null; paint(); };
  paint();
  modal({ title: 'Edit profile', body, cls: 'wide', foot: [
    { label: 'Cancel', cls: 'ghost' },
    { label: 'Save changes', cls: 'primary', onClick: c => {
      if (!draft.name) { inp.classList.add('bad'); return inp.focus(); }
      S.config.profile = Object.assign(S.config.profile || {}, { name: draft.name, avatar: draft.avatar, banner: draft.banner });
      save(); topSig = ''; c(); render(S.view === 'profile'); toast('Profile saved.');
    } },
  ] });
  setTimeout(() => inp.focus(), 80);
}

/* ---------- add / properties ---------- */
function steamPicker(initialTerm, initialId, onPick) {
  const box = frag(`<div class="field"><label>Match with the official Steam game (name, cover and banner)</label>
    <div class="row"><input class="inp" placeholder="Search Steam, e.g. lego movie" spellcheck="false"><button class="btn ghost" data-a="none">No match</button></div>
    <div class="results"><div class="msg">Type the game's name to find it on Steam.</div></div></div>`);
  const inp = box.querySelector('input'), res = box.querySelector('.results');
  let sel = initialId || null, t, seq = 0;
  let initialAuto = !initialId;
  const run = async term => {
    const my = ++seq;
    if (!term.trim()) { res.innerHTML = '<div class="msg">Type the game\'s name to find it on Steam.</div>'; return; }
    res.innerHTML = '<div class="msg">Searching…</div>';
    let hits = [];
    try { hits = await invoke('search_steam', { term }); } catch {}
    if (my !== seq) return;
    res.innerHTML = '';
    if (!hits.length) { res.innerHTML = '<div class="msg">Nothing found. Try a shorter name (without version or release group).</div>'; return; }
    hits.forEach((h, i) => {
      const r = frag(`<div class="res ${h.appId === sel ? 'on' : ''}" style="animation:cardIn .35s var(--ease-out) ${i * 30}ms both"><img alt=""><div><b></b><small>AppID ${esc(h.appId)}</small></div><span class="chk">${I.check}</span></div>`);
      r.querySelector('b').textContent = h.name;
      const im = r.querySelector('img'); im.src = CDN[0] + h.appId + '/capsule_184x69.jpg'; im.onerror = () => { if (h.image) im.src = h.image; im.onerror = null; };
      r.onclick = () => { sel = h.appId; res.querySelectorAll('.res').forEach(x => x.classList.remove('on')); r.classList.add('on'); onPick(h); };
      res.appendChild(r);
    });
    if (!sel && initialAuto) { initialAuto = false; res.firstElementChild.click(); }
  };
  inp.oninput = () => { clearTimeout(t); t = setTimeout(() => run(inp.value), 350); };
  box.querySelector('[data-a=none]').onclick = () => { sel = null; res.querySelectorAll('.res').forEach(x => x.classList.remove('on')); onPick(null); };
  if (initialTerm) { inp.value = initialTerm; run(initialTerm); }
  return { el: box, search: term => { inp.value = term; initialAuto = !sel; run(term); } };
}

function properties(g) {
  if (g && g.kind === 'steam') return steamProperties(g);
  const editing = !!g;
  const st = { exe: g?.exe || '', name: g?.name || '', appId: g?.appId || null, args: g?.args || '', cover: g?.cover || null, nameTouched: editing };
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="preview"><div class="pc"></div><div><b></b><small></small></div></div>
    <div class="field"><label>Game executable</label><div class="row"><input class="inp" data-f="exe" placeholder="C:\\Games\\Game\\game.exe" spellcheck="false"><button class="btn" data-a="browse">${I.folder} Browse…</button></div></div>
    <div class="field"><label>Display name</label><input class="inp" data-f="name" placeholder="Filled in from Steam when you pick the game"></div>
    <div data-slot="picker"></div>
    <div class="field"><label>Launch options (optional)</label><input class="inp" data-f="args" placeholder="e.g. -windowed -nointro" spellcheck="false"></div>
    <div class="field"><label>Custom cover (optional)</label><div class="row"><input class="inp" data-f="cover" placeholder="Leave empty to use the Steam cover" readonly><button class="btn" data-a="img">Browse…</button><button class="btn ghost" data-a="noimg">${I.x}</button></div></div>`;
  const F = n => body.querySelector(`[data-f=${n}]`);
  F('exe').value = st.exe; F('name').value = st.name; F('args').value = st.args; F('cover').value = st.cover || '';
  const pv = () => {
    const fake = { name: st.name || 'New game', appId: st.appId, cover: st.cover, assets: {} };
    const pc = body.querySelector('.pc'); pc.innerHTML = ''; pc.appendChild(coverEl(fake));
    body.querySelector('.preview b').textContent = st.name || 'New game';
    body.querySelector('.preview small').textContent = st.appId ? `Matched with Steam · AppID ${st.appId}` : 'Not matched with Steam';
  };
  const picker = steamPicker(editing ? g.name : '', st.appId, h => {
    st.appId = h ? h.appId : null;
    if (h && (!st.nameTouched || !st.name)) { st.name = h.name; F('name').value = h.name; }
    pv();
  });
  body.querySelector('[data-slot=picker]').replaceWith(picker.el);
  F('name').oninput = () => { st.name = F('name').value; st.nameTouched = true; pv(); };
  F('exe').oninput = () => st.exe = F('exe').value.trim().replace(/^"|"$/g, '');
  F('args').oninput = () => st.args = F('args').value;
  body.querySelector('[data-a=browse]').onclick = async () => {
    const r = await invoke('pick_exe'); if (!r) return;
    st.exe = r.path; F('exe').value = r.path;
    if (!st.nameTouched && !st.appId) picker.search(r.guess);
  };
  body.querySelector('[data-a=img]').onclick = async () => { const p = await invoke('pick_image'); if (p) { st.cover = p; F('cover').value = p; pv(); } };
  body.querySelector('[data-a=noimg]').onclick = () => { st.cover = null; F('cover').value = ''; pv(); };
  pv();
  modal({
    title: editing ? 'Properties' : 'Add a game', sub: editing ? g.name : 'Pick the executable, then choose the game from the Steam list.', body,
    foot: [
      { label: 'Cancel', cls: 'ghost' },
      { label: editing ? 'Save' : 'Add to library', cls: 'primary', onClick: c => {
        if (!st.exe) return toast('Choose the game executable first.', true);
        if (!st.name.trim()) return toast('Pick the game from the list or type a name.', true);
        let id;
        if (editing) {
          if (g.appId !== st.appId) delete meta(g.key).art;
          Object.assign(g.raw, { exe: st.exe, name: st.name.trim(), storeAppId: st.appId, args: st.args.trim(), cover: st.cover }); id = g.key;
        } else {
          if (S.config.games.some(x => x.exe.toLowerCase() === st.exe.toLowerCase())) return toast('That game is already in your library.', true);
          const prev = S.config.archive.find(a => (a.exe || '').toLowerCase() === st.exe.toLowerCase());
          id = prev ? prev.id : uid();
          if (prev) S.config.archive = S.config.archive.filter(a => a !== prev);
          S.config.games.push({ id, name: st.name.trim(), exe: st.exe, args: st.args.trim(), storeAppId: st.appId, cover: st.cover, addedAt: Date.now() });
          toast(prev ? `${st.name} is back, with all its hours.` : `${st.name} added to your library.`);
        }
        save(); c(); go('game', { sel: id });
      } },
    ],
  });
}
/* ---------- Steam friends ---------- */
let friendsCache = null, friendsTimer = null, friendsErr = '';
const PSTATE = { 0: 'Offline', 1: 'Online', 2: 'Busy', 3: 'Away', 4: 'Snooze', 5: 'Looking to trade', 6: 'Looking to play' };
async function loadFriends() {
  const key = S.config?.settings?.steamApiKey;
  if (!key) { friendsCache = null; updateFriendCount(); return; }
  try { friendsCache = await invoke('steam_friends', { key }); friendsErr = ''; }
  catch (e) { friendsErr = String(e); }
  updateFriendCount();
  const p = document.querySelector('.friends'); if (p) renderFriends(p);
}
function updateFriendCount() {
  const n = (friendsCache || []).filter(f => f.state > 0).length;
  const c = $('#frCount'); if (c) c.textContent = n ? n : '';
}
function toggleFriends() {
  const open = document.querySelector('.friends');
  if (open) { open.classList.add('out'); clearInterval(friendsTimer); setTimeout(() => open.remove(), 260); $('#frBtn').classList.remove('on'); return; }
  const p = frag('<aside class="friends"></aside>');
  document.body.appendChild(p); $('#frBtn').classList.add('on');
  renderFriends(p); loadFriends();
  friendsTimer = setInterval(loadFriends, 60000);
}
function renderFriends(p) {
  const key = S.config.settings.steamApiKey;
  const head = `<div class="fr-head"><b>Friends</b><div>${key ? `<button class="round sm" data-a="refresh" title="Refresh">${I.refresh}</button><button class="round sm" data-a="key" title="Change API key">${I.gear}</button>` : ''}<button class="round sm" data-a="close" title="Close">${I.x}</button></div></div>`;
  if (!key || p.dataset.editKey) {
    p.innerHTML = head + `<div class="fr-setup">
      <p>See who's online and what they're playing, right in Atlas. It uses Steam's official API with <b>your own key</b>, which stays on this PC.</p>
      <ol><li><button class="link" data-a="apikey">Open Steam's API key page ${I.ext || ''}</button></li>
      <li>For <b>Domain Name</b> type <code>localhost</code>, accept and click <b>Register</b>.</li>
      <li>Copy the key and paste it here:</li></ol>
      <input class="inp mono-inp" placeholder="Your Steam Web API key" spellcheck="false" maxlength="40">
      <button class="btn primary" data-a="save">Show my friends</button>
      <small>Your friends list needs to be visible: Steam → Profile → Edit Profile → Privacy Settings → Friends List: Public.</small></div>`;
    const inp = p.querySelector('input'); inp.value = key || '';
    p.querySelector('[data-a=apikey]').onclick = () => invoke('open_url', { url: 'https://steamcommunity.com/dev/apikey' }).catch(e => toast(String(e), true));
    p.querySelector('[data-a=save]').onclick = async () => {
      const k = inp.value.trim(); if (!k) return inp.focus();
      S.config.settings.steamApiKey = k; save(true); delete p.dataset.editKey;
      p.querySelector('[data-a=save]').textContent = 'Loading…'; await loadFriends();
      if (friendsErr) toast(friendsErr, true);
    };
  } else {
    const list = friendsCache || [];
    const ing = list.filter(f => f.game).sort((a, b) => a.name.localeCompare(b.name));
    const on = list.filter(f => !f.game && f.state > 0).sort((a, b) => a.name.localeCompare(b.name));
    const off = list.filter(f => !f.game && !f.state).sort((a, b) => (b.lastOnline || 0) - (a.lastOnline || 0));
    const rowF = f => `<div class="fr-row ${f.game ? 'ingame' : f.state ? 'online' : 'offline'}" data-id="${esc(f.id)}"><img src="${esc(f.avatar)}" alt=""><div><b>${esc(f.name)}</b><small>${f.game ? esc(f.game) : f.state ? PSTATE[f.state] || 'Online' : f.lastOnline ? `Last online ${fmtDate(f.lastOnline)}` : 'Offline'}</small></div></div>`;
    const grp = (t, a) => a.length ? `<div class="fr-grp">${t} <span>(${a.length})</span></div>${a.map(rowF).join('')}` : '';
    p.innerHTML = head + (friendsErr ? `<div class="fr-err">${esc(friendsErr)}</div>` : '') +
      (friendsCache ? `<div class="fr-list">${grp('In game', ing)}${grp('Online', on)}${grp('Offline', off)}${list.length ? '' : '<div class="fr-empty">No friends to show.</div>'}</div>` : '<div class="fr-empty">Loading your friends…</div>');
    p.querySelectorAll('.fr-row').forEach(r => r.onclick = e => showMenu(e.clientX, e.clientY, [
      { label: 'Message on Steam', icon: I.edit, action: () => invoke('steam_action', { action: 'message', appId: r.dataset.id }).catch(x => toast(String(x), true)) },
      { label: 'View profile', icon: I.user, action: () => invoke('steam_action', { action: 'profile', appId: r.dataset.id }).catch(x => toast(String(x), true)) },
    ]));
  }
  const A = n => p.querySelector(`[data-a=${n}]`);
  A('close').onclick = toggleFriends;
  if (A('refresh')) A('refresh').onclick = () => loadFriends();
  if (A('key')) A('key').onclick = () => { p.dataset.editKey = '1'; renderFriends(p); };
}

/* ---------- Steam downloads ---------- */
const dlPrev = {}; // appId -> { done, at, speed } for live speed
function trackDownloads(list) {
  const now = Date.now();
  S.downloads = (list || []).map(d => {
    const p = dlPrev[d.appId];
    let speed = p?.speed || 0;
    if (p && now > p.at && d.done >= p.done) speed = (d.done - p.done) / ((now - p.at) / 1000) * .6 + speed * .4;
    dlPrev[d.appId] = { done: d.done, at: now, speed };
    return { ...d, speed: d.state === 'downloading' ? speed : 0 };
  });
  paintDownloads();
}
const fmtSpeed = b => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB/s` : b > 1024 ? `${Math.round(b / 1024)} KB/s` : '—';
function fmtEta(d) {
  if (!d.speed || d.speed < 1024 || !d.total) return '';
  const s = (d.total - d.done) / d.speed;
  return s < 60 ? 'less than a minute left' : s < 3600 ? `${Math.round(s / 60)} min left` : `${(s / 3600).toFixed(1)} h left`;
}
const dlLabel = { downloading: 'Downloading', paused: 'Paused', queued: 'Update queued', installing: 'Installing' };
/** Bottom-left download bar (like Steam's) + the progress block on a game's page. */
function paintDownloads() {
  const list = S.downloads || [];
  let bar = document.querySelector('.dlbar');
  if (!list.length) { bar?.remove(); }
  else {
    if (!bar) { bar = frag('<div class="dlbar"></div>'); document.querySelector('.side-bottom').before(bar); }
    const d = list.find(x => x.state === 'downloading') || list[0];
    const pct = d.total ? Math.min(100, d.done / d.total * 100) : 0;
    const g = byKey('s' + d.appId) || { appId: d.appId, name: d.name, assets: {} };
    bar.innerHTML = `<div class="dl-ic"></div><div class="dl-t"><b></b><small>${dlLabel[d.state]}${d.state === 'downloading' ? ` · ${fmtSpeed(d.speed)}` : ''} · ${Math.floor(pct)}%${list.length > 1 ? ` · +${list.length - 1} more` : ''}</small><div class="dl-bar ${d.state}"><i style="width:${pct}%"></i></div></div>`;
    bar.querySelector('b').textContent = d.name || g.name;
    bar.querySelector('.dl-ic').appendChild(iconEl(g));
    bar.onclick = () => go('game', { sel: 's' + d.appId });
  }
  const box = document.querySelector('.game-dl');
  if (box) {
    const d = list.find(x => 's' + x.appId === box.dataset.key);
    if (!d) { box.remove(); return; }
    const pct = d.total ? Math.min(100, d.done / d.total * 100) : 0;
    box.innerHTML = `<div class="gd-top"><b>${dlLabel[d.state]}</b><span>${Math.floor(pct)}%</span></div><div class="dl-bar big ${d.state}"><i style="width:${pct}%"></i></div>
      <div class="gd-meta">${fmtSize(d.done)} of ${fmtSize(d.total)}${d.state === 'downloading' ? ` · ${fmtSpeed(d.speed)} · ${fmtEta(d)}` : ''}</div>`;
  }
}

/* ---------- backup ---------- */
async function exportBackup() {
  await save(true);
  try {
    const p = await invoke('export_backup');
    if (p) toast(`Backup saved: ${p.split(/[\\/]/).pop()}`);
  } catch (e) { toast(String(e), true); }
}
/** Restores a backup and reloads Atlas with it. `ask` shows a confirmation first. */
async function importBackup(ask) {
  if (ask && !await confirmDlg('Import a backup?', 'Your current profile, play time, collections, notes and settings are replaced by the ones in the backup. A copy of what you have now is kept in your data folder.', 'Choose backup')) return false;
  try {
    const cfg = await invoke('import_backup');
    if (!cfg) return false;
    S.uninstalling = true; // stop any pending save from overwriting what was just restored
    toast('Backup restored — reloading…');
    setTimeout(() => location.reload(), 700);
    return true;
  } catch (e) { toast(String(e), true); return false; }
}

/* ---------- themes ---------- */
// name, accent, light accent, gradient start, gradient end, and the whole UI's tint:
// [title bar, sidebar top, sidebar bottom, main background, glow, gradient top, middle, bottom, settings page, settings nav]
const THEMES = {
  blue:   ['Steam Blue', '#1a9fff', '#66c0f4', '#47bfff', '#1a44c2', ['#171a21', '#23262e', '#1c1f25', '#1b2838', '#2a4560', '#1f2d3f', '#182231', '#151d29', '#1b1d23', '#212329']],
  green:  ['Emerald', '#2fb36b', '#7ee2a8', '#52d48a', '#147a44', ['#121915', '#1d2621', '#171f1b', '#152620', '#1f4d37', '#192d23', '#13221b', '#0f1a15', '#161c19', '#1b231f']],
  red:    ['Crimson', '#e5484d', '#ff9b9b', '#ff6b6b', '#a3262b', ['#1a1314', '#271d1f', '#201719', '#26181b', '#4d2329', '#2c1b1f', '#211518', '#1a1113', '#1d1718', '#241c1e']],
  purple: ['Violet', '#8b5cf6', '#c4b5fd', '#a78bfa', '#5b21b6', ['#16131d', '#221e2c', '#1b1824', '#1e1931', '#3b2b5f', '#241d38', '#1a162b', '#141022', '#1a1820', '#211e29']],
  orange: ['Amber', '#f08c1a', '#ffc46b', '#ffab40', '#b4530a', ['#1a1611', '#27211a', '#201b15', '#261d14', '#4f3618', '#2b2118', '#211912', '#19140e', '#1d1a16', '#25211b']],
  pink:   ['Rose', '#e64f97', '#f9a8d4', '#f472b6', '#9d174d', ['#1a1318', '#281d25', '#21171f', '#271827', '#4f2347', '#2d1b2a', '#221520', '#1a1018', '#1d171b', '#251d23']],
  cyan:   ['Ice', '#11b5d6', '#7ee6f7', '#3fd2ec', '#0b6f87', ['#11191b', '#1b2629', '#162023', '#13252a', '#1c4955', '#172c31', '#122327', '#0e1b1e', '#161c1e', '#1b2427']],
  gold:   ['Gold', '#d4a72c', '#f2d982', '#e8c254', '#94700f', ['#1a1810', '#27241a', '#201d14', '#24200f', '#4d4318', '#2a2614', '#201d10', '#19160c', '#1d1b15', '#25221a']],
};
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ');
const THEME_VARS = ['--tb', '--side-1', '--side-2', '--bg', '--bg-glow', '--bg-top', '--bg-mid', '--bg-bottom', '--panel-bg', '--nav-bg'];
function applyTheme() {
  const st = S.config?.settings || {};
  const t = THEMES[st.accent] || THEMES.blue, r = document.documentElement.style;
  r.setProperty('--accent', t[1]); r.setProperty('--accent-2', t[2]);
  r.setProperty('--inst-a', t[3]); r.setProperty('--inst-b', t[4]);
  r.setProperty('--accent-rgb', hexRgb(t[1])); r.setProperty('--accent2-rgb', hexRgb(t[2]));
  THEME_VARS.forEach((v, i) => r.setProperty(v, t[5][i]));
  document.body.classList.toggle('oled', !!st.oled);
}
/** Swatch with a tiny preview of the theme's whole look (background, sidebar, accent). */
const swatchHtml = (k, t, on) => `<button class="swatch ${on ? 'on' : ''}" data-k="${k}" style="--sw:${t[1]};--sw2:${t[2]};--pv-bg:${t[5][3]};--pv-side:${t[5][1]};--pv-glow:${t[5][4]}"><span class="pv"><span class="pv-side"></span><span class="pv-main"><span class="pv-bar"></span><span class="pv-cards"><i></i><i></i><i></i></span></span></span><span class="sw-name"><i></i>${t[0]}</span></button>`;

const oledCard = on => `<div class="oled-card ${on ? 'on' : ''}" data-a="oled"><span class="oc-ic"><i></i></span><div><b>OLED black${tip('oled')}</b><small>Pure black backgrounds — deeper contrast, and less power on OLED screens</small></div><span class="stoggle ${on ? 'on' : ''}"><i></i></span></div>`;
function wireOled(card, settings, persist) {
  card.onclick = () => {
    settings.oled = !settings.oled;
    card.classList.toggle('on', settings.oled); card.querySelector('.stoggle').classList.toggle('on', settings.oled);
    if (persist) save();
    applyTheme();
  };
}

/* ---------- (i) explanations for every option ---------- */
const TIPS = {
  gameBoost: "While a Steam game is running, Atlas drops Steam's interface (steamwebhelper — the web browser Steam uses for its store, library and chat) to the lowest CPU priority and hands its memory back to Windows, so your game can use it. Steam's core — licences, multiplayer, anti-cheat and cloud saves — is never touched. When you close the game, everything goes back to normal on its own.",
  boostPause: "One step further than Game Boost: Steam's interface is frozen completely while you play, so it uses zero CPU and zero GPU. Your game keeps working normally, because games only talk to Steam's core. While it's frozen, the Steam overlay (Shift+Tab) won't open and chat messages and notifications show up after the game. Atlas wakes it up when the game ends — and even after a crash, the next time Atlas starts.",
  startup: "Out of the box Steam starts with Windows and stays open all day, often using 300–700 MB of RAM. You don't need that: when you press Play in Atlas, Steam starts by itself. Turning this back off restores Steam's original startup entry exactly as it was.",
  overlay: "The Steam Overlay (Shift+Tab) is injected into every game you launch: it hooks into the game's rendering to draw on top of it, which can cost FPS and cause stutter. Turning it off disables it for all games. Steam keeps this setting in a file it rewrites when it closes, so Atlas changes it while Steam is closed — it can close Steam for you.",
  gpu: "Steam's interface is a web browser that uses your graphics card to draw itself. With GPU acceleration off, Steam draws its windows with the CPU instead and leaves the whole GPU to your games. Steam's own windows may feel slightly less smooth. Takes effect the next time Steam starts.",
  trackPlaytime: "Only for non-Steam games (Steam already counts hours for its own games). When you launch one from Atlas, a tiny helper (about 1 MB of RAM, no window) waits for the game to close and adds the time to your profile — even with Atlas closed. It follows launchers that start the real game in another process. Turn it off and nothing runs in the background.",
  discord: "Shows “Playing Atlas” on your Discord profile while you browse the library, and the game you launched from Atlas while you play it. Everything goes through the Discord app on your PC — nothing is sent anywhere else.",
  onLaunch: "What Atlas does after you press Play. “Close Atlas” frees every bit of memory Atlas uses while you play; your hours are still counted by the small helper. “Minimize” keeps Atlas in the taskbar, “Do nothing” leaves it on screen.",
  autoUpdate: "When Atlas starts, it checks GitHub for a newer version and shows an “Update available” button if there is one. Nothing is installed until you click it. Every update is signed, so Atlas only installs versions published by its author.",
  backup: 'Saves a single .atlasbackup file with your profile (name, picture and background), play time, first and last played dates, collections, favorites, notes, launch options and settings. Copy it to a new PC and use Import — or “Restore a backup” in the first-run setup — to get everything back. Your games are not part of it.',
  oled: 'Switches every background to pure black. On OLED and AMOLED screens black pixels are switched off, which looks deeper and uses less power. On normal screens it simply gives more contrast.',
  showUninstalled: "Shows every game on your Steam account, not only the installed ones, so you can install them from Atlas with one click.",
  // launch options
  '-fullscreen': 'Runs the game in exclusive fullscreen instead of a borderless window. Windows hands the screen straight to the game, which gives the lowest input lag and the most stable frame times. Alt-Tab is a little slower.',
  '-windowed': 'Starts the game in a window. Handy for multitasking or if fullscreen gives you a black screen.',
  '-refresh': 'Tells the game which refresh rate to use in fullscreen. Without it, some games fall back to 60 Hz on high-refresh monitors. Atlas fills in the refresh rate your monitor is running at right now.',
  '+fps_max': "Removes the frame-rate cap so the game renders as many frames as your PC can. More frames means lower input lag, even above your monitor's refresh rate. If your PC gets hot or loud, a cap is the better choice.",
  '-nojoy': 'Stops the game from loading controller (joystick) support at startup, which saves a little memory and CPU. Leave it off if you play with a controller.',
  '-high': 'Starts the game with high CPU priority, so Windows gives it the processor first. It can add FPS on 4–6 core CPUs. If you stream, record or are in a Discord call at the same time, those may stutter — skip it then.',
  '-console': 'Opens the developer console as soon as the game starts, so you can type commands right away.',
  '-allow_third_party_software': "CS2 runs in Trusted Mode, which blocks programs that hook into the game. This lets OBS Game Capture, recorders and overlays work with CS2. Valve notes it may slightly lower your Trust Factor, so only use it if you need it.",
  '-novid': "Skips the intro videos that play when the game starts. Works in many games, especially Valve's; games that don't know it simply ignore it.",
  '-dx11': 'Forces DirectX 11. Only for games that let you switch graphics API — others ignore it. Try another API if the game crashes or stutters.',
  '-dx12': 'Forces DirectX 12. Only for games that let you switch graphics API — others ignore it. Try another API if the game crashes or stutters.',
  '-vulkan': 'Forces Vulkan. Only for games that let you switch graphics API — others ignore it. Try another API if the game crashes or stutters.',
};
const tipKey = a => TIPS[a] ? a : Object.keys(TIPS).find(k => k.startsWith('-') || k.startsWith('+') ? a.startsWith(k) : false);
/** Small (i) button; hovering or clicking it shows the detailed explanation. */
const tip = key => { const k = tipKey(key); return k ? `<button class="itip" data-tip="${esc(k)}" aria-label="More info">i</button>` : ''; };
let tipEl = null;
function showTip(btn) {
  hideTip();
  tipEl = frag(`<div class="tipbox"></div>`); tipEl.textContent = TIPS[btn.dataset.tip];
  document.body.appendChild(tipEl);
  const r = btn.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
  const left = Math.max(10, Math.min(r.left + r.width / 2 - t.width / 2, innerWidth - t.width - 10));
  const above = r.top - t.height - 10 > 10;
  tipEl.style.left = left + 'px'; tipEl.style.top = (above ? r.top - t.height - 10 : r.bottom + 10) + 'px';
  tipEl.classList.add(above ? 'up' : 'down');
}
function hideTip() { if (tipEl) { tipEl.remove(); tipEl = null; } }
document.addEventListener('mouseover', e => { const b = e.target.closest('.itip'); if (b) showTip(b); });
document.addEventListener('mouseout', e => { if (e.target.closest('.itip')) hideTip(); });
document.addEventListener('click', e => { const b = e.target.closest('.itip'); if (b) { e.stopPropagation(); e.preventDefault(); tipEl ? hideTip() : showTip(b); } }, true);

/** Launch options: each one explained, plus presets for games that have well-known good settings. */
const LAUNCH_OPTS = {
  730: [
    ['-fullscreen', 'Exclusive fullscreen', 'Lowest input lag and most consistent frame times'],
    ['-refresh {hz}', 'Use your monitor at {hz} Hz', 'Makes sure fullscreen runs at your monitor\'s full refresh rate'],
    ['+fps_max 0', 'No FPS cap', 'Lets the game render as many frames as your PC can'],
    ['-nojoy', 'No controller support', 'Skips loading controller support — a little less memory and CPU'],
    ['-high', 'High CPU priority', 'Can help on 4–6 core CPUs; skip it if you stream or record'],
    ['-console', 'Developer console', 'Opens the console when the game starts'],
    ['-allow_third_party_software', 'Allow recording software', 'Lets OBS and other recorders capture the game'],
  ],
  default: [
    ['-fullscreen', 'Fullscreen', 'Start in fullscreen'],
    ['-windowed', 'Windowed', 'Start in a window'],
    ['-novid', 'Skip intro videos', 'Works in many games, especially Source-engine ones'],
    ['-dx11', 'DirectX 11', 'Only for games that support switching renderer'],
    ['-dx12', 'DirectX 12', 'Only for games that support switching renderer'],
    ['-vulkan', 'Vulkan', 'Only for games that support switching renderer'],
  ],
};
const LAUNCH_PRESETS = {
  730: [
    ['recommended', 'Recommended', 'Smooth and safe for every PC', ['-fullscreen', '-refresh {hz}', '+fps_max 0', '-nojoy']],
    ['competitive', 'Competitive', 'Every frame, lowest latency', ['-fullscreen', '-refresh {hz}', '+fps_max 0', '-nojoy', '-high']],
    ['stream', 'Streaming', 'For OBS and recorders', ['-fullscreen', '-refresh {hz}', '+fps_max 0', '-nojoy', '-allow_third_party_software']],
    ['clean', 'Clean', 'No launch options', []],
  ],
};
async function launchConfigurator(box, g, m) {
  const hz = await invoke('display_hz').catch(() => 0) || 0;
  const fill = a => a.replace('{hz}', hz || 60);
  const opts = (LAUNCH_OPTS[g.appId] || LAUNCH_OPTS.default).filter(([a]) => hz || !a.includes('{hz}'));
  const presets = LAUNCH_PRESETS[g.appId];
  box.innerHTML = `
    ${hz ? `<div class="lc-hz">${I.window}<span>Your monitor runs at <b>${hz} Hz</b> — options below use it automatically.</span></div>` : ''}
    ${presets ? `<div class="lc-presets">${presets.map(([k, t, d]) => `<button class="lc-preset" data-p="${k}"><b>${t}</b><small>${d}</small></button>`).join('')}</div>` : ''}
    <div class="lc-list">${opts.map(([a, t, d]) => `<div class="lc-opt" data-arg="${esc(fill(a))}"><div><b>${esc(fill(t))}${tip(fill(a))}</b><small>${esc(d)}</small></div><code>${esc(fill(a))}</code><button class="stoggle"><i></i></button></div>`).join('')}</div>
    <label class="lc-custom-l">Command line</label>
    <input class="inp mono-inp" data-f="args" placeholder="No launch options" spellcheck="false">
    <div class="hint steam-own">Atlas starts the game through Steam with these options — no need to open Steam.</div>`;
  const args = box.querySelector('[data-f=args]'); args.value = m.launchArgs || '';
  const tokens = () => args.value.match(/[+-][^\s+-][^\s]*(?:\s+(?![+-])[^\s]+)?/g) || [];
  const sync = () => {
    const list = tokens();
    box.querySelectorAll('.lc-opt').forEach(o => o.classList.toggle('on', list.includes(o.dataset.arg)));
    box.querySelectorAll('.lc-preset').forEach(p => {
      const want = presets.find(x => x[0] === p.dataset.p)[3].map(fill);
      p.classList.toggle('on', want.length === list.length && want.every(w => list.includes(w)));
    });
  };
  const store = () => { m.launchArgs = args.value.trim(); if (!m.launchArgs) delete m.launchArgs; save(); sync(); };
  args.oninput = store;
  box.querySelectorAll('.lc-opt').forEach(o => o.onclick = () => {
    const a = o.dataset.arg, list = tokens();
    args.value = (list.includes(a) ? list.filter(x => x !== a) : [...list, a]).join(' '); store();
  });
  box.querySelectorAll('.lc-preset').forEach(p => p.onclick = () => {
    args.value = presets.find(x => x[0] === p.dataset.p)[3].map(fill).join(' '); store();
  });
  sync();
  invoke('steam_launch_options', { appId: g.appId }).then(own => {
    if (own && own.trim()) box.querySelector('.steam-own').innerHTML = `Already set inside Steam: <code>${esc(own.trim())}</code> — Steam adds these too, so there's no need to repeat them here.`;
  }).catch(() => {});
}
function steamProperties(g) {
  const m = meta(g.key);
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="field"><label>Launch options</label><div class="lc"><div class="sload">Loading…</div></div></div>
    <div class="field"><label>Custom cover</label><div class="row"><input class="inp" readonly placeholder="Official Steam cover"><button class="btn" data-a="img">Browse…</button><button class="btn ghost" data-a="noimg">${I.x}</button></div></div>
    <div class="switch ${g.hidden ? 'on' : ''}" data-a="hide"><div><b style="font-weight:500">Hide from library</b><div class="hint" style="margin:2px 0 0">You can always find it under the “Hidden” filter.</div></div><div class="tg"></div></div>
    <div class="row" style="margin-top:16px"><button class="btn" data-a="sp">${I.gear} Steam properties</button>${g.installed ? `<button class="btn" data-a="un">${I.trash} Uninstall</button>` : ''}</div>`;
  launchConfigurator(body.querySelector('.lc'), g, m);
  const inp = body.querySelector('[data-a=img]').parentElement.querySelector('input'); inp.value = m.cover || '';
  body.querySelector('[data-a=img]').onclick = async () => { const p = await invoke('pick_image'); if (p) { m.cover = p; inp.value = p; save(); refresh(); } };
  body.querySelector('[data-a=noimg]').onclick = () => { delete m.cover; inp.value = ''; save(); refresh(); };
  const sw = body.querySelector('[data-a=hide]'); sw.onclick = () => { sw.classList.toggle('on'); m.hidden = sw.classList.contains('on'); save(); refresh(); };
  body.querySelector('[data-a=sp]').onclick = () => steamAct('properties', g);
  const un = body.querySelector('[data-a=un]'); if (un) un.onclick = () => steamAct('uninstall', g);
  modal({ title: 'Properties', sub: g.name, body, foot: [{ label: 'Done', cls: 'primary' }] });
}

/* ---------- folder scan ---------- */
async function scanFolder() {
  const done = busy('Choose your games folder. Then Atlas finds every game and matches it with Steam…');
  let r;
  try { r = await invoke('scan_folder'); } catch (e) { toast(String(e), true); } finally { done(); }
  if (!r) return;
  const have = new Set(S.config.games.map(x => x.exe.toLowerCase()));
  const found = r.games.filter(x => !have.has(x.exe.toLowerCase()));
  if (!found.length) return toast(r.games.length ? 'Every game in that folder is already in your library.' : 'No games found in that folder.');
  const body = document.createElement('div');
  body.innerHTML = `<div class="results" style="max-height:52vh"></div><div class="hint">Untick anything you don't want. You can fix a name or Steam match later in Properties.</div>`;
  const list = body.querySelector('.results');
  const chosen = new Set(found.map((_, i) => i));
  found.forEach((f, i) => {
    const r2 = frag(`<div class="res on" style="animation:cardIn .35s var(--ease-out) ${i * 30}ms both"><img alt=""><div style="min-width:0"><b></b><small style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></small></div><span class="chk">${I.check}</span></div>`);
    r2.querySelector('b').textContent = f.name; r2.querySelector('small').textContent = f.exe;
    const im = r2.querySelector('img'); if (f.appId) im.src = CDN[0] + f.appId + '/capsule_184x69.jpg'; else im.style.visibility = 'hidden';
    r2.onclick = () => { r2.classList.toggle('on'); r2.classList.contains('on') ? chosen.add(i) : chosen.delete(i); };
    list.appendChild(r2);
  });
  modal({ title: `Found ${plural(found.length, 'game', 'games')}`, sub: r.folder, body, foot: [
    { label: 'Cancel', cls: 'ghost' },
    { label: 'Add selected', cls: 'primary', onClick: c => {
      let n = 0;
      found.forEach((f, i) => {
        if (!chosen.has(i)) return;
        const prev = S.config.archive.find(a => (a.exe || '').toLowerCase() === f.exe.toLowerCase());
        if (prev) S.config.archive = S.config.archive.filter(a => a !== prev);
        S.config.games.push({ id: prev ? prev.id : uid(), name: f.name, exe: f.exe, args: '', storeAppId: f.appId || null, cover: null, addedAt: Date.now() });
        n++;
      });
      save(); c(); refresh(); toast(`Added ${plural(n, 'game', 'games')}.`);
    } },
  ] });
}

/* ---------- settings (full screen, Steam-style) ---------- */
function settings(startTab = 'account') {
  closeMenu();
  const s = S.config.settings;
  const p = S.config.profile || {};
  const tabs = [
    ['account', 'Account', I.user], ['appearance', 'Appearance', I.image], ['ingame', 'In-Game', I.play], ['library', 'Library', I.coll],
    ['steam', 'Steam', I.store], ['updates', 'Updates', I.download], ['data', 'Your Data', I.folder], null, ['uninstall', 'Uninstall', I.trash],
  ];
  const pg = frag(`<div class="spage"><nav class="snav">${tabs.map(t => t ? `<button data-t="${t[0]}">${t[2]}<span>${t[1]}</span></button>` : '<div class="ssep"></div>').join('')}</nav>
    <section class="spanel"></section><button class="sclose" title="Close">${I.x}</button></div>`);
  const panel = pg.querySelector('.spanel');
  const close = () => { pg.classList.add('out'); document.body.classList.remove('in-settings'); window.closeSettings = null; document.removeEventListener('keydown', onKey, true); setTimeout(() => { pg.remove(); presence(); }, 250); };
  window.closeSettings = close;
  const onKey = e => { if (e.key === 'Escape' && !document.querySelector('.overlay,.menu')) { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  pg.querySelector('.sclose').onclick = close;

  const pretty = x => String(x || '').replace(/^([a-z]):/, (m, d) => d.toUpperCase() + ':');
  const row = (label, value, btn, cls = '') => `<div class="srow ${cls}"><div class="sl"><span class="lb">${label}</span>${value ? `<span class="vl">${value}</span>` : ''}</div>${btn || ''}</div>`;
  const sbtn = (a, label, extra = '') => `<button class="stbtn ${extra}" data-a="${a}">${label}</button>`;
  const tile = (a, icon, title, sub) => `<button class="stile" data-a="${a}">${icon}<b>${title}</b><small>${sub}</small></button>`;
  const LAUNCH = { close: 'Close Atlas', minimize: 'Minimize Atlas', none: 'Do nothing' };

  const views = {
    account: b => {
      b.innerHTML = `<h1>Account</h1>
        <div class="sacct"><div class="sav"></div><div class="sname"><b></b><small>Atlas member since ${fmtDate(p.createdAt, true)}</small></div>${sbtn('view', 'View Profile')}</div>
        <div class="stiles">${tile('edit', I.edit, 'Edit Profile', 'Name, avatar, background')}${tile('av', I.camera, 'Change Avatar', 'Upload a picture')}${tile('bn', I.image, 'Profile Background', p.banner ? 'Change or remove' : 'Add a banner image')}</div>
        ${row('Profile Name', esc(p.name || ''), sbtn('edit2', 'Edit Name'))}
        ${row('Welcome Setup', 'Go through the first-run setup again', sbtn('setup', 'Run Setup'))}`;
      b.querySelector('.sav').appendChild(avatarEl(60));
      b.querySelector('.sname b').textContent = p.name || 'Player';
      const A = n => b.querySelector(`[data-a=${n}]`);
      A('view').onclick = () => { close(); go('profile'); };
      A('edit').onclick = A('edit2').onclick = editProfile;
      A('av').onclick = async () => { await changeAvatar(); views.account(b); };
      A('bn').onclick = async () => { await changeBanner(); views.account(b); };
      A('setup').onclick = () => { close(); runSetupAgain(); };
    },
    appearance: b => {
      b.innerHTML = `<h1>Appearance</h1>
        <div class="ssub" style="margin-top:0">Accent color</div>
        <div class="swatches">${Object.entries(THEMES).map(([k, t]) => swatchHtml(k, t, (s.accent || 'blue') === k)).join('')}</div>
        ${oledCard(!!s.oled)}`;
      b.querySelectorAll('.swatch').forEach(w => w.onclick = () => {
        s.accent = w.dataset.k; save(); applyTheme();
        b.querySelectorAll('.swatch').forEach(x => x.classList.toggle('on', x === w));
      });
      wireOled(b.querySelector('[data-a=oled]'), s, true);
    },
    ingame: b => {
      b.innerHTML = `<h1>In-Game</h1>
        ${row('When a game launches' + tip('onLaunch'), 'What Atlas does after you press Play', `<button class="sselect" data-a="mode">${LAUNCH[s.onLaunch] || LAUNCH.close}${I.down}</button>`)}
        ${row('Play time tracking' + tip('trackPlaytime'), 'For non-Steam games: a tiny helper (~1 MB) counts your hours while you play, even with Atlas closed. Steam games always use Steam\'s own hours', `<button class="stoggle ${s.trackPlaytime !== false ? 'on' : ''}" data-a="track"><i></i></button>`)}
        ${row('Discord Rich Presence' + tip('discord'), 'Show “Playing Atlas” and the game you play on your Discord profile', `<button class="stoggle ${s.discord !== false ? 'on' : ''}" data-a="discord"><i></i></button>`)}
        <p class="snote">“Close Atlas” is recommended: your game gets every bit of your PC, and a tiny background helper (about 1 MB) records your play time until the game exits.</p>`;
      b.querySelector('[data-a=track]').onclick = e => { s.trackPlaytime = s.trackPlaytime === false; e.currentTarget.classList.toggle('on', s.trackPlaytime !== false); save(true); toast(s.trackPlaytime !== false ? 'Play time tracking is on.' : 'Play time tracking is off — nothing runs in the background.'); };
      b.querySelector('[data-a=discord]').onclick = e => { s.discord = s.discord === false; e.currentTarget.classList.toggle('on', s.discord !== false); save(true); presenceSig = ''; presence(); };
      b.querySelector('[data-a=mode]').onclick = e => menuAt(e.currentTarget, Object.entries(LAUNCH).map(([k, l]) => ({ label: l, check: s.onLaunch === k, action: () => { s.onLaunch = k; save(); views.ingame(b); } })));
    },
    library: b => {
      b.innerHTML = `<h1>Library</h1>
        ${row('Show uninstalled Steam games' + tip('showUninstalled'), 'Every game on your Steam account, ready to install', `<button class="stoggle ${s.showUninstalled ? 'on' : ''}" data-a="unins"><i></i></button>`)}
        ${row('Add a non-Steam game', 'Any .exe — cracked games, emulators, other launchers', sbtn('add', 'Add Game'))}
        ${row('Scan a folder for games', 'Finds every game in a folder and matches it with Steam', sbtn('scan', 'Scan Folder'))}
        ${row('Moved or deleted games', 'Checked automatically on every start', sbtn('find', 'Check Now'))}`;
      const A = n => b.querySelector(`[data-a=${n}]`);
      A('unins').onclick = e => { s.showUninstalled = !s.showUninstalled; e.currentTarget.classList.toggle('on', s.showUninstalled); save(); refresh(); };
      A('add').onclick = () => { close(); properties(); };
      A('scan').onclick = () => { close(); scanFolder(); };
      A('find').onclick = async () => { const d = busy('Checking your games on every drive…'); await checkMoved(); d(); toast('Your non-Steam games are up to date.'); };
    },
    steam: b => {
      b.innerHTML = `<h1>Steam</h1><div class="sload">Detecting Steam…</div>`;
      invoke('steam_info').catch(() => null).then(inf => {
        if (!b.isConnected) return;
        let h = '<h1>Steam</h1>';
        if (!inf?.path) h += row('Steam folder', 'Not found — Atlas checked the registry and every drive', sbtn('pick', 'Choose Folder'));
        else {
          h += row('Steam folder', `<span class="mono">${esc(pretty(inf.path))}</span> · ${inf.manual ? 'chosen manually' : 'detected automatically'}`,
            (inf.manual ? sbtn('auto', 'Detect Automatically') : '') + sbtn('pick', 'Change Folder'));
          h += `<div class="ssub">Library folders</div>`;
          inf.libraries.forEach(l => { h += `<div class="srow lib">${I.disk}<div class="sl"><span class="lb mono">${esc(pretty(l.path))}</span></div><span class="vl">${plural(l.games, 'game', 'games')} installed</span></div>`; });
        }
        h += row('Reload library', 'Re-read your Steam games, hours and artwork', sbtn('reload', 'Reload'));
        h += `<div class="ssub">Optimize Steam</div><div class="optbox"><div class="sload">Checking your Steam…</div></div>`;
        b.innerHTML = h;
        paintOptimizer(b.querySelector('.optbox'));
        const A = n => b.querySelector(`[data-a=${n}]`);
        A('pick').onclick = async () => {
          try { const x = await invoke('pick_steam_folder'); if (!x) return; s.steamPath = x; await save(true); await load(true); refresh(); views.steam(b); toast('Steam folder updated.'); }
          catch (e) { toast(String(e), true); }
        };
        if (A('auto')) A('auto').onclick = async () => { delete s.steamPath; await save(true); await load(true); refresh(); views.steam(b); toast('Using the detected Steam folder.'); };
        A('reload').onclick = () => load(true).then(() => { refresh(); toast('Steam library reloaded.'); });
      });
    },
    updates: b => {
      b.innerHTML = `<h1>Updates</h1>
        ${row('Installed version', '<span class="ver">Atlas</span>', sbtn('check', 'Check for Updates'))}
        ${row('Automatic updates' + tip('autoUpdate'), 'Look for a new version every time Atlas starts', `<button class="stoggle ${s.autoUpdate !== false ? 'on' : ''}" data-a="auto"><i></i></button>`)}
        <div class="ubox"></div>
        <p class="snote">Updates are signed. Atlas only installs versions published by its author, then restarts on its own — your library, hours and settings stay exactly as they are.</p>`;
      TA.app.getVersion().then(v => { const e = b.querySelector('.ver'); if (e) e.textContent = `Atlas ${v}`; }).catch(() => {});
      const box = b.querySelector('.ubox');
      if (pendingUpdate) updateCard(box, pendingUpdate);
      b.querySelector('[data-a=auto]').onclick = e => { s.autoUpdate = s.autoUpdate === false; e.currentTarget.classList.toggle('on', s.autoUpdate !== false); save(); };
      const chk = b.querySelector('[data-a=check]');
      chk.onclick = async () => {
        chk.disabled = true; chk.textContent = 'Checking…';
        box.innerHTML = '<div class="ucheck"><div class="spinner"></div>Looking for a new version…</div>';
        let u = null, failed = false;
        try { u = await invoke('check_update'); } catch { failed = true; }
        chk.disabled = false; chk.textContent = 'Check for Updates';
        if (failed) box.innerHTML = `<div class="ucheck err">${I.x} Couldn't reach the update server. Check your connection and try again.</div>`;
        else if (!u) box.innerHTML = `<div class="ucheck ok">${I.check} You're up to date <span>· checked just now</span></div>`;
        else { pendingUpdate = u; ensureUpdatePill(); updateCard(box, u); }
      };
    },
    data: b => {
      b.innerHTML = `<h1>Your Data</h1>
        ${row('Export backup' + tip('backup'), 'One file with your profile, pictures, play time, collections, notes and settings', sbtn('export', 'Export'))}
        ${row('Import backup', 'Bring everything back from a backup — on this PC or a new one', sbtn('import', 'Import'))}
        ${row('Data folder', `<span class="mono">${esc(S.dataDir)}</span>`, sbtn('open', 'Open Folder'))}
        <p class="snote">Your profile, play time, notes and collections live only on this PC — nothing is uploaded anywhere. Export a backup to keep them when you change PCs.</p>`;
      b.querySelector('[data-a=open]').onclick = () => invoke('reveal', { path: S.dataDir });
      b.querySelector('[data-a=export]').onclick = exportBackup;
      b.querySelector('[data-a=import]').onclick = () => importBackup(true);
    },
    uninstall: b => {
      b.innerHTML = `<h1>Uninstall</h1>
        ${row('Uninstall Atlas', 'Removes Atlas and its shortcuts. Your games and Steam are never touched.', sbtn('unin', 'Uninstall…', 'danger'), 'danger')}`;
      b.querySelector('[data-a=unin]').onclick = () => uninstallFlow();
    },
  };
  const show = t => {
    pg.querySelectorAll('.snav button').forEach(x => x.classList.toggle('on', x.dataset.t === t));
    panel.innerHTML = ''; const v = document.createElement('div'); v.className = 'sp-view'; panel.appendChild(v); views[t](v);
  };
  pg.querySelectorAll('.snav button').forEach(x => x.onclick = () => show(x.dataset.t));
  document.body.appendChild(pg); document.body.classList.add('in-settings');
  show(startTab); presence();
}
async function runSetupAgain() {
  const old = S.config.profile;
  await setupWizard();
  if (old?.createdAt) S.config.profile.createdAt = old.createdAt;
  save(); topSig = ''; render(true);
}

/* ---------- uninstall ---------- */
async function uninstallFlow() {
  const info = await invoke('uninstall_info').catch(() => ({ installed: false }));
  
  if (!info.installed) {
    return modal({ title: 'Uninstall Atlas', sub: 'This copy of Atlas runs without being installed, so there\'s nothing to uninstall. To remove it, just delete its folder.', cls: 'sm', foot: [{ label: 'OK', cls: 'primary' }] });
  }
  let wipe = false;
  const body = frag(`<div>
    <p style="margin:0 0 16px;color:var(--text-2);line-height:1.55">Atlas will be removed from this PC, including its shortcuts. Your games, Steam and everything they saved stay exactly where they are.</p>
    <div class="switch" data-a="wipe"><div><b style="font-weight:500">Also delete my Atlas data</b><div class="hint" style="margin:2px 0 0">Profile, play time, notes and collections. Keep it off if you might reinstall later.</div></div><div class="tg"></div></div></div>`);
  const sw = body.querySelector('[data-a=wipe]');
  sw.onclick = () => { wipe = !wipe; sw.classList.toggle('on', wipe); };
  modal({ title: 'Uninstall Atlas?', body, foot: [
    { label: 'Cancel', cls: 'ghost' },
    { label: 'Uninstall', cls: 'danger', onClick: c => { c(); setTimeout(() => runUninstall(wipe), 200); } },
  ] });
}
async function runUninstall(wipe) {
  S.uninstalling = true; clearTimeout(saveT);
  const steps = [
    ['Stopping Atlas', () => sleep(700)],
    wipe ? ['Deleting your profile and play time', () => invoke('uninstall_remove_data')] : ['Keeping your profile and play time', () => sleep(600)],
    ['Removing shortcuts', () => sleep(800)],
    ['Removing app files', () => sleep(900)],
    ['Cleaning up', () => sleep(700)],
  ];
  const u = frag(`<div class="unin"><div class="box">
    <div class="ringwrap"><svg viewBox="0 0 150 150"><circle class="tr" cx="75" cy="75" r="70"/><circle class="pg" cx="75" cy="75" r="70"/></svg><img src="logo.png" alt=""><div class="done"><svg viewBox="0 0 64 64"><path d="M18 33l10 10 18-21"/></svg></div></div>
    <h1>Uninstalling Atlas</h1><p class="sub">Hang tight, this only takes a moment.</p>
    <div class="steps">${steps.map(([t], i) => `<div class="stp" style="--i:${i}"><span class="si">${I.check}</span>${esc(t)}</div>`).join('')}</div>
    <div class="end"><div class="row"><button class="btn green lg" data-a="now">${I.refresh} Restart now</button><button class="btn lg" data-a="later">Restart later</button></div></div>
  </div></div>`);
  document.body.appendChild(u);
  const pg = u.querySelector('.pg'), rows = u.querySelectorAll('.stp');
  await sleep(500);
  for (let i = 0; i < steps.length; i++) {
    rows[i].classList.add('active');
    try { await steps[i][1](); } catch (e) { toast(String(e), true); }
    await sleep(250);
    rows[i].classList.remove('active'); rows[i].classList.add('ok');
    pg.style.strokeDashoffset = String(440 - 440 * (i + 1) / steps.length);
  }
  await sleep(500);
  u.classList.add('gone');
  u.querySelector('h1').textContent = 'Atlas has been uninstalled';
  u.querySelector('.sub').textContent = 'Thanks for playing. The last files disappear the moment this window closes. A restart isn\'t required, but it leaves everything spotless.';
  const fin = restart => invoke('uninstall_finish', { restart, wipe }).catch(e => toast(String(e), true));
  u.querySelector('[data-a=now]').onclick = () => fin(true);
  u.querySelector('[data-a=later]').onclick = () => fin(false);
}

/* ---------- Steam optimizer ---------- */
const mbRound = b => `${Math.round(b / 1048576).toLocaleString(LOC)} MB`;
/** Checklist of Steam optimizations; already-optimized items are shown as done. */
function optRows(box, s, sel) {
  const items = [
    ['boost', 'Game Boost', `Puts Steam's interface to sleep while you play — about ${mbRound(s.uiMemory || 600 * 1048576)} of RAM back for your game`, false],
    ['pause', "Pause Steam's interface completely", 'The biggest boost: zero CPU and GPU from Steam while you play. Chat messages arrive after the game', false],
    ['startup', "Don't start Steam with Windows", 'Steam opens on its own when you press Play', !s.startup],
    ['overlay', 'Turn off the Steam Overlay', 'It runs inside every game and costs FPS', !s.overlay],
    ['gpu', "No GPU acceleration in Steam's interface", 'Keeps your graphics card for your games', !s.gpu],
  ];
  box.innerHTML = '';
  items.forEach(([k, title, desc, done], i) => {
    const r = frag(`<div class="opt-row ck-row ${done || sel[k] ? 'on' : ''} ${done ? 'done' : ''}" style="animation:rise .5s var(--ease-out) ${i * 70}ms both"><span class="ck">${I.check}</span><div><b>${esc(title)}${tip({ boost: 'gameBoost', pause: 'boostPause' }[k] || k)}</b><small>${esc(desc)}</small></div>${done ? '<span class="tag">Already optimized</span>' : ''}</div>`);
    if (!done) r.onclick = () => { sel[k] = !sel[k]; r.classList.toggle('on', sel[k]); };
    box.appendChild(r);
  });
}
async function applySteamOptimizations(s, sel) {
  S.config.settings.gameBoost = !!sel.boost;
  S.config.settings.boostPause = !!sel.boost && !!sel.pause;
  const want = { startup: sel.startup && s.startup, gpu: sel.gpu && s.gpu, overlay: sel.overlay && s.overlay, close: false };
  if (want.startup || want.gpu || want.overlay) {
    const r = await invoke('steam_opt_apply', { o: want }).catch(() => null);
    if (r?.overlayPending) S.config.settings.steamOverlayPending = true; // done the next time Steam is closed
  }
  save(true);
}
/** The overlay setting can only change while Steam is closed: finish it when that happens. */
async function finishPendingSteamOptimizations() {
  if (!S.config?.settings?.steamOverlayPending) return;
  const want = S.config.settings.steamOverlayPending !== 'on'; // 'on' = turn the overlay back on
  const r = await invoke('steam_opt_set', { key: 'overlay', optimized: want, close: false }).catch(() => null);
  if (r && !r.pending) { delete S.config.settings.steamOverlayPending; save(); toast(want ? 'Steam Overlay turned off.' : 'Steam Overlay turned back on.'); }
}

/** Settings > Steam > Optimize Steam — every optimization is a switch you can turn back off. */
async function paintOptimizer(box) {
  const s = await invoke('steam_opt_status').catch(() => null);
  if (!box.isConnected) return;
  if (!s?.found) { box.innerHTML = '<div class="sload">Steam not found.</div>'; return; }
  const st = S.config.settings;
  // current state, read from Steam itself (and Atlas' own Game Boost settings)
  const state = { gameBoost: st.gameBoost !== false, boostPause: !!st.boostPause, startup: !s.startup, overlay: !s.overlay, gpu: !s.gpu };
  const recommended = ['gameBoost', 'boostPause', 'startup', 'overlay', 'gpu'];
  const done = recommended.filter(k => state[k]).length;
  const tog = (k, on) => `<button class="stoggle ${on ? 'on' : ''}" data-k="${k}"><i></i></button>`;
  const badge = k => state[k] ? '<span class="opill on">Active</span>' : recommended.includes(k) ? '<span class="opill rec">Recommended</span>' : '<span class="opill">Optional</span>';
  const rowT = (k, title, desc) => `<div class="srow ${state[k] ? 'opt-on' : ''}"><div class="sl"><span class="lb">${title}${tip(k)}</span><span class="vl">${desc}</span></div>${badge(k)}${tog(k, state[k])}</div>`;
  box.innerHTML =
    `<div class="osum"><div class="osum-t"><b>${done === recommended.length ? 'Steam is fully optimized' : `Steam is ${done} of ${recommended.length} optimized`}</b><small>${done === recommended.length ? 'Every recommended optimization is active.' : 'Turn on the recommended ones to give your games more of your PC.'}</small><div class="obar"><i style="width:${done / recommended.length * 100}%"></i></div></div>${done < recommended.length ? '<button class="stbtn primary" data-a="all">Optimize all</button>' : ''}</div>` +
    rowT('gameBoost', 'Game Boost', `Steam's interface sleeps while you play — ${mbRound(s.uiMemory)} of RAM right now`) +
    rowT('boostPause', "Pause Steam's interface completely", 'The biggest boost: zero CPU and GPU from Steam while you play. Chat messages arrive after the game') +
    rowT('startup', "Don't start Steam with Windows", 'Steam opens on its own when you press Play') +
    rowT('overlay', 'Turn off the Steam Overlay', st.steamOverlayPending ? 'Changes the next time Steam closes' : 'It runs inside every game and costs FPS') +
    rowT('gpu', "No GPU acceleration in Steam's interface", `Keeps your graphics card for your games${s.running ? ' — takes effect when Steam restarts' : ''}`);
  const all = box.querySelector('[data-a=all]');
  if (all) all.onclick = async () => {
    all.disabled = true; all.textContent = 'Optimizing…';
    st.gameBoost = true; st.boostPause = true; save();
    const r = await invoke('steam_opt_apply', { o: { startup: true, gpu: true, overlay: true, close: false } }).catch(() => null);
    if (r?.overlayPending) { st.steamOverlayPending = 'off'; save(); toast('Done — the overlay turns off the next time Steam closes.'); }
    else toast('Steam optimized.');
    paintOptimizer(box);
  };
  box.querySelectorAll('[data-k]').forEach(t => t.onclick = async () => {
    const k = t.dataset.k, on = !t.classList.contains('on');
    if (k === 'gameBoost' || k === 'boostPause') { st[k] = on; save(); paintOptimizer(box); return; }
    let close = false;
    if (k === 'overlay' && s.running) {
      close = await confirmDlg('Close Steam to change the overlay?', 'Steam keeps this setting in a file it rewrites when it closes. Atlas can close Steam now and apply it, or apply it the next time Steam closes.', 'Close Steam and apply');
    }
    t.classList.toggle('on', on); t.disabled = true;
    const r = await invoke('steam_opt_set', { key: k, optimized: on, close }).catch(() => null);
    if (k === 'overlay' && r?.pending) { st.steamOverlayPending = on ? 'off' : 'on'; save(); toast('The overlay changes the next time Steam closes.'); }
    else if (k === 'overlay') { delete st.steamOverlayPending; save(); }
    if (r && !r.ok && !r.pending) toast("Couldn't change that Steam setting.", true);
    paintOptimizer(box);
  });
}
/** The most played games on Steam: used for the setup's backgrounds so it looks right for every new user. */
const POPULAR = [730, 570, 578080, 1172470, 271590, 252490, 1086940, 1245620, 1091500, 1174180, 553850, 2767030, 1085660, 359550, 440, 236390, 1203220, 1623730, 1966720, 105600, 413150, 292030, 990080, 2246340, 2358720, 1172620, 1551360, 381210, 1808500, 252950, 1599340, 2357570, 346110, 945360, 892970, 230410, 1938090, 322330];

/* ---------- first-run setup ---------- */
function setupWizard() {
  return new Promise(resolve => {
    const prof = { name: '', avatar: null, banner: null };
    let optStatus = null;
    const optSel = { boost: true, pause: true, startup: true, overlay: true, gpu: true };
    let launchMode = 'close', idx = 0, busyStep = false;
    const w = frag(`<div class="wiz"><div class="wall-wrap"><div class="wall-cam"><div class="wall"></div></div></div><div class="streak"></div><div class="orb a"></div><div class="orb b"></div><div class="veil"></div><div class="particles"></div>
      <div class="stage"></div>
      <div class="wiz-foot"><button class="btn ghost hide" data-a="back">${I.arrowL} Back</button><div class="dots"></div><button class="btn primary" data-a="next">Continue ${I.arrowR}</button></div></div>`);
    // background: a slow, seamless wall of the user's own Steam covers
    // the wall always shows the most played games on Steam, so it looks great for everyone (even with no games yet)
    const covers = POPULAR.map(id => ({ appId: String(id), name: '', assets: {} }));
    const wall = w.querySelector('.wall');
    if (covers.length >= 6) {
      for (let c = 0; c < 9; c++) {
        const col = document.createElement('div');
        col.className = 'colw' + (c % 2 ? ' rev' : '');
        col.style.setProperty('--dur', `${150 + (c * 37) % 70}s`);
        col.style.setProperty('--delay', `-${(c * 23) % 90}s`);
        const set = Array.from({ length: 7 }, (_, r) => covers[(c * 7 + r * 3) % covers.length]);
        for (const g of [...set, ...set]) { // twice -> moving exactly -50% loops with no jump
          const im = new Image(); im.decoding = 'async'; im.src = L.cover(g)[0];
          im.onerror = () => { im.style.visibility = 'hidden'; };
          col.appendChild(im);
        }
        wall.appendChild(col);
      }
    }
    const parts = w.querySelector('.particles');
    for (let i = 0; i < 28; i++) {
      const p = document.createElement('i'), r = Math.random;
      p.style.cssText = `left:${(r() * 100).toFixed(1)}%;--s:${(1.5 + r() * 2.5).toFixed(1)}px;--t:${(14 + r() * 18).toFixed(1)}s;--dl:-${(r() * 30).toFixed(1)}s;--o:${(.25 + r() * .5).toFixed(2)};--dx:${((r() - .5) * 160).toFixed(0)}px`;
      parts.appendChild(p);
    }
    // gentle parallax that follows the mouse
    const wrap = w.querySelector('.wall-wrap'), orbs = w.querySelectorAll('.orb');
    let tx = 0, ty = 0, cx = 0, cy = 0, alive = true;
    w.addEventListener('mousemove', e => { tx = (e.clientX / innerWidth - .5) * -28; ty = (e.clientY / innerHeight - .5) * -20; });
    const loop = () => {
      if (!alive) return;
      cx += (tx - cx) * .05; cy += (ty - cy) * .05;
      wrap.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;
      orbs.forEach((o, i) => o.style.translate = `${(cx * (i ? -1.4 : 1.2)).toFixed(1)}px ${(cy * (i ? -1.4 : 1.2)).toFixed(1)}px`);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    document.body.classList.add('setup');
    const stage = w.querySelector('.stage'), dots = w.querySelector('.dots');
    const bBack = w.querySelector('[data-a=back]'), bNext = w.querySelector('[data-a=next]');
    const totalMin = GAMES.reduce((s, g) => s + (g.playtime || 0), 0);
    const st = (d, html) => `<div class="st" style="--d:${d}">${html}</div>`;
    const burstCovers = () => {
      const pool = GAMES.filter(g => L.cover(g).length).sort((a, b) => b.playtime - a.playtime).slice(0, 14);
      return pool.map((g, k) => {
        const a = (k / pool.length) * Math.PI * 2 - Math.PI / 2, R = 230 + (k % 3) * 45;
        return `<img src="${esc(L.cover(g)[0])}" style="--k:${k};--tx:${Math.round(Math.cos(a) * R)}px;--ty:${Math.round(Math.sin(a) * R * .62)}px;--rot:${Math.round((Math.random() - .5) * 50)}deg" onerror="this.remove()">`;
      }).join('');
    };
    // a different camera angle on the cover wall for every step
    const CAM = [
      { rx: 16, cx: 0, cy: 0, cs: 1 },
      { rx: 24, cx: -160, cy: 70, cs: 1.08 },
      { rx: 10, cx: 140, cy: -50, cs: 1.16 },
      { rx: 20, cx: -70, cy: -110, cs: 1.06 },
      { rx: 12, cx: 60, cy: -80, cs: 1.1 },
      { rx: 18, cx: 120, cy: 90, cs: 1.12 },
      { rx: 6, cx: 0, cy: 30, cs: 1.28 },
    ];
    const camEl = w.querySelector('.wall-cam');
    const setCam = i => { const c = CAM[i] || CAM[0]; camEl.style.setProperty('--rx', c.rx + 'deg'); camEl.style.setProperty('--cx', c.cx + 'px'); camEl.style.setProperty('--cy', c.cy + 'px'); camEl.style.setProperty('--cs', c.cs); };
    const word = (text, cls = '', base = 0) => `<span class="word ${cls}">${[...text].map((ch, i) => `<span style="--l:${base + i}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('')}</span>`;

    const steps = [
      { // 0 — intro
        render: () => `<div class="intro-logo"><div class="halo"></div><svg class="draw" viewBox="0 0 170 170"><circle cx="85" cy="85" r="84"/></svg><div class="ring"></div><div class="ring r2"></div><img src="logo.png" alt=""></div>
          <h1>${word('Welcome to', '', 0)} ${word('ATLAS', 'brandword', 11)}</h1>
          <p class="lead"><span class="wipe" style="--w:1.9s">Every game you own — Steam or not — in one fast, beautiful library.</span><span class="wipe" style="--w:2.3s">Let's get you set up. It takes 30 seconds.</span></p>`,
        next: 'Get started',
      },
      { // 1 — profile
        cls: 'wide',
        render: () => `${st(0, '<h1>Set up your <b>profile</b></h1>')}
          ${st(1, '<p class="lead">This is how you\'ll show up in Atlas. It stays on this PC, and you can change it anytime.</p>')}
          <div class="prof-grid">
            ${st(2, `<div class="pcard preview-only"><div class="bn"></div>
              <div class="who"><div class="av"><span class="ini">?</span></div><div><b class="pn">Your name</b><small>Atlas member since today</small></div></div></div>`)}
            ${st(3, `<div class="sform">
              <div class="field"><label>Profile name</label><input class="sinput" maxlength="32" spellcheck="false" placeholder="Enter a profile name"><div class="hintline">Shown on your profile and in the top bar.</div></div>
              <div class="field"><label>Avatar</label><div class="sbtns"><button class="sbtn" data-a="av2">${I.camera} Upload avatar</button></div></div>
              <div class="field"><label>Profile background</label><div class="sbtns"><button class="sbtn" data-a="bn2">${I.image} Upload background</button></div></div>
              <div class="restore">Moving from another PC? <button data-a="restore">Restore a backup</button></div>
            </div>`)}
          </div>`,
        mount: el => {
          const inp = el.querySelector('input'), pn = el.querySelector('.pn'), ini = el.querySelector('.ini');
          const upd = () => { prof.name = inp.value.trim(); pn.textContent = prof.name || 'Your name'; ini.textContent = (prof.name || '?').slice(0, 1).toUpperCase(); inp.classList.remove('bad'); };
          inp.value = prof.name; upd();
          inp.oninput = upd; inp.onkeydown = e => { if (e.key === 'Enter') next(); };
          const setImg = (box, p, fallback) => { box.querySelectorAll('img').forEach(x => x.remove()); if (p || fallback) { const im = new Image(); im.src = p ? fileSrc(p) : fallback; box.prepend(im); } };
          setImg(el.querySelector('.av'), prof.avatar); setImg(el.querySelector('.bn'), prof.banner, 'default-banner.jpg');
          const pickAv = async () => { const p = await invoke('pick_avatar', { kind: 'avatar' }); if (p) { prof.avatar = p; setImg(el.querySelector('.av'), p); } };
          const pickBn = async () => { const p = await invoke('pick_avatar', { kind: 'banner' }); if (p) { prof.banner = p; setImg(el.querySelector('.bn'), p); } };
          el.querySelector('[data-a=av2]').onclick = pickAv;
          el.querySelector('[data-a=bn2]').onclick = pickBn;
          el.querySelector('[data-a=restore]').onclick = () => importBackup(false);
          setTimeout(() => inp.focus(), 700);
        },
        valid: el => { if (prof.name) return true; const i = el.querySelector('input'); i.classList.add('bad'); i.focus(); i.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 300 }); return false; },
      },
      { // theme: applies live, the setup itself takes the new color
        render: () => `${st(1, '<h1>Pick your <b>look</b></h1>')}
          ${st(2, '<p class="lead">Choose an accent color for Atlas. You can change it anytime in Settings.</p>')}
          ${st(3, `<div class="swatches wiz-sw">${Object.entries(THEMES).map(([k, t]) => swatchHtml(k, t, (S.config.settings.accent || 'blue') === k)).join('')}</div>`)}
          ${st(4, oledCard(!!S.config.settings.oled))}`,
        mount: el => {
          el.querySelectorAll('.swatch').forEach(w => w.onclick = () => {
            S.config.settings.accent = w.dataset.k; applyTheme();
            el.querySelectorAll('.swatch').forEach(x => x.classList.toggle('on', x === w));
          });
          wireOled(el.querySelector('[data-a=oled]'), S.config.settings, false);
        },
      },
      { // 2 — library
        render: () => {
          const n = S.steam.length;
          if (!n && !S.steamFound) return `${st(1, '<h1>We couldn\'t find <b>Steam</b></h1>')}
            ${st(2, '<p class="lead">Atlas looked in the usual places on every drive. If Steam is installed somewhere else, point Atlas to the folder that contains <b>steam.exe</b>.</p>')}
            ${st(3, `<div class="sbtns" style="justify-content:center"><button class="sbtn" data-a="steam">${I.folder} Choose Steam folder…</button></div>`)}
            ${st(4, '<p class="hintline" style="text-align:center;margin-top:14px;color:#6b6f76">Don\'t use Steam? Just continue — you can add any game after setup.</p>')}`;
          if (!n) return `${st(1, '<h1>Bring your <b>games</b></h1>')}
            ${st(2, '<p class="lead">Your Steam account has no games on this PC yet. No problem — after setup, use <b>Add a game</b> or <b>Scan a folder</b> to add anything you play.</p>')}`;
          const fan = GAMES.filter(g => g.kind === 'steam' && L.cover(g).length).sort((a, b) => b.playtime - a.playtime).slice(0, 7);
          const mid = (fan.length - 1) / 2;
          return `<div class="fan">${fan.map((g, i) => `<img src="${esc(L.cover(g)[0] || '')}" style="--k:${i};--x:${(i - mid) * 62}px;--r:${(i - mid) * 7}deg;z-index:${10 - Math.abs(Math.round(i - mid))}" onerror="this.remove()">`).join('')}</div>
            ${st(3, '<div class="counter" data-n="0">0</div>')}
            ${st(4, `<div class="counter-sub">games found in your Steam library</div>`)}
            ${st(5, `<div class="pills"><span class="pill"><b>${S.steam.filter(g => g.installed).length}</b> installed</span><span class="pill"><b class="hrs">0</b> hours played</span><span class="pill">Non-Steam games: add them anytime</span></div>`)}`;
        },
        mount: el => {
          const c = el.querySelector('.counter'); if (c) setTimeout(() => countUp(c, S.steam.length, 1400), 450);
          const mins = GAMES.reduce((s, g) => s + (g.playtime || 0), 0);
          const h = el.querySelector('.hrs'); if (h) setTimeout(() => countUp(h, Math.round(mins / 60), 1600), 700);
          const pick = el.querySelector('[data-a=steam]');
          if (pick) pick.onclick = async () => {
            try {
              const p = await invoke('pick_steam_folder'); if (!p) return;
              S.config.settings.steamPath = p; await save(true); await load(true);
              const self = steps[2]; el.innerHTML = self.render(); self.mount(el); // show what was found
            } catch (e) { toast(String(e), true); }
          };
        },
      },
      { // 3 — launch behaviour
        render: () => `${st(1, '<h1>When you hit <b>Play</b></h1>')}
          ${st(2, '<p class="lead">Atlas can get out of the way so your games get every bit of your PC. Play time is tracked either way.</p>')}
          ${st(3, `<div class="opts">
            <div class="opt-row" data-v="close"><span class="rd"></span><div><b>Close Atlas</b><small>Uses no resources while you play.</small></div><span class="tag">Recommended</span></div>
            <div class="opt-row" data-v="minimize"><span class="rd"></span><div><b>Minimize Atlas</b><small>Keeps it in the taskbar.</small></div></div>
            <div class="opt-row" data-v="none"><span class="rd"></span><div><b>Keep Atlas open</b><small>Leaves the window as it is.</small></div></div></div>`)}`,
        mount: el => {
          const cs = el.querySelectorAll('.opt-row');
          const sync = () => cs.forEach(c => c.classList.toggle('on', c.dataset.v === launchMode));
          cs.forEach(c => c.onclick = () => { launchMode = c.dataset.v; sync(); }); sync();
        },
      },
      S.steamFound ? { // Steam optimizer
        render: () => `${st(1, '<h1>Make Steam <b>lighter</b></h1>')}
          ${st(2, '<p class="lead">Your games only need Steam\'s core. Atlas can keep the rest of Steam out of the way, so your games get more of your PC.</p>')}
          ${st(3, '<div class="opts optim"><div class="ucheck"><div class="spinner"></div>Checking your Steam…</div></div>')}`,
        mount: async el => {
          const box = el.querySelector('.optim');
          optStatus = await invoke('steam_opt_status').catch(() => null);
          if (!box.isConnected) return;
          if (!optStatus) { box.innerHTML = '<div class="ucheck err">Couldn\'t read Steam\'s settings — you can optimize it later in Settings.</div>'; return; }
          optRows(box, optStatus, optSel);
        },
      } : null,
      { // done
        render: () => {
          // covers gather in a ring, then slam into the circle one after another, faster and faster
          // your own games fly into the circle; with only a few, the most played games on Steam fill in
          let pool = GAMES.filter(g => L.cover(g).length).sort((a, b) => b.playtime - a.playtime).slice(0, 12);
          if (pool.length < 8) pool = POPULAR.slice(0, 12).map(id => ({ appId: String(id), name: '', assets: {} }));
          let t = 1.15;
          const imgs = pool.map((g, k) => {
            const a = (k / pool.length) * Math.PI * 2 - Math.PI / 2, R = 210 + (k % 2) * 40;
            const d2 = t; t += Math.max(.07, .2 - k * .013);
            return `<img src="${esc(L.cover(g)[0])}" style="--d1:${(.15 + k * .05).toFixed(2)}s;--d2:${d2.toFixed(2)}s;--tx:${Math.round(Math.cos(a) * R)}px;--ty:${Math.round(Math.sin(a) * R * .6)}px;--rot:${Math.round((k % 2 ? 1 : -1) * (8 + (k * 7) % 18))}deg" onerror="this.remove()">`;
          }).join('');
          const late = (t + .9).toFixed(2) + 's';
          const wave = y => `M0 ${y} Q12 ${y - 6} 24 ${y} T48 ${y} T72 ${y} T96 ${y} T120 ${y} T144 ${y} T168 ${y} T192 ${y} T216 ${y} V140 H0 Z`;
          return `<div class="fin"><div class="flash"></div><div class="shock"></div><div class="shock s2"></div>
            <svg class="orb2" viewBox="0 0 124 124"><defs><clipPath id="finClip"><circle cx="62" cy="62" r="47"/></clipPath>
              <linearGradient id="finG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9be23a"/><stop offset="1" stop-color="#4f8a12"/></linearGradient></defs>
              <circle class="rim" cx="62" cy="62" r="48"/>
              <g clip-path="url(#finClip)"><g class="water" style="transform:translateY(100px)">
                <g class="wv b"><path d="${wave(14)}" fill="#6fae1f" opacity=".55"/></g>
                <g class="wv"><path d="${wave(18)}" fill="url(#finG)"/></g></g></g>
              <circle class="rimfill" cx="62" cy="62" r="48"/>
              <path class="tick" d="M41 63l14 14 29-31"/></svg>
            <div class="swarm">${imgs}</div></div>
            <div class="st late" style="--late:${late}"><h1>You're all set, <b>${esc(prof.name)}</b></h1></div>
            <div class="st late" style="--late:calc(${late} + .15s)"><p class="lead">Your library is ready. Right-click any game for favorites and collections, and press Enter on a game page to play.</p></div>`;
        },
        mount: el => {
          const fin = el.querySelector('.fin'), water = el.querySelector('.water'), rim = el.querySelector('.rimfill');
          const covers = [...el.querySelectorAll('.swarm img')];
          let total = covers.length || 1, hits = 0;
          covers.forEach(c => c.addEventListener('error', () => { total = Math.max(1, total - 1); if (hits >= total) finish(); }));
          const fill = k => { // k: 0..1 -> liquid level and outline progress
            water.style.transform = `translateY(${(100 - k * 104).toFixed(1)}px)`;
            rim.style.strokeDashoffset = String(301.6 * (1 - k));
          };
          const bump = () => { fin.classList.remove('bump'); void fin.offsetWidth; fin.classList.add('bump'); };
          const finish = () => { fill(1); setTimeout(() => { fin.classList.remove('bump'); fin.classList.add('done'); }, 250); };
          covers.forEach(c => c.addEventListener('animationend', e => {
            if (e.animationName !== 'slam') return;
            hits++; fill(hits / total); bump();
            if (hits === total) finish();
          }));
          // "Open my library" waits until the circle is full and "You're all set" has been written
          bNext.classList.add('locked');
          const lateS = parseFloat(el.querySelector('.st.late')?.style.getPropertyValue('--late')) || 3.4;
          const unlock = () => { if (el.isConnected) bNext.classList.remove('locked'); };
          setTimeout(() => { if (fin.classList.contains('done')) unlock(); else new MutationObserver((m, o) => { if (fin.classList.contains('done')) { o.disconnect(); setTimeout(unlock, 300); } }).observe(fin, { attributes: true }); }, (lateS + 1.1) * 1000);
          if (!covers.length) setTimeout(finish, 900);
          // safety net if some covers failed to load
          setTimeout(() => { if (!fin.classList.contains('done')) finish(); }, 5200);
        },
        next: 'Open my library',
      },
    ].filter(Boolean);
    steps.forEach(() => dots.appendChild(document.createElement('i')));

    let cur = null;
    function show(i, back) {
      const s = steps[i];
      const el = document.createElement('div'); el.className = 'step enter' + (back ? ' back' : '') + (s.cls ? ' ' + s.cls : '');
      el.innerHTML = s.render();
      if (cur) { const old = cur; old.classList.remove('enter'); old.classList.add('leave'); old.classList.toggle('back', !!back); setTimeout(() => old.remove(), 520); }
      stage.appendChild(el); cur = el;
      setCam(i); presence();
      s.mount && s.mount(el);
      [...dots.children].forEach((d, k) => { d.className = k === i ? 'on' : k < i ? 'done' : ''; });
      bBack.classList.toggle('hide', i === 0 || i === steps.length - 1);
      bNext.innerHTML = `${s.next || 'Continue'} ${I.arrowR}`;
    }
    async function next() {
      if (busyStep || bNext.classList.contains('locked')) return;
      const s = steps[idx];
      if (s.valid && !s.valid(cur)) return;
      if (idx === steps.length - 1) return finish();
      busyStep = true; idx++; show(idx); setTimeout(() => busyStep = false, 560);
    }
    function back() { if (busyStep || idx === 0) return; busyStep = true; idx--; show(idx, true); setTimeout(() => busyStep = false, 560); }
    function finish() {
      S.config.profile = { name: prof.name, avatar: prof.avatar, banner: prof.banner, createdAt: Date.now() };
      S.config.settings.onLaunch = launchMode;
      if (optStatus) applySteamOptimizations(optStatus, optSel);
      save(true);
      document.body.classList.remove('setup');
      w.classList.add('out'); setTimeout(() => { alive = false; w.remove(); }, 900); setTimeout(resolve, 380);
    }
    bNext.onclick = next; bBack.onclick = back;
    // Enter moves on from anywhere in the window (inputs handle their own Enter)
    const onEnter = e => { if (!w.isConnected) return document.removeEventListener('keydown', onEnter); if (e.key === 'Enter' && e.target.tagName !== 'INPUT' && !document.querySelector('.overlay')) { e.preventDefault(); next(); } };
    document.addEventListener('keydown', onEnter);
    // start only once the first covers and the logo are decoded, so the opening shot never stutters
    const firstCovers = [...new Set([...wall.querySelectorAll('img')].map(i => i.src))].slice(0, 24);
    Promise.race([predecode([...firstCovers, 'logo.png']), sleep(1000)]).then(() => {
      document.body.appendChild(w);
      requestAnimationFrame(() => show(0));
    });
  });
}

/* ---------- loading & polling ---------- */
async function load(force) {
  const lib = await invoke('get_library', { force: !!force });
  S.steam = lib.steam || []; S.steamFound = lib.steamFound; S.stats = lib.stats || {}; S.running = lib.running || {};
  S.dataDir = lib.dataDir;
  if (!S.config) S.config = ensureConfig(lib.config);
  const now = Date.now();
  for (const g of S.steam) { if (!S.config.meta['s' + g.appId]) S.config.meta['s' + g.appId] = { addedAt: now }; }
  GAMES = allGames();
}
let lastStatus = '';
async function refreshStatus() {
  try {
    const st = await invoke('get_status');
    trackDownloads(st.downloads);
    const sig = JSON.stringify({ stats: st.stats, running: st.running, dl: (st.downloads || []).map(d => d.appId + d.state).join() });
    if (sig === lastStatus) return;
    const first = !lastStatus; lastStatus = sig;
    S.stats = st.stats || {}; S.running = st.running || {};
    if (!first) refresh();
  } catch {}
}
let lastFocusLoad = Date.now();
window.addEventListener('focus', () => {
  refreshStatus();
  if (Date.now() - lastFocusLoad > 60000) { lastFocusLoad = Date.now(); load(false).then(refresh).catch(() => {}); }
});
// keep polling even in the background: while you play, Atlas isn't the focused window
setInterval(refreshStatus, 3000);

/* ---------- wiring ---------- */
$('#frBtn').onclick = toggleFriends;
$('#wMin').onclick = () => appWin.minimize();
$('#wMax').onclick = () => appWin.toggleMaximize();
$('#wClose').onclick = () => appWin.close();
$('#homeBtn').onclick = () => { S.filter = 'all'; go('home'); };
$('#gridBtn').onclick = () => go('grid');
$('#nav').onclick = e => {
  const b = e.target.closest('button'); if (!b || b.dataset.v === 'settings') return;
  if (window.closeSettings) window.closeSettings(); // Library / Profile always take you out of Settings
  go(b.dataset.v === 'profile' ? 'profile' : 'home');
};
$('#meBtn').onclick = e => menuAt(e.currentTarget, [
  { label: 'View my profile', icon: I.user, action: () => { window.closeSettings?.(); go('profile'); } },
  { label: 'Edit profile…', icon: I.edit, action: editProfile },
  { sep: 1 },
  { label: 'Settings…', icon: I.gear, action: settings },
  { label: 'Run setup again…', icon: I.refresh, action: runSetupAgain },
]);
$('#filterBtn').onclick = e => menuAt(e.currentTarget, Object.entries(FILTERS).map(([k, lbl]) => ({ label: lbl, check: S.filter === k, action: () => { S.filter = k; if (S.view !== 'grid' && S.view !== 'home') go('grid'); else refresh(); } })));
$('#recentBtn').onclick = () => { S.sort = S.sort === 'recent' ? 'name' : 'recent'; refresh(); };
$('#readyBtn').onclick = () => { S.ready = !S.ready; refresh(); };
$('#sortBtn').onclick = e => menuAt(e.currentTarget, sortMenu());
$('#addBtn').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.left, r.top - 92, [
  { label: 'Add a non-Steam game…', icon: I.plus, action: () => properties() },
  { label: 'Scan a folder for games…', icon: I.scan, action: scanFolder },
]); };
let qT;
$('#q').oninput = e => { clearTimeout(qT); qT = setTimeout(() => { S.q = e.target.value; renderSide(); if (S.view === 'home' || S.view === 'grid') renderMain(); }, 120); };
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#q').focus(); $('#q').select(); }
  if (e.ctrlKey && !document.querySelector('.wiz')) {
    if (e.key === '1') { e.preventDefault(); window.closeSettings?.(); go('home'); }
    if (e.key === '2') { e.preventDefault(); window.closeSettings?.(); go('profile'); }
    if (e.key === ',') { e.preventDefault(); if (!document.querySelector('.spage')) settings(); }
  }
  if (e.key === 'Escape' && document.activeElement === $('#q')) { $('#q').value = ''; S.q = ''; refresh(); $('#q').blur(); }
  if (e.key === 'Enter' && S.view === 'game' && !document.querySelector('.overlay,.wiz') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) launch(byKey(S.sel));
});
document.addEventListener('contextmenu', e => { if (!e.target.closest('input,textarea')) e.preventDefault(); });

/* ---------- boot ---------- */
/** Decodes images ahead of time so the first frames of an animation never wait on them. */
const predecode = urls => Promise.all(urls.filter(Boolean).map(u => { const i = new Image(); i.src = u; return i.decode().catch(() => {}); }));
predecode(['logo.png', 'default-banner.jpg']);
(async () => {
  $('#scroll').innerHTML = `<div class="section"><div class="skel" style="height:14px;width:180px;margin-bottom:18px"></div><div class="grid">${'<div><div class="skel" style="aspect-ratio:2/3"></div></div>'.repeat(14)}</div></div>`;
  try { await load(false); } catch (e) { toast('Failed to load: ' + e, true); S.config = ensureConfig(null); }
  applyTheme();
  loadFriends();
  refreshStatus();
  setTimeout(checkMoved, 1500); // background: games moved to another drive or deleted
  setTimeout(checkForUpdate, 4000); // if automatic updates are on, quietly look for a new signed release
  setTimeout(finishPendingSteamOptimizations, 2500);
  window.addEventListener('focus', finishPendingSteamOptimizations);
  // the library stays hidden until we know whether the setup comes first, so it never flashes behind it
  if (!S.config.profile) document.body.classList.add('setup');
  document.body.classList.remove('booting');
  if (!S.config.profile) {
    render(false);
    await setupWizard();
    render(true);
  } else render(true);
})();
