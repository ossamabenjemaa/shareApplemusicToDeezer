#!/usr/bin/env node
/*
 * cli.js — convertisseur Apple Music ↔ Deezer en ligne de commande.
 *
 *   node cli.js "https://music.apple.com/fr/album/ghost/1634875613?i=1634875617"
 *   node cli.js "https://www.deezer.com/fr/track/2096231467?autoplay=true"
 *
 * Utilise fetch (Node ≥ 18) et bascule sur curl si le réseau direct est
 * indisponible (proxy d'entreprise, etc.). Les liens courts deezer.page.link
 * sont résolus en suivant les redirections.
 */
'use strict';

const { execFileSync } = require('node:child_process');
const { parseMusicLink, convert, platformLabel } = require('./converter.js');

function curlJson(url) {
  const out = execFileSync('curl', ['-sS', '--max-time', '20', url], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  return JSON.parse(out);
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { accept: 'application/json' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (e) {
    return curlJson(url);
  }
}

async function resolveShortLink(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    return res.url;
  } catch (e) {
    return execFileSync(
      'curl',
      ['-sSL', '-o', '/dev/null', '-w', '%{url_effective}', '--max-time', '20', url],
      { encoding: 'utf8' }
    ).trim();
  }
}

function fmtDuration(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = String(Math.round(sec % 60)).padStart(2, '0');
  return ' [' + m + ':' + s + ']';
}

function fmtMeta(x) {
  const bits = [x.title, x.artist, x.album].filter(Boolean).join(' · ');
  return bits + fmtDuration(x.durationSec);
}

async function main() {
  const input = process.argv.slice(2).join(' ').trim();
  if (!input) {
    console.log('Usage : node cli.js <lien Apple Music ou Deezer>');
    console.log('Exemple: node cli.js "https://music.apple.com/fr/album/ghost/1634875613?i=1634875617"');
    process.exit(1);
  }

  let parsed = parseMusicLink(input);
  if (parsed.kind === 'short') {
    const full = await resolveShortLink(parsed.url);
    parsed = parseMusicLink(full);
  }

  const result = await convert(parsed, { fetchJson });
  const kindLabel = result.source.kind === 'album' ? 'album' : 'titre';

  console.log('🎵 Source (' + platformLabel(result.source.platform) + ', ' + kindLabel + ')');
  console.log('   ' + fmtMeta(result.source));
  console.log('');
  console.log('➡️  ' + platformLabel(result.target.platform));
  console.log('   ' + fmtMeta(result.target));
  console.log('   ' + result.target.url);
  console.log('');
  console.log('Fiabilité : ' + result.target.confidence + (result.target.via ? ' (via code ' + result.target.via + ')' : ''));

  if (result.target.confidence !== 'exacte' && result.alternatives.length) {
    console.log('');
    console.log('Autres candidats :');
    for (const alt of result.alternatives) {
      console.log('   - ' + fmtMeta(alt) + ' → ' + alt.url);
    }
  }
}

main().catch((err) => {
  console.error('❌ ' + err.message);
  if (err.searchUrl) console.error('   Recherche manuelle : ' + err.searchUrl);
  process.exit(1);
});
