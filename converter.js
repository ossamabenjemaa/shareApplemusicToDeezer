/*
 * converter.js — cœur du convertisseur de liens Apple Music ↔ Deezer.
 *
 * Fonctionne tel quel dans le navigateur (expose window.MusicConverter)
 * et sous Node (module.exports). Aucune dépendance, aucune clé d'API :
 * uniquement les APIs publiques iTunes (lookup/search) et Deezer.
 *
 * Stratégie de conversion :
 *  - Deezer → Apple (album)  : correspondance exacte par code UPC.
 *  - Deezer → Apple (titre)  : métadonnées Deezer puis recherche iTunes,
 *    classement par titre + artiste + durée.
 *  - Apple → Deezer (titre/album) : métadonnées iTunes puis recherche Deezer
 *    (syntaxe stricte artist:"…" track:"…", repli en recherche libre),
 *    même classement.
 *
 * Le transport réseau est injecté via opts.fetchJson(url, {jsonp}) pour que
 * le navigateur puisse utiliser JSONP avec Deezer (pas de CORS chez eux)
 * et que Node utilise fetch/curl.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.MusicConverter = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ITUNES = 'https://itunes.apple.com';
  var DEEZER = 'https://api.deezer.com';
  var SHORT_HOSTS = ['deezer.page.link', 'dzr.page.link', 'link.deezer.com'];

  /* ------------------------------------------------------------------ */
  /* Analyse du lien collé                                               */
  /* ------------------------------------------------------------------ */

  function parseMusicLink(input) {
    var text = String(input || '').trim();
    var m = text.match(/https?:\/\/[^\s"'<>]+/);
    if (!m) throw new Error('Aucun lien détecté. Colle un lien Apple Music ou Deezer.');
    var url = new URL(m[0]);
    var host = url.hostname.toLowerCase().replace(/^www\./, '');

    if (SHORT_HOSTS.indexOf(host) !== -1) {
      return { platform: 'deezer', kind: 'short', id: null, url: url.href };
    }

    if (host === 'music.apple.com' || host === 'geo.music.apple.com' || host === 'itunes.apple.com') {
      var parts = url.pathname.split('/').filter(Boolean);
      var country = 'fr';
      var i = 0;
      if (parts[0] && /^[a-z]{2}$/i.test(parts[0])) { country = parts[0].toLowerCase(); i = 1; }
      var section = parts[i];
      var last = parts[parts.length - 1] || '';
      var trackParam = url.searchParams.get('i');
      if (section === 'album') {
        var albumId = (last.match(/^(?:id)?(\d+)$/) || [])[1];
        if (trackParam && /^\d+$/.test(trackParam)) {
          return { platform: 'apple', kind: 'track', id: trackParam, country: country, url: url.href };
        }
        if (albumId) return { platform: 'apple', kind: 'album', id: albumId, country: country, url: url.href };
      }
      if (section === 'song') {
        var songId = (last.match(/^(\d+)$/) || [])[1];
        if (songId) return { platform: 'apple', kind: 'track', id: songId, country: country, url: url.href };
      }
      throw new Error("Lien Apple Music non reconnu : il faut un lien de titre ou d'album.");
    }

    if (host === 'deezer.com' || host.slice(-11) === '.deezer.com') {
      var p = url.pathname.split('/').filter(Boolean);
      var j = 0;
      var lang = 'fr';
      if (p[0] && /^[a-z]{2}$/i.test(p[0])) { lang = p[0].toLowerCase(); j = 1; }
      var kind = p[j];
      var id = ((p[j + 1] || '').match(/^(\d+)/) || [])[1];
      if ((kind === 'track' || kind === 'album') && id) {
        return { platform: 'deezer', kind: kind, id: id, lang: lang, url: url.href };
      }
      throw new Error("Lien Deezer non reconnu : il faut un lien de titre ou d'album.");
    }

    throw new Error('Plateforme non reconnue (' + host + '). Seuls Apple Music et Deezer sont gérés.');
  }

  /* ------------------------------------------------------------------ */
  /* Normalisation et score de correspondance                            */
  /* ------------------------------------------------------------------ */

  function stripAccents(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function normBasic(s) {
    return stripAccents(String(s || '').toLowerCase())
      .replace(/[’‘`´]/g, "'")
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9']+/g, ' ')
      .trim();
  }

  // Version tolérante : ignore « (feat. X) », « [Remix] », « - Single »…
  function normLoose(s) {
    var t = String(s || '');
    t = t.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, ' ');
    t = t.replace(/\s*[-–—]\s*(single|ep)\s*$/i, ' ');
    t = t.replace(/\s+(feat\.?|featuring|ft\.?|avec)\s+.*$/i, ' ');
    return normBasic(t);
  }

  // Compare une cible et un candidat : titre (0-4) + artiste (0-3)
  // + durée pour les titres (0-3) ou nombre de pistes pour les albums (0-2).
  function scoreMatch(target, cand) {
    var s = 0;
    var tb = normBasic(target.title);
    var cb = normBasic(cand.title);
    var tl = normLoose(target.title);
    var cl = normLoose(cand.title);
    if (tb && tb === cb) s += 4;
    else if (tl && tl === cl) s += 2;
    else if (tl && cl && (cl.indexOf(tl) !== -1 || tl.indexOf(cl) !== -1)) s += 1;

    var ta = normBasic(target.artist);
    var ca = normBasic(cand.artist);
    if (ta && ta === ca) s += 3;
    else if (ta && ca && (ca.indexOf(ta) !== -1 || ta.indexOf(ca) !== -1)) s += 2;

    if (target.durationSec && cand.durationSec) {
      var d = Math.abs(target.durationSec - cand.durationSec);
      if (d <= 2) s += 3;
      else if (d <= 5) s += 2;
      else if (d <= 10) s += 1;
      else s -= 2;
    }

    if (target.count && cand.count) {
      var dc = Math.abs(target.count - cand.count);
      if (dc === 0) s += 2;
      else if (dc <= 2) s += 1;
    }
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* Petits utilitaires                                                  */
  /* ------------------------------------------------------------------ */

  function q(params) {
    return Object.keys(params)
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');
  }

  function cleanQuotes(s) {
    return String(s || '').replace(/["«»]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Retire le paramètre de tracking « uo » des liens iTunes.
  function cleanAppleUrl(u) {
    if (!u) return u;
    try {
      var x = new URL(u);
      x.searchParams.delete('uo');
      return x.href;
    } catch (e) { return u; }
  }

  // Les chemins Deezer utilisent parfois un code langue ('en'), iTunes veut un pays.
  function appleCountry(lang) {
    if (lang && /^[a-z]{2}$/.test(lang)) return lang === 'en' ? 'us' : lang;
    return 'fr';
  }

  function platformLabel(p) {
    return p === 'apple' ? 'Apple Music' : 'Deezer';
  }

  function manualSearchUrl(platform, src) {
    var term = cleanQuotes((src.artist || '') + ' ' + (src.title || ''));
    return platform === 'apple'
      ? 'https://music.apple.com/fr/search?term=' + encodeURIComponent(term)
      : 'https://www.deezer.com/search/' + encodeURIComponent(term);
  }

  function dedupe(cands) {
    var seen = {};
    return cands.filter(function (c) {
      if (!c.url || seen[c.url]) return false;
      seen[c.url] = true;
      return true;
    });
  }

  function itunesSongCand(x) {
    return {
      title: x.trackName,
      artist: x.artistName,
      album: x.collectionName,
      durationSec: x.trackTimeMillis ? Math.round(x.trackTimeMillis / 1000) : null,
      url: cleanAppleUrl(x.trackViewUrl),
      artwork: x.artworkUrl100
    };
  }

  function deezerTrackCand(x) {
    return {
      title: x.title,
      artist: x.artist && x.artist.name,
      album: x.album && x.album.title,
      durationSec: x.duration || null,
      url: x.link || 'https://www.deezer.com/track/' + x.id,
      artwork: x.album && x.album.cover_medium
    };
  }

  function deezerAlbumCand(x) {
    return {
      title: x.title,
      artist: x.artist && x.artist.name,
      count: x.nb_tracks || null,
      url: x.link || 'https://www.deezer.com/album/' + x.id,
      artwork: x.cover_medium
    };
  }

  function bestScore(cands, src) {
    var max = -Infinity;
    for (var i = 0; i < cands.length; i++) {
      var s = scoreMatch(src, cands[i]);
      if (s > max) max = s;
    }
    return max;
  }

  function finish(src, cands, platform, kind) {
    var scored = cands
      .map(function (c) { return { c: c, s: scoreMatch(src, c) }; })
      .sort(function (a, b) { return b.s - a.s; });
    var top = scored[0];
    if (!top || top.s < 4) {
      var err = new Error(
        'Pas de correspondance fiable sur ' + platformLabel(platform) +
        ' pour « ' + src.title + ' » de ' + src.artist + '.'
      );
      err.searchUrl = manualSearchUrl(platform, src);
      err.source = src;
      throw err;
    }
    var confidence = top.s >= 9 ? 'exacte' : (top.s >= 6 ? 'probable' : 'incertaine');
    return {
      source: src,
      target: {
        platform: platform,
        kind: kind,
        title: top.c.title,
        artist: top.c.artist,
        url: top.c.url,
        artwork: top.c.artwork,
        confidence: confidence,
        score: top.s
      },
      alternatives: scored.slice(1, 4)
        .filter(function (x) { return x.s >= 3; })
        .map(function (x) { return x.c; })
    };
  }

  /* ------------------------------------------------------------------ */
  /* Les quatre sens de conversion                                       */
  /* ------------------------------------------------------------------ */

  function appleTrackToDeezer(parsed, fetchJson) {
    var src;
    return fetchJson(ITUNES + '/lookup?' + q({ id: parsed.id, country: parsed.country || 'fr' }))
      .then(function (lu) {
        var r = (lu.results || []).filter(function (x) { return x.kind === 'song'; })[0];
        if (!r) throw new Error('Titre introuvable sur Apple Music (id ' + parsed.id + ').');
        src = {
          platform: 'apple', kind: 'track',
          title: r.trackName, artist: r.artistName, album: r.collectionName,
          durationSec: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : null,
          artwork: r.artworkUrl100,
          url: cleanAppleUrl(r.trackViewUrl) || parsed.url
        };
        var strictQ = 'artist:"' + cleanQuotes(src.artist) + '" track:"' + cleanQuotes(src.title) + '"';
        return fetchJson(DEEZER + '/search?' + q({ q: strictQ, limit: 25 }), { jsonp: true });
      })
      .then(function (strict) {
        var cands = (strict.data || []).map(deezerTrackCand);
        if (bestScore(cands, src) >= 6) return cands;
        return fetchJson(DEEZER + '/search?' + q({ q: cleanQuotes(src.artist + ' ' + src.title), limit: 25 }), { jsonp: true })
          .then(function (loose) {
            return dedupe(cands.concat((loose.data || []).map(deezerTrackCand)));
          });
      })
      .then(function (cands) { return finish(src, cands, 'deezer', 'track'); });
  }

  function deezerTrackToApple(parsed, fetchJson) {
    var src;
    return fetchJson(DEEZER + '/track/' + parsed.id, { jsonp: true })
      .then(function (t) {
        if (!t || t.error) throw new Error('Titre introuvable sur Deezer (id ' + parsed.id + ').');
        src = {
          platform: 'deezer', kind: 'track',
          title: t.title, artist: t.artist && t.artist.name,
          album: t.album && t.album.title,
          durationSec: t.duration || null, isrc: t.isrc || null,
          artwork: t.album && t.album.cover_medium,
          url: t.link || parsed.url
        };
        return fetchJson(ITUNES + '/search?' + q({
          term: cleanQuotes(src.artist + ' ' + src.title),
          entity: 'song', media: 'music',
          country: appleCountry(parsed.lang), limit: 25
        }));
      })
      .then(function (se) {
        return finish(src, (se.results || []).map(itunesSongCand), 'apple', 'track');
      });
  }

  function appleAlbumToDeezer(parsed, fetchJson) {
    var src;
    return fetchJson(ITUNES + '/lookup?' + q({ id: parsed.id, country: parsed.country || 'fr' }))
      .then(function (lu) {
        var r = (lu.results || []).filter(function (x) { return x.wrapperType === 'collection'; })[0];
        if (!r) throw new Error('Album introuvable sur Apple Music (id ' + parsed.id + ').');
        src = {
          platform: 'apple', kind: 'album',
          title: r.collectionName, artist: r.artistName,
          count: r.trackCount || null, artwork: r.artworkUrl100,
          url: cleanAppleUrl(r.collectionViewUrl) || parsed.url
        };
        var strictQ = 'artist:"' + cleanQuotes(src.artist) + '" album:"' + cleanQuotes(src.title) + '"';
        return fetchJson(DEEZER + '/search/album?' + q({ q: strictQ, limit: 25 }), { jsonp: true });
      })
      .then(function (strict) {
        var cands = (strict.data || []).map(deezerAlbumCand);
        if (bestScore(cands, src) >= 6) return cands;
        return fetchJson(DEEZER + '/search/album?' + q({ q: cleanQuotes(src.artist + ' ' + src.title), limit: 25 }), { jsonp: true })
          .then(function (loose) {
            return dedupe(cands.concat((loose.data || []).map(deezerAlbumCand)));
          });
      })
      .then(function (cands) { return finish(src, cands, 'deezer', 'album'); });
  }

  function deezerAlbumToApple(parsed, fetchJson) {
    var src;
    var country;
    return fetchJson(DEEZER + '/album/' + parsed.id, { jsonp: true })
      .then(function (a) {
        if (!a || a.error) throw new Error('Album introuvable sur Deezer (id ' + parsed.id + ').');
        src = {
          platform: 'deezer', kind: 'album',
          title: a.title, artist: a.artist && a.artist.name,
          count: a.nb_tracks || null, upc: a.upc || null,
          artwork: a.cover_medium,
          url: a.link || parsed.url
        };
        country = appleCountry(parsed.lang);
        if (!src.upc) return null;
        return fetchJson(ITUNES + '/lookup?' + q({ upc: src.upc, country: country }));
      })
      .then(function (lu) {
        var r = lu && (lu.results || []).filter(function (x) { return x.wrapperType === 'collection'; })[0];
        if (r) {
          return {
            source: src,
            target: {
              platform: 'apple', kind: 'album',
              title: r.collectionName, artist: r.artistName,
              url: cleanAppleUrl(r.collectionViewUrl),
              artwork: r.artworkUrl100,
              confidence: 'exacte', via: 'UPC'
            },
            alternatives: []
          };
        }
        // Pas de correspondance UPC : repli sur la recherche classique.
        return fetchJson(ITUNES + '/search?' + q({
          term: cleanQuotes(src.artist + ' ' + src.title),
          entity: 'album', media: 'music', country: country, limit: 25
        })).then(function (se) {
          var cands = (se.results || []).map(function (x) {
            return {
              title: x.collectionName,
              artist: x.artistName,
              count: x.trackCount || null,
              url: cleanAppleUrl(x.collectionViewUrl),
              artwork: x.artworkUrl100
            };
          });
          return finish(src, cands, 'apple', 'album');
        });
      });
  }

  /* ------------------------------------------------------------------ */
  /* Point d'entrée                                                      */
  /* ------------------------------------------------------------------ */

  // input : lien (string) ou objet déjà passé par parseMusicLink.
  // opts.fetchJson(url, {jsonp}) : transport réseau fourni par l'appelant.
  function convert(input, opts) {
    return Promise.resolve().then(function () {
      if (!opts || typeof opts.fetchJson !== 'function') {
        throw new Error('convert() a besoin de opts.fetchJson.');
      }
      var parsed = typeof input === 'string' ? parseMusicLink(input) : input;
      if (parsed.kind === 'short') {
        throw new Error(
          'Les liens courts (deezer.page.link) ne peuvent pas être résolus depuis le navigateur : ' +
          "ouvre le lien puis copie l'adresse complète (www.deezer.com/…)."
        );
      }
      var fetchJson = opts.fetchJson;
      if (parsed.platform === 'apple' && parsed.kind === 'track') return appleTrackToDeezer(parsed, fetchJson);
      if (parsed.platform === 'apple' && parsed.kind === 'album') return appleAlbumToDeezer(parsed, fetchJson);
      if (parsed.platform === 'deezer' && parsed.kind === 'track') return deezerTrackToApple(parsed, fetchJson);
      if (parsed.platform === 'deezer' && parsed.kind === 'album') return deezerAlbumToApple(parsed, fetchJson);
      throw new Error('Type de lien non géré : ' + parsed.platform + '/' + parsed.kind);
    });
  }

  return {
    parseMusicLink: parseMusicLink,
    convert: convert,
    platformLabel: platformLabel,
    _internals: { normBasic: normBasic, normLoose: normLoose, scoreMatch: scoreMatch, cleanAppleUrl: cleanAppleUrl }
  };
});
