/* Oui TV — lecteur IPTV (Xtream Codes, M3U, EPG XMLTV). Aucun contenu fourni : l'utilisateur ajoute son propre abonnement. */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('ouitv:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ouitv:' + k, JSON.stringify(v)); } catch {} },
};
const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); };
const fmt = (s) => { if (!isFinite(s)) return '0:00'; s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
const hhmm = (d) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const initials = (n) => esc(String(n).replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, 2).toUpperCase());
const b64 = (s) => { try { return decodeURIComponent(escape(atob(s))); } catch { return s; } };

/* ---------- État ---------- */
const S = {
  profile: null, // {id,name,type,server,username,password,m3u,epg}
  items: { live: [], movie: [], series: [] },
  cats: { live: [], movie: [], series: [] },
  epg: new Map(), // epgId -> [{start,stop,title,desc}]
  section: 'home', cat: '*', query: '',
  view: null, // détail série
};
const key = (it) => `${S.profile.id}:${it.type}:${it.id}`;
const favs = () => store.get('fav:' + S.profile.id, {});
const history = () => store.get('hist:' + S.profile.id, []);
const isFav = (it) => !!favs()[key(it)];
function toggleFav(it) {
  const f = favs(), k = key(it);
  if (f[k]) delete f[k]; else f[k] = { ...it };
  store.set('fav:' + S.profile.id, f);
  toast(f[k] ? 'Ajouté aux favoris' : 'Retiré des favoris');
  return !!f[k];
}
function pushHistory(it, pos = 0, dur = 0) {
  let h = history().filter((x) => key(x) !== key(it));
  h.unshift({ ...it, pos, dur, at: Date.now() });
  store.set('hist:' + S.profile.id, h.slice(0, 60));
}

/* ---------- Réseau ---------- */
const px = (u) => (window.OUI_PROXY && /^https?:/i.test(u) ? '/proxy?url=' + encodeURIComponent(u) : u);
async function getText(url) {
  const r = await fetch(px(url));
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}
async function getJSON(url) { return JSON.parse(await getText(url)); }

const X = {
  base(p) { return p.server.replace(/\/+$/, ''); },
  api(p, action = '', extra = '') {
    return `${X.base(p)}/player_api.php?username=${encodeURIComponent(p.username)}&password=${encodeURIComponent(p.password)}${action ? '&action=' + action : ''}${extra}`;
  },
  stream(p, type, id, ext) {
    const seg = type === 'live' ? 'live' : type === 'movie' ? 'movie' : 'series';
    return `${X.base(p)}/${seg}/${encodeURIComponent(p.username)}/${encodeURIComponent(p.password)}/${id}.${ext || (type === 'live' ? 'm3u8' : 'mp4')}`;
  },
  async load(p) {
    const auth = await getJSON(X.api(p));
    if (!auth.user_info || String(auth.user_info.auth) === '0') throw new Error('Identifiants refusés');
    const [lc, mc, sc, ls, ms, ss] = await Promise.all([
      'get_live_categories', 'get_vod_categories', 'get_series_categories',
      'get_live_streams', 'get_vod_streams', 'get_series',
    ].map((a) => getJSON(X.api(p, a)).catch(() => [])));
    const catMap = (arr) => Object.fromEntries((arr || []).map((c) => [String(c.category_id), c.category_name]));
    const lcm = catMap(lc), mcm = catMap(mc), scm = catMap(sc);
    S.items.live = (ls || []).map((s, i) => ({ type: 'live', id: s.stream_id, name: s.name, logo: s.stream_icon, group: lcm[s.category_id] || 'Autres', epgId: s.epg_channel_id, num: s.num || i + 1, archive: +s.tv_archive }));
    S.items.movie = (ms || []).map((s) => ({ type: 'movie', id: s.stream_id, name: s.name, logo: s.stream_icon, group: mcm[s.category_id] || 'Autres', ext: s.container_extension, rating: s.rating, added: +s.added || 0 }));
    S.items.series = (ss || []).map((s) => ({ type: 'series', id: s.series_id, name: s.name, logo: s.cover, group: scm[s.category_id] || 'Autres', rating: s.rating, plot: s.plot, added: +s.last_modified || 0 }));
    S.cats.live = (lc || []).map((c) => c.category_name);
    S.cats.movie = (mc || []).map((c) => c.category_name);
    S.cats.series = (sc || []).map((c) => c.category_name);
    S.account = auth.user_info;
    // EPG XMLTV complet en arrière-plan
    loadXmltv(`${X.base(p)}/xmltv.php?username=${encodeURIComponent(p.username)}&password=${encodeURIComponent(p.password)}`).catch(() => {});
  },
};

/* ---------- M3U ---------- */
function parseM3U(text) {
  const lines = text.split(/\r?\n/);
  const out = { live: [], movie: [], series: [] }, cats = { live: new Set(), movie: new Set(), series: new Set() };
  let meta = null, epgUrl = null, n = 0;
  const attr = (s, k) => (s.match(new RegExp(k + '="([^"]*)"', 'i')) || [])[1];
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    if (l.startsWith('#EXTM3U')) { epgUrl = attr(l, 'x-tvg-url') || attr(l, 'url-tvg'); continue; }
    if (l.startsWith('#EXTINF')) {
      const name = l.slice(l.lastIndexOf(',') + 1).trim();
      meta = { name: attr(l, 'tvg-name') && !name ? attr(l, 'tvg-name') : name, logo: attr(l, 'tvg-logo'), group: attr(l, 'group-title') || 'Autres', epgId: attr(l, 'tvg-id') };
      continue;
    }
    if (l.startsWith('#EXTGRP:') && meta) { meta.group = l.slice(8).trim(); continue; }
    if (l.startsWith('#')) continue;
    if (!meta) meta = { name: l.split('/').pop(), group: 'Autres' };
    const type = /\/series\//i.test(l) ? 'series' : /\/movie\//i.test(l) || /\.(mp4|mkv|avi|mov)(\?|$)/i.test(l) ? 'movie' : 'live';
    const it = { ...meta, type, id: 'm' + ++n, url: l, num: n };
    if (type === 'series') { // regroupe les épisodes "Nom S01 E02"
      const m = it.name.match(/^(.*?)[\s._-]*S(\d+)[\s._-]*E(\d+)/i);
      const sname = m ? m[1].trim() : it.name;
      let s = out.series.find((x) => x.name === sname && x.group === it.group);
      if (!s) out.series.push(s = { type: 'series', id: 's' + n, name: sname, logo: it.logo, group: it.group, episodes: [] });
      s.episodes.push({ id: it.id, title: it.name, season: m ? +m[2] : 1, episode: m ? +m[3] : s.episodes.length + 1, url: l, img: it.logo });
    } else out[type].push(it);
    cats[type].add(it.group);
    meta = null;
  }
  S.items = out;
  S.cats = { live: [...cats.live], movie: [...cats.movie], series: [...cats.series] };
  return epgUrl;
}

/* ---------- EPG ---------- */
function parseXmltvDate(s) {
  const m = s.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);
  if (!m) return 0;
  const tz = m[7] ? (m[7][0] === '-' ? -1 : 1) * (+m[7].slice(1, 3) * 60 + +m[7].slice(3)) : 0;
  return Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - tz * 60000;
}
async function loadXmltv(url) {
  if (!url) return;
  const xml = new DOMParser().parseFromString(await getText(url), 'text/xml');
  const now = Date.now(), map = new Map();
  for (const p of xml.getElementsByTagName('programme')) {
    const stop = parseXmltvDate(p.getAttribute('stop'));
    if (stop < now - 3600e3 || stop > now + 2 * 86400e3) continue;
    const ch = p.getAttribute('channel');
    if (!map.has(ch)) map.set(ch, []);
    map.get(ch).push({ start: parseXmltvDate(p.getAttribute('start')), stop, title: p.getElementsByTagName('title')[0]?.textContent || '', desc: p.getElementsByTagName('desc')[0]?.textContent || '' });
  }
  map.forEach((a) => a.sort((x, y) => x.start - y.start));
  S.epg = map;
  if (S.section === 'live' || S.section === 'home') render();
}
async function epgFor(it) {
  let list = it.epgId && S.epg.get(it.epgId);
  if ((!list || !list.length) && S.profile.type === 'xtream') {
    try {
      const r = await getJSON(X.api(S.profile, 'get_short_epg', `&stream_id=${it.id}&limit=4`));
      list = (r.epg_listings || []).map((e) => ({ start: e.start_timestamp * 1000, stop: e.stop_timestamp * 1000, title: b64(e.title), desc: b64(e.description) }));
      if (it.epgId) S.epg.set(it.epgId, list);
    } catch {}
  }
  const now = Date.now();
  return (list || []).filter((p) => p.stop > now).slice(0, 4);
}
function nowNext(it) {
  const list = it.epgId && S.epg.get(it.epgId);
  if (!list) return null;
  const now = Date.now();
  const i = list.findIndex((p) => p.start <= now && p.stop > now);
  return i < 0 ? null : { cur: list[i], next: list[i + 1] };
}

/* ---------- Connexion ---------- */
let loginMode = 'xtream';
document.querySelectorAll('.tab').forEach((b) => b.onclick = () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === b));
  loginMode = b.dataset.mode;
  document.querySelectorAll('.mode').forEach((m) => m.classList.toggle('hidden', !m.classList.contains('mode-' + loginMode)));
});
$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), err = $('#loginError');
  err.textContent = '';
  const p = { id: Date.now().toString(36), name: f.get('name') || 'Playlist', type: loginMode };
  if (loginMode === 'xtream') {
    p.server = f.get('server').trim(); p.username = f.get('username').trim(); p.password = f.get('password');
    if (!/^https?:\/\//.test(p.server)) p.server = 'http://' + p.server;
    if (!p.username) return err.textContent = 'Utilisateur requis';
  } else if (loginMode === 'm3u') {
    p.m3u = f.get('m3u').trim(); p.epg = f.get('epg').trim();
    if (!p.m3u) return err.textContent = 'Lien M3U requis';
  } else {
    const file = f.get('file');
    if (!file || !file.size) return err.textContent = 'Choisissez un fichier';
    p.text = await file.text();
  }
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Chargement…';
  try {
    await openProfile(p);
    const list = store.get('profiles', []).filter((x) => x.name !== p.name);
    if (p.type === 'file') { try { localStorage.setItem('ouitv:file:' + p.id, p.text); } catch {} delete p.text; }
    store.set('profiles', [p, ...list]);
  } catch (ex) {
    err.textContent = /fetch|network|cors/i.test(ex.message) ? 'Connexion impossible (serveur injoignable ou bloqué par CORS/HTTP mixte).' : ex.message;
  } finally { btn.disabled = false; btn.textContent = 'Se connecter'; }
};
async function openProfile(p) {
  S.profile = p; S.epg = new Map();
  if (p.type === 'xtream') await X.load(p);
  else {
    const text = p.type === 'file' ? (p.text || localStorage.getItem('ouitv:file:' + p.id) || '') : await getText(p.m3u);
    if (!text.includes('#EXT')) throw new Error('Playlist M3U invalide');
    const embedded = parseM3U(text);
    loadXmltv(p.epg || embedded).catch(() => {});
  }
  store.set('last', p.id);
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  go('home');
}
function renderProfiles() {
  const list = store.get('profiles', []);
  $('#savedProfiles').innerHTML = list.length ? '<p class="muted">Playlists enregistrées</p>' + list.map((p, i) => `<div class="profile"><b>${esc(p.name)}</b><span class="muted">${p.type}</span><button class="ghost" data-open="${i}">Ouvrir</button><button class="ghost" data-del="${i}">✕</button></div>`).join('') : '';
  $('#savedProfiles').onclick = async (e) => {
    const o = e.target.dataset.open, d = e.target.dataset.del;
    if (d != null) { list.splice(d, 1); store.set('profiles', list); return renderProfiles(); }
    if (o != null) { e.target.textContent = '…'; try { await openProfile(list[o]); } catch (ex) { $('#loginError').textContent = ex.message; e.target.textContent = 'Ouvrir'; } }
  };
}
$('#logout').onclick = () => { $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); store.set('last', null); renderProfiles(); };

/* ---------- Navigation ---------- */
document.querySelectorAll('.sections button').forEach((b) => b.onclick = () => go(b.dataset.section));
let qT;
$('#search').oninput = (e) => { clearTimeout(qT); qT = setTimeout(() => { S.query = e.target.value.trim().toLowerCase(); S.view = null; render(); }, 150); };
function go(section) {
  S.section = section; S.cat = '*'; S.view = null;
  document.querySelectorAll('.sections button').forEach((b) => b.classList.toggle('active', b.dataset.section === section));
  render();
}

function render() {
  renderCats();
  const c = $('#content');
  if (S.view) return renderDetail(c, S.view);
  if (S.query) return renderSearch(c);
  if (S.section === 'home') return renderHome(c);
  if (S.section === 'fav') return renderFav(c);
  let items = S.items[S.section];
  if (S.cat !== '*') items = items.filter((x) => x.group === S.cat);
  c.innerHTML = `<h2>${esc(S.cat === '*' ? 'Tout' : S.cat)} <span class="muted">· ${items.length}</span></h2>`;
  c.appendChild(S.section === 'live' ? channelList(items) : grid(items));
}
function renderCats() {
  const el = $('#categories'), sec = S.section;
  if (!S.items[sec] || S.query) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const count = {}; S.items[sec].forEach((x) => count[x.group] = (count[x.group] || 0) + 1);
  const cats = S.cats[sec].filter((c) => count[c]);
  el.innerHTML = [['*', 'Tout', S.items[sec].length], ...cats.map((c) => [c, c, count[c]])]
    .map(([v, l, n]) => `<button data-cat="${esc(v)}" class="${S.cat === v ? 'active' : ''}"><span>${esc(l)}</span><small>${n}</small></button>`).join('');
  el.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.cat = b.dataset.cat; S.view = null; render(); $('#content').scrollTop = 0; };
}

/* Listes paginées (milliers d'éléments) */
function lazy(container, items, make, step = 120) {
  let i = 0;
  const more = () => { const frag = document.createDocumentFragment(); items.slice(i, i += step).forEach((x) => frag.appendChild(make(x))); container.appendChild(frag); };
  more();
  if (items.length > step) {
    const sentinel = document.createElement('div');
    container.after(sentinel);
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { more(); if (i >= items.length) io.disconnect(); } }, { root: $('#content'), rootMargin: '800px' });
    io.observe(sentinel);
  }
  if (!items.length) container.innerHTML = '<div class="empty">Aucun élément</div>';
  return container;
}
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };

function card(it) {
  const h = it.pos && it.dur ? `<div class="progress" style="width:${Math.min(100, it.pos / it.dur * 100)}%"></div>` : '';
  const n = el(`<button class="card"><div class="poster" ${it.logo ? `style="background-image:url('${esc(it.logo)}')"` : ''}>${it.logo ? '' : initials(it.name)}</div>${h}
    ${it.rating && +it.rating ? `<span class="badge">★ ${(+it.rating).toFixed(1)}</span>` : ''}
    <div class="meta"><div class="t">${esc(it.name)}</div><div class="s">${esc(it.type === 'live' ? 'Direct' : it.group)}</div></div></button>`);
  n.onclick = () => open(it);
  return n;
}
function grid(items) { return lazy(el('<div class="grid"></div>'), items, card); }
function channelRow(it) {
  const nn = nowNext(it), now = Date.now();
  const pct = nn ? ((now - nn.cur.start) / (nn.cur.stop - nn.cur.start)) * 100 : 0;
  const n = el(`<div class="ch" tabindex="0"><span class="num">${it.num}</span>
    ${it.logo ? `<img loading="lazy" src="${esc(it.logo)}" onerror="this.style.visibility='hidden'">` : '<span class="ph"></span>'}
    <div class="info"><div class="name">${esc(it.name)}</div>
    <div class="now">${nn ? `${hhmm(new Date(nn.cur.start))} ${esc(nn.cur.title)}${nn.next ? ' · ensuite ' + esc(nn.next.title) : ''}` : esc(it.group)}</div>
    ${nn ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}</div>
    <button class="star" title="Favori">${isFav(it) ? '★' : '☆'}</button></div>`);
  n.onclick = (e) => { if (e.target.classList.contains('star')) { e.target.textContent = toggleFav(it) ? '★' : '☆'; return; } play(it, S.lastList); };
  n.onkeydown = (e) => { if (e.key === 'Enter') n.click(); };
  return n;
}
function channelList(items) { S.lastList = items; return lazy(el('<div class="channels"></div>'), items, channelRow, 80); }

function section(title, items, asChannels) {
  if (!items.length) return null;
  const w = el(`<div class="row"><h2>${esc(title)}</h2></div>`);
  w.appendChild(asChannels ? channelList(items) : lazy(el('<div class="scroller"></div>'), items, card, 30));
  return w;
}
function renderHome(c) {
  const a = S.account;
  c.innerHTML = `<div class="hero"><h1>Bonsoir 👋</h1><p class="muted">${esc(S.profile.name)}${a?.exp_date ? ' · expire le ' + new Date(a.exp_date * 1000).toLocaleDateString('fr-FR') : ''}</p>
    <div class="stats"><div><b>${S.items.live.length}</b><span class="muted">chaînes</span></div><div><b>${S.items.movie.length}</b><span class="muted">films</span></div><div><b>${S.items.series.length}</b><span class="muted">séries</span></div></div></div>`;
  const h = history();
  const byAdded = (arr) => [...arr].sort((x, y) => (y.added || 0) - (x.added || 0)).slice(0, 30);
  [section('Reprendre la lecture', h.filter((x) => x.type !== 'live' && x.pos > 30 && x.pos < x.dur * 0.95)),
   section('Chaînes récentes', h.filter((x) => x.type === 'live').slice(0, 8), true),
   section('Favoris', Object.values(favs()).slice(0, 30)),
   section('Films ajoutés récemment', byAdded(S.items.movie)),
   section('Séries mises à jour', byAdded(S.items.series)),
  ].forEach((s) => s && c.appendChild(s));
}
function renderFav(c) {
  const f = Object.values(favs());
  c.innerHTML = '<h2>Favoris</h2>';
  if (!f.length) return c.insertAdjacentHTML('beforeend', '<div class="empty">Ajoutez des chaînes, films ou séries avec ☆</div>');
  [section('Chaînes', f.filter((x) => x.type === 'live'), true), section('Films', f.filter((x) => x.type === 'movie')), section('Séries', f.filter((x) => x.type === 'series'))].forEach((s) => s && c.appendChild(s));
}
function renderSearch(c) {
  const q = S.query.normalize('NFD').replace(/\p{M}/gu, '');
  const m = (x) => x.name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').includes(q);
  c.innerHTML = `<h2>Résultats pour « ${esc(S.query)} »</h2>`;
  const parts = [section('Chaînes', S.items.live.filter(m).slice(0, 100), true), section('Films', S.items.movie.filter(m).slice(0, 100)), section('Séries', S.items.series.filter(m).slice(0, 100))].filter(Boolean);
  parts.length ? parts.forEach((p) => c.appendChild(p)) : c.insertAdjacentHTML('beforeend', '<div class="empty">Aucun résultat</div>');
}

/* ---------- Détail film / série ---------- */
async function open(it) {
  if (it.type === 'live') return play(it, S.items.live.filter((x) => x.group === it.group));
  S.view = it; render(); $('#content').scrollTop = 0;
}
async function renderDetail(c, it) {
  c.innerHTML = `<button class="ghost" id="back">← Retour</button><div class="detail"><div class="poster" ${it.logo ? `style="background-image:url('${esc(it.logo)}')"` : ''}></div>
    <div class="txt"><h1>${esc(it.name)}</h1><div class="muted" id="dMeta">${esc(it.group)}</div><p id="dPlot">${esc(it.plot || '')}</p>
    <div class="actions"><button class="primary" id="dPlay">▶ Lecture</button><button class="ghost" id="dFav">${isFav(it) ? '★ Favori' : '☆ Favori'}</button></div></div></div><div id="dEps"></div>`;
  $('#back').onclick = () => { S.view = null; render(); };
  $('#dFav').onclick = (e) => e.target.textContent = toggleFav(it) ? '★ Favori' : '☆ Favori';
  const prev = history().find((x) => key(x) === key(it));
  if (it.type === 'movie') {
    $('#dPlay').textContent = prev?.pos > 30 ? `▶ Reprendre à ${fmt(prev.pos)}` : '▶ Lecture';
    $('#dPlay').onclick = () => play(it, null, prev?.pos);
    if (S.profile.type === 'xtream') getJSON(X.api(S.profile, 'get_vod_info', '&vod_id=' + it.id)).then((r) => {
      const i = r.info || {};
      if (S.view !== it) return;
      $('#dMeta').textContent = [i.releasedate || i.year, i.genre, i.duration, i.director && 'De ' + i.director].filter(Boolean).join(' · ');
      $('#dPlot').textContent = i.plot || i.description || '';
    }).catch(() => {});
    return;
  }
  // Série
  let eps = it.episodes;
  if (!eps && S.profile.type === 'xtream') {
    $('#dEps').innerHTML = '<div class="empty">Chargement des épisodes…</div>';
    try {
      const r = await getJSON(X.api(S.profile, 'get_series_info', '&series_id=' + it.id));
      eps = Object.values(r.episodes || {}).flat().map((e) => ({ id: e.id, title: e.title, season: +e.season, episode: +e.episode_num, ext: e.container_extension, img: e.info?.movie_image, plot: e.info?.plot, dur: e.info?.duration }));
      const i = r.info || {};
      $('#dMeta').textContent = [i.releaseDate, i.genre, i.cast && 'Avec ' + i.cast.split(',').slice(0, 3).join(',')].filter(Boolean).join(' · ');
      if (i.plot) $('#dPlot').textContent = i.plot;
    } catch { eps = []; }
    it.episodes = eps;
  }
  if (S.view !== it) return;
  const seasons = [...new Set(eps.map((e) => e.season))].sort((a, b) => a - b);
  const watched = history().find((x) => x.seriesId === it.id && x.type === 'episode');
  let cur = watched?.season ?? seasons[0];
  const epItem = (e) => ({ type: 'episode', id: e.id, name: `${it.name} — S${e.season}E${e.episode}`, logo: it.logo, seriesId: it.id, season: e.season, ext: e.ext, url: e.url, group: it.name });
  const drawSeason = () => {
    const list = eps.filter((e) => e.season === cur).sort((a, b) => a.episode - b.episode);
    $('#dEps').innerHTML = `<div class="seasons">${seasons.map((s) => `<button data-s="${s}" class="${s === cur ? 'active' : ''}">Saison ${s}</button>`).join('')}</div>`;
    $('#dEps .seasons').onclick = (e) => { if (e.target.dataset.s) { cur = +e.target.dataset.s; drawSeason(); } };
    const queue = list.map(epItem);
    list.forEach((e, i) => {
      const h = history().find((x) => x.type === 'episode' && x.id === e.id);
      const b = el(`<button class="ep"><img loading="lazy" src="${esc(e.img || it.logo || '')}" onerror="this.style.visibility='hidden'"><div><b>${e.episode}. ${esc(e.title)}</b><div class="muted">${esc(e.dur || '')}${h?.dur ? ` · vu ${Math.round(h.pos / h.dur * 100)}%` : ''}</div><p class="muted">${esc((e.plot || '').slice(0, 180))}</p></div></button>`);
      b.onclick = () => play(queue[i], queue, h?.pos);
      $('#dEps').appendChild(b);
    });
  };
  if (!eps.length) { $('#dEps').innerHTML = '<div class="empty">Aucun épisode</div>'; return; }
  drawSeason();
  $('#dPlay').textContent = watched ? `▶ Reprendre S${watched.season}` : '▶ Lecture';
  $('#dPlay').onclick = () => {
    const sorted = [...eps].sort((a, b) => a.season - b.season || a.episode - b.episode).map(epItem);
    const start = watched ? sorted.findIndex((x) => x.id === watched.id) : 0;
    play(sorted[Math.max(0, start)], sorted, watched?.pos);
  };
}

/* ---------- Lecteur ---------- */
const V = $('#video'), P = $('#player');
let hls = null, mts = null, current = null, queue = null, saveT = null, idleT = null;
function urlFor(it) {
  if (it.url) return it.url;
  return X.stream(S.profile, it.type === 'episode' ? 'series' : it.type, it.id, it.ext);
}
function destroy() {
  if (hls) { hls.destroy(); hls = null; }
  if (mts) { try { mts.destroy(); } catch {} mts = null; }
  V.removeAttribute('src'); V.load();
}
function play(it, list, startAt) {
  current = it; queue = list || null;
  P.classList.remove('hidden');
  $('#pError').classList.add('hidden'); $('#pLoading').classList.remove('hidden');
  $('#pTitle').textContent = it.name;
  $('#pSub').textContent = it.type === 'live' ? `${it.num ? it.num + ' · ' : ''}${it.group}` : it.group || '';
  $('#pFav').textContent = isFav(it.type === 'episode' ? { ...it, type: 'series', id: it.seriesId } : it) ? '★' : '☆';
  $('#pDur').textContent = it.type === 'live' ? 'LIVE' : '';
  $('#pSeek').classList.toggle('hidden', it.type === 'live');
  $('#pEpg').innerHTML = '';
  destroy();
  const url = urlFor(it), live = it.type === 'live';
  const fail = (m) => { $('#pLoading').classList.add('hidden'); $('#pError').classList.remove('hidden'); $('#pError').innerHTML = `<b>Lecture impossible</b><p class="muted">${esc(m)}</p><br><button class="primary" id="pRetry">Réessayer</button>`; $('#pRetry').onclick = () => play(it, list, startAt); };
  const isHls = /\.m3u8(\?|$)/i.test(url) || (live && S.profile.type === 'xtream');
  const isTs = /\.ts(\?|$)/i.test(url) || (live && !isHls && !/\.(mp4|mkv)/i.test(url));
  if (isHls && window.Hls?.isSupported()) {
    hls = new Hls({ lowLatencyMode: live, backBufferLength: 30, maxBufferLength: live ? 20 : 60 });
    hls.loadSource(px(url)); hls.attachMedia(V);
    hls.on(Hls.Events.MANIFEST_PARSED, () => { setupTracks(); V.play().catch(() => {}); });
    let recov = 0;
    hls.on(Hls.Events.ERROR, (_, d) => {
      if (!d.fatal) return;
      if (recov++ < 3) { d.type === Hls.ErrorTypes.MEDIA_ERROR ? hls.recoverMediaError() : hls.startLoad(); return; }
      if (live && window.mpegts && S.profile.type === 'xtream' && !it._ts) return play({ ...it, _ts: true, url: url.replace(/\.m3u8$/, '.ts') }, list);
      fail('Flux indisponible (' + d.details + ')');
    });
  } else if (isTs && window.mpegts?.isSupported()) {
    mts = mpegts.createPlayer({ type: 'mpegts', isLive: live, url: px(url) }, { enableWorker: true, liveBufferLatencyChasing: true });
    mts.attachMediaElement(V); mts.load(); V.play().catch(() => {});
    mts.on(mpegts.Events.ERROR, (t, d) => fail(`${t} ${d}`));
  } else {
    V.src = px(url); V.play().catch(() => {});
  }
  V.onloadedmetadata = () => { if (startAt > 10 && isFinite(V.duration)) V.currentTime = startAt; };
  V.onerror = () => { if (!hls && !mts) fail('Format non pris en charge par ce navigateur'); };
  if (live) showEpg(it);
  pushHistory(it.type === 'episode' ? it : it, startAt || 0, 0);
  clearInterval(saveT);
  if (!live) saveT = setInterval(() => { if (V.currentTime > 5) pushHistory(it, V.currentTime, V.duration || 0); }, 5000);
  wake();
}
async function showEpg(it) {
  const progs = await epgFor(it);
  if (current !== it || !progs.length) return;
  $('#pEpg').innerHTML = `<div class="prog">${progs.slice(0, 2).map((p, i) => `<div><b>${i ? 'Ensuite' : 'Maintenant'} · ${hhmm(new Date(p.start))}–${hhmm(new Date(p.stop))}</b> ${esc(p.title)}${i ? '' : `<p class="muted">${esc(p.desc.slice(0, 200))}</p>`}</div>`).join('')}</div>`;
}
function setupTracks() {
  const q = $('#quality'), a = $('#audioTracks');
  if (hls?.levels?.length > 1) {
    q.innerHTML = '<option value="-1">Auto</option>' + hls.levels.map((l, i) => `<option value="${i}">${l.height ? l.height + 'p' : Math.round(l.bitrate / 1000) + 'k'}</option>`).join('');
    q.classList.remove('hidden'); q.onchange = () => hls.currentLevel = +q.value;
  } else q.classList.add('hidden');
  if (hls?.audioTracks?.length > 1) {
    a.innerHTML = hls.audioTracks.map((t, i) => `<option value="${i}">${esc(t.name || t.lang || 'Piste ' + (i + 1))}</option>`).join('');
    a.value = hls.audioTrack; a.classList.remove('hidden'); a.onchange = () => hls.audioTrack = +a.value;
  } else a.classList.add('hidden');
}
function closePlayer() {
  if (current && current.type !== 'live' && V.currentTime > 5) pushHistory(current, V.currentTime, V.duration || 0);
  clearInterval(saveT); destroy(); P.classList.add('hidden');
  if (document.fullscreenElement) document.exitFullscreen();
  current = null; render();
}
function zap(dir) {
  if (!queue?.length || !current) return;
  const i = queue.findIndex((x) => x.id === current.id);
  const nx = queue[(i + dir + queue.length) % queue.length];
  if (current.type === 'live') { $('#pZap').textContent = nx.num || ''; clearTimeout(zap.t); zap.t = setTimeout(() => $('#pZap').textContent = '', 1500); }
  play(nx, queue);
}
V.addEventListener('playing', () => { $('#pLoading').classList.add('hidden'); $('#pPlay').textContent = '⏸'; });
V.addEventListener('waiting', () => $('#pLoading').classList.remove('hidden'));
V.addEventListener('pause', () => $('#pPlay').textContent = '▶');
V.addEventListener('timeupdate', () => {
  $('#pTime').textContent = fmt(V.currentTime);
  if (current?.type !== 'live' && isFinite(V.duration)) { $('#pDur').textContent = fmt(V.duration); $('#pSeek').value = V.currentTime / V.duration * 1000; }
});
V.addEventListener('ended', () => { if (current?.type === 'episode' && queue) { toast('Épisode suivant'); zap(1); } });
$('#pSeek').oninput = (e) => { if (isFinite(V.duration)) V.currentTime = e.target.value / 1000 * V.duration; };
$('#pPlay').onclick = () => V.paused ? V.play() : V.pause();
$('#pBack').onclick = () => V.currentTime -= 10;
$('#pFwd').onclick = () => V.currentTime += 30;
$('#pMute').onclick = () => { V.muted = !V.muted; $('#pMute').textContent = V.muted ? '🔇' : '🔊'; };
$('#pFull').onclick = () => document.fullscreenElement ? document.exitFullscreen() : P.requestFullscreen?.();
$('#pPip').onclick = () => document.pictureInPictureElement ? document.exitPictureInPicture() : V.requestPictureInPicture?.().catch(() => toast('PiP indisponible'));
$('#pFav').onclick = () => { const it = current.type === 'episode' ? { ...current, type: 'series', id: current.seriesId, name: current.group } : current; $('#pFav').textContent = toggleFav(it) ? '★' : '☆'; };
$('#closePlayer').onclick = closePlayer;
V.onclick = () => V.paused ? V.play() : V.pause();
V.ondblclick = () => $('#pFull').click();
function wake() { P.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => !V.paused && P.classList.add('idle'), 3500); }
['mousemove', 'touchstart'].forEach((ev) => P.addEventListener(ev, wake, { passive: true }));

/* Clavier / télécommande */
let digits = '', digitT;
document.addEventListener('keydown', (e) => {
  if (P.classList.contains('hidden')) {
    if (e.key === '/' && document.activeElement !== $('#search')) { e.preventDefault(); $('#search').focus(); }
    return;
  }
  if (e.target.tagName === 'SELECT') return;
  wake();
  const live = current?.type === 'live';
  switch (e.key) {
    case 'Escape': case 'Backspace': case 'BrowserBack': e.preventDefault(); closePlayer(); break;
    case ' ': case 'Enter': case 'MediaPlayPause': e.preventDefault(); $('#pPlay').click(); break;
    case 'ArrowUp': case 'ChannelUp': case 'PageUp': e.preventDefault(); live ? zap(-1) : (V.volume = Math.min(1, V.volume + 0.1)); break;
    case 'ArrowDown': case 'ChannelDown': case 'PageDown': e.preventDefault(); live ? zap(1) : (V.volume = Math.max(0, V.volume - 0.1)); break;
    case 'ArrowLeft': if (!live) V.currentTime -= 10; break;
    case 'ArrowRight': if (!live) V.currentTime += 30; break;
    case 'f': $('#pFull').click(); break;
    case 'm': $('#pMute').click(); break;
    default:
      if (live && /^\d$/.test(e.key) && queue) { // saisie du numéro de chaîne
        digits += e.key; $('#pZap').textContent = digits; clearTimeout(digitT);
        digitT = setTimeout(() => { const t = S.items.live.find((x) => String(x.num) === digits); digits = ''; $('#pZap').textContent = ''; if (t) play(t, S.items.live); else toast('Chaîne introuvable'); }, 1200);
      }
  }
});

/* ---------- Démarrage ---------- */
(async () => {
  renderProfiles();
  const last = store.get('last'), p = store.get('profiles', []).find((x) => x.id === last);
  if (p) try { await openProfile(p); } catch { /* reste sur l'écran de connexion */ }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();

/* Pont Android : bouton Retour et image dans l'image */
window.ouiBack = () => {
  if (!P.classList.contains('hidden')) { closePlayer(); return true; }
  if (S.view) { S.view = null; render(); return true; }
  if (S.query) { $('#search').value = ''; S.query = ''; render(); return true; }
  if (!$('#app').classList.contains('hidden') && S.section !== 'home') { go('home'); return true; }
  return false;
};
window.ouiPlaying = () => !P.classList.contains('hidden') && !V.paused;

/* ---------- Télécommande TV (navigation aux flèches) ---------- */
const BACK_KEYS = new Set([8, 27, 461, 10009, 166]);
const focusables = () => [...document.querySelectorAll('.screen:not(.hidden) button, .screen:not(.hidden) input, .screen:not(.hidden) select, .screen:not(.hidden) .ch')]
  .filter((n) => n.offsetParent !== null && !n.disabled);
function moveFocus(dir) {
  const cur = document.activeElement, all = focusables();
  if (!cur || cur === document.body || !all.includes(cur)) { all[0]?.focus(); return; }
  const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestD = Infinity;
  for (const n of all) {
    if (n === cur) continue;
    const b = n.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const dx = bx - ax, dy = by - ay;
    const ok = dir === 'left' ? dx < -2 : dir === 'right' ? dx > 2 : dir === 'up' ? dy < -2 : dy > 2;
    if (!ok) continue;
    const main = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy);
    const side = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const d = main + side * 3;
    if (d < bestD) { bestD = d; best = n; }
  }
  if (best) { best.focus({ preventScroll: true }); best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
}
document.addEventListener('keydown', (e) => {
  const inPlayer = !P.classList.contains('hidden');
  if (inPlayer) {
    if (BACK_KEYS.has(e.keyCode) && e.key !== 'Escape' && e.key !== 'Backspace') { e.preventDefault(); closePlayer(); }
    if (e.keyCode === 427) zap(-1); if (e.keyCode === 428) zap(1); // CH+/CH- de certaines TV
    return;
  }
  const t = e.target, typing = t.tagName === 'INPUT' && t.type !== 'file';
  const dirs = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  if (dirs[e.key]) {
    if (typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && t.value) return;
    e.preventDefault(); moveFocus(dirs[e.key]); return;
  }
  if (BACK_KEYS.has(e.keyCode) && !(typing && e.keyCode === 8)) { e.preventDefault(); window.ouiBack(); setTimeout(() => focusables()[0]?.focus(), 50); }
});
// Donne le focus au premier élément pour que la télécommande fonctionne dès l'ouverture
setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) focusables()[0]?.focus(); }, 600);
