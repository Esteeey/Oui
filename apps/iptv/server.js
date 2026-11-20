#!/usr/bin/env node
/*
 * Oui TV — serveur local pour TV (VIDAA, navigateurs de TV…).
 * Sert l'application et relaie les requêtes IPTV (lève les blocages CORS / HTTP mixte).
 * Aucune dépendance : `node server.js` (Node 18+). Port : PORT=8080 par défaut.
 */
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = +process.env.PORT || 8080;
const ROOT = __dirname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.apk': 'application/vnd.android.package-archive' };
const STATIC = new Set(['/index.html', '/app.js', '/style.css', '/icon.svg', '/manifest.webmanifest', '/OuiTV.apk']);
const UA = 'Mozilla/5.0 (Linux; Android 10) OuiTV/1.0';

function proxied(u) { return '/proxy?url=' + encodeURIComponent(u); }

// Réécrit une playlist HLS pour que segments, clés et sous-playlists passent par le proxy
function rewriteHls(text, base) {
  const abs = (u) => { try { return new URL(u, base).href; } catch { return u; } };
  return text.split(/\r?\n/).map((l) => {
    const t = l.trim();
    if (!t) return l;
    if (t.startsWith('#')) return l.replace(/URI="([^"]+)"/g, (_, u) => `URI="${proxied(abs(u))}"`);
    return proxied(abs(t));
  }).join('\n');
}

function upstream(target, req, res, hops = 0) {
  let url;
  try { url = new URL(target); } catch { res.writeHead(400); return res.end('URL invalide'); }
  if (!/^https?:$/.test(url.protocol)) { res.writeHead(400); return res.end('Protocole refusé'); }
  const headers = { 'User-Agent': UA, Accept: '*/*' };
  if (req.headers.range) headers.Range = req.headers.range;
  const lib = url.protocol === 'https:' ? https : http;
  const up = lib.get(url, { headers, timeout: 20000 }, (r) => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && hops < 6) {
      r.resume();
      return upstream(new URL(r.headers.location, url).href, req, res, hops + 1);
    }
    const ct = String(r.headers['content-type'] || '');
    const isHls = /mpegurl/i.test(ct) || /\.m3u8(\?|$)/i.test(url.pathname);
    const out = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
    if (isHls && r.statusCode < 300) {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        // Ne réécrit que les vraies playlists HLS (pas les grosses listes M3U de chaînes)
        const final = body.includes('#EXT-X-') ? rewriteHls(body, url.href) : body;
        res.writeHead(r.statusCode, { ...out, 'Content-Type': 'application/vnd.apple.mpegurl' });
        res.end(final);
      });
      return;
    }
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) if (r.headers[h]) out[h] = r.headers[h];
    res.writeHead(r.statusCode, out);
    r.pipe(res);
  });
  up.on('timeout', () => up.destroy(new Error('délai dépassé')));
  up.on('error', (e) => { if (!res.headersSent) { res.writeHead(502); res.end('Erreur serveur IPTV : ' + e.message); } else res.destroy(); });
  req.on('close', () => up.destroy());
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/proxy') return upstream(u.searchParams.get('url') || '', req, res);
  if (u.pathname === '/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); return res.end('window.OUI_PROXY=true;'); }
  const p = u.pathname === '/' ? '/index.html' : u.pathname;
  if (!STATIC.has(p)) { res.writeHead(404); return res.end('Introuvable'); }
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); return res.end('Introuvable'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('\n  Oui TV est prêt !\n');
  console.log('  Sur la TV, ouvrez le navigateur et allez à :');
  ips.forEach((ip) => console.log(`     http://${ip}:${PORT}`));
  console.log('\n  (laissez cette fenêtre ouverte pendant que vous regardez)\n');
});
