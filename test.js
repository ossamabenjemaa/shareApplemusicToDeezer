/*
 * test.js — tests hors-ligne du moteur (aucun appel réseau).
 *   node --test test.js
 * Analyse de liens (parseMusicLink) + paliers de fiabilité via un
 * transport simulé injecté dans convert().
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMusicLink, convert } = require('./converter.js');

/* ---------------------- parseMusicLink ---------------------- */

test('apple : lien album?i= → titre', () => {
  const p = parseMusicLink('https://music.apple.com/fr/album/ghost/1634875613?i=1634875617');
  assert.deepEqual([p.platform, p.kind, p.id, p.country], ['apple', 'track', '1634875617', 'fr']);
});

test('apple : ponctuation collée au lien → toujours un titre', () => {
  const p = parseMusicLink('écoute ça https://music.apple.com/fr/album/ghost/1634875613?i=1634875617, top !');
  assert.deepEqual([p.kind, p.id], ['track', '1634875617']);
});

test('schéma en majuscules HTTPS:// accepté', () => {
  const p = parseMusicLink('HTTPS://music.apple.com/fr/album/ghost/1634875613?i=1634875617');
  assert.equal(p.id, '1634875617');
});

test('apple : format /song/', () => {
  const p = parseMusicLink('https://music.apple.com/fr/song/ghost/1634875617');
  assert.deepEqual([p.kind, p.id], ['track', '1634875617']);
});

test('apple : album sans ?i=, chemin en casse mélangée', () => {
  const p = parseMusicLink('https://music.apple.com/FR/Album/diamonds-dancefloors/1634875613');
  assert.deepEqual([p.kind, p.id, p.country], ['album', '1634875613', 'fr']);
});

test('deezer : titre avec langue et paramètres', () => {
  const p = parseMusicLink('https://www.deezer.com/fr/track/2096231467?autoplay=true');
  assert.deepEqual([p.platform, p.kind, p.id, p.lang], ['deezer', 'track', '2096231467', 'fr']);
});

test('deezer : album sans langue', () => {
  const p = parseMusicLink('https://www.deezer.com/album/393293037');
  assert.deepEqual([p.kind, p.id], ['album', '393293037']);
});

test('playlist → message dédié', () => {
  assert.throws(() => parseMusicLink('https://www.deezer.com/fr/playlist/1282495565'), /playlists sont hors périmètre/);
});

test('artiste → message dédié', () => {
  assert.throws(() => parseMusicLink('https://music.apple.com/fr/artist/ava-max/1442059710'), /pages d'artiste/);
});

test('spotify → repli song.link attaché', () => {
  try {
    parseMusicLink('https://open.spotify.com/track/2tHwzyyOLoWSFqYNjeVMzj');
    assert.fail('aurait dû lever');
  } catch (e) {
    assert.match(e.message, /Spotify/);
    assert.match(e.searchUrl, /^https:\/\/song\.link\//);
  }
});

test('plateforme inconnue → repli song.link attaché', () => {
  try {
    parseMusicLink('https://tidal.com/browse/track/12345');
    assert.fail('aurait dû lever');
  } catch (e) {
    assert.match(e.searchUrl, /^https:\/\/song\.link\//);
  }
});

test('texte sans lien → message clair', () => {
  assert.throws(() => parseMusicLink('pas de lien ici'), /Aucun lien détecté/);
});

/* ----------------- convert() avec transport simulé ----------------- */

const GHOST_APPLE = {
  resultCount: 1,
  results: [{ kind: 'song', trackName: 'Ghost', artistName: 'Ava Max', collectionName: 'Diamonds & Dancefloors', trackTimeMillis: 181648, trackViewUrl: 'https://music.apple.com/fr/album/ghost/1634875613?i=1634875617&uo=4', artworkUrl100: 'https://a/100.jpg' }]
};

function stub(routes) {
  return function (url) {
    for (const [frag, resp] of routes) {
      if (url.indexOf(frag) !== -1) return Promise.resolve(typeof resp === 'function' ? resp(url) : resp);
    }
    return Promise.reject(new Error('route non simulée : ' + url));
  };
}

test('palier « exacte » : titre + artiste + durée concordants', async () => {
  const fetchJson = stub([
    ['itunes.apple.com/lookup', GHOST_APPLE],
    ['api.deezer.com/search', { data: [{ id: 1, title: 'Ghost', duration: 181, link: 'https://www.deezer.com/track/1', artist: { name: 'Ava Max' }, album: { title: 'Diamonds & Dancefloors', cover_medium: 'https://c/250x250-x.jpg' } }] }]
  ]);
  const r = await convert('https://music.apple.com/fr/album/ghost/1634875613?i=1634875617', { fetchJson });
  assert.equal(r.target.confidence, 'exacte');
  assert.equal(r.target.url, 'https://www.deezer.com/track/1');
  assert.match(r.target.artwork, /120x120/);
  assert.ok(r.extras && r.extras.youtube.indexOf('Ava%20Max%20Ghost') !== -1);
});

test('palier « probable » : titre avec (feat.) côté candidat', async () => {
  const fetchJson = stub([
    ['itunes.apple.com/lookup', { results: [{ kind: 'song', trackName: 'Let Me Love You', artistName: 'DJ Snake', collectionName: 'Encore', trackTimeMillis: 205000, trackViewUrl: 'https://music.apple.com/fr/album/x/1?i=2', artworkUrl100: 'a' }] }],
    ['api.deezer.com/search', { data: [{ id: 9, title: 'Let Me Love You (feat. Justin Bieber)', duration: 205, link: 'https://www.deezer.com/track/9', artist: { name: 'DJ Snake' }, album: { title: 'Encore' } }] }]
  ]);
  const r = await convert('https://music.apple.com/fr/album/x/1?i=2', { fetchJson });
  assert.equal(r.target.confidence, 'probable');
});

test('aucun candidat crédible → erreur avec lien de recherche manuelle', async () => {
  const fetchJson = stub([
    ['itunes.apple.com/lookup', GHOST_APPLE],
    ['api.deezer.com/search', { data: [{ id: 3, title: 'Autre chose', duration: 999, link: 'https://www.deezer.com/track/3', artist: { name: 'Personne' }, album: {} }] }]
  ]);
  await assert.rejects(
    convert('https://music.apple.com/fr/album/ghost/1634875613?i=1634875617', { fetchJson }),
    (e) => /Pas de correspondance fiable/.test(e.message) && /deezer\.com\/search/.test(e.searchUrl)
  );
});

test('album Deezer → Apple par UPC = exacte', async () => {
  const fetchJson = stub([
    ['api.deezer.com/album/393293037', { id: 393293037, title: 'Diamonds & Dancefloors', upc: '075679733535', nb_tracks: 14, link: 'https://www.deezer.com/album/393293037', artist: { name: 'Ava Max' }, cover_medium: 'https://c/250x250-x.jpg' }],
    ['itunes.apple.com/lookup?upc=', { results: [{ wrapperType: 'collection', collectionName: 'Diamonds & Dancefloors', artistName: 'Ava Max', trackCount: 14, collectionViewUrl: 'https://music.apple.com/fr/album/x/1634875613?uo=4', artworkUrl100: 'a' }] }]
  ]);
  const r = await convert('https://www.deezer.com/fr/album/393293037', { fetchJson });
  assert.equal(r.target.confidence, 'exacte');
  assert.equal(r.target.via, 'UPC');
  assert.ok(r.target.url.indexOf('uo=') === -1);
});

test('cible youtube : lien de recherche sans appel à la plateforme cible', async () => {
  const fetchJson = stub([['api.deezer.com/track/2096231467', { id: 2096231467, title: 'Ghost', duration: 181, isrc: 'X', link: 'https://www.deezer.com/track/2096231467', artist: { name: 'Ava Max' }, album: { title: 'D&D', cover_medium: 'c' } }]]);
  const r = await convert('https://www.deezer.com/fr/track/2096231467', { fetchJson, to: 'youtube' });
  assert.equal(r.target.confidence, 'recherche');
  assert.match(r.target.url, /youtube\.com\/results/);
});

test('lien court page.link → message « ne fonctionne plus »', async () => {
  await assert.rejects(
    convert('https://deezer.page.link/abc', { fetchJson: stub([]) }),
    /ne fonctionne plus/
  );
});
