# 🎶 shareApplemusicToDeezer — Apple Music ↔ Deezer (+ YouTube)

Convertis un lien **Apple Music** en lien **Deezer** (et inversement) en collant simplement le lien, ou génère un lien **YouTube / YouTube Music** pour les proches qui écoutent là-bas.

- **La landing** : https://ossamabenjemaa.github.io/shareApplemusicToDeezer/
- **Le convertisseur** : https://ossamabenjemaa.github.io/shareApplemusicToDeezer/app/

```
https://music.apple.com/fr/album/ghost/1634875613?i=1634875617
                              ⇅
https://www.deezer.com/track/2096231467
```

- **100 % navigateur** : site statique, aucun serveur, aucun compte, aucune clé d'API.
- **Titres et albums**, dans les deux sens, avec pochette, statut de fiabilité expliqué (badge cliquable) et candidats alternatifs.
- **Cible YouTube** : `?to=youtube` (ou `?to=ytmusic`) force la destination — lien de recherche « artiste titre », le premier résultat est en général le bon.
- Boutons **Copier** / **Partager** (feuille de partage iOS), historique local des conversions.

Le site est publié automatiquement par GitHub Actions (`.github/workflows/pages.yml`, miroir `main` → `gh-pages`) à chaque push.

## 📱 Raccourcis iPhone

Deux raccourcis prêts à installer sont hébergés dans [`raccourcis/`](raccourcis/) et téléchargeables depuis la [landing](https://ossamabenjemaa.github.io/shareApplemusicToDeezer/#raccourci) :

| Raccourci | URL appelée |
|---|---|
| **Partager sur Deezer** | `…/app/?url=` + lien encodé |
| **Partager sur YouTube** | `…/app/?to=youtube&url=` + lien encodé |

Usage : dans Apple Music → **Partager** → « Partager sur Deezer » (ou YouTube) → la page s'ouvre avec le lien converti → **Partager…** → iMessage/WhatsApp. Deux taps.

Le tutoriel pas à pas pour reconstruire ces raccourcis soi-même (5 actions dans l'app Raccourcis) est sur la landing, section « Le raccourci iPhone ».

Astuce : ouvre le convertisseur dans Safari → Partager → « Sur l'écran d'accueil » pour l'avoir en icône d'app — pratique dans le sens Deezer → Apple Music (copier le lien reçu, ouvrir l'app, bouton coller).

## 🖥️ En local / en ligne de commande

```bash
git clone https://github.com/ossamabenjemaa/shareApplemusicToDeezer
cd shareApplemusicToDeezer
python3 -m http.server 8000   # puis ouvre http://localhost:8000
```

```bash
node cli.js "https://music.apple.com/fr/album/ghost/1634875613?i=1634875617"
# ➡️  Deezer : https://www.deezer.com/track/2096231467 — Fiabilité : exacte
#     (+ liens YouTube / YouTube Music en bonus)

node cli.js --to=youtube "https://www.deezer.com/fr/track/2096231467"
# ➡️  YouTube : https://www.youtube.com/results?search_query=Ava%20Max%20Ghost
```

## ⚙️ Comment ça marche

Aucune API privée : uniquement les APIs publiques **iTunes** (lookup/search) et **Deezer**.

| Sens | Stratégie |
|---|---|
| Deezer → Apple (album) | Correspondance **exacte par code UPC** (code-barres de l'album). |
| Deezer → Apple (titre) | Métadonnées Deezer → recherche iTunes → classement titre + artiste + durée. |
| Apple → Deezer (titre) | Métadonnées iTunes → recherche Deezer stricte `artist:"…" track:"…"` (repli en recherche libre) → même classement. |
| Apple → Deezer (album) | Idem avec le nombre de pistes en critère supplémentaire. |
| → YouTube / YT Music | Métadonnées de la source → lien de recherche « artiste titre » (pas d'API publique sans clé chez YouTube). |

Le score de correspondance normalise accents, apostrophes et suffixes (« feat. », « Remix », « - Single »…), compare l'artiste et la durée (±2 s) et produit le statut affiché : **exacte**, **probable** ou **à vérifier** — cliquer le badge dans l'app explique chaque statut. Côté navigateur, iTunes est appelé en `fetch` (CORS ouvert) et Deezer en **JSONP** (pas de CORS chez eux) — c'est ce qui permet de rester 100 % statique.

## 📁 Structure

```
index.html         — la landing (présentation, tutoriel raccourcis, FAQ)
app/index.html     — le convertisseur (l'app elle-même)
converter.js       — le moteur : analyse des liens, appels API, score, cibles YouTube
cli.js             — la même conversion en ligne de commande (Node ≥ 18)
raccourcis/        — les deux fichiers .shortcut signés, prêts à installer
apple-touch-icon.png, .github/workflows/pages.yml
```

## ⚠️ Limites connues

- **Liens courts** `deezer.page.link` : à ouvrir d'abord puis copier l'adresse complète `www.deezer.com/…` (le CLI, lui, les résout automatiquement).
- **Playlists et artistes** : non gérés (titres et albums uniquement).
- **YouTube** : lien de *recherche*, pas lien direct — YouTube n'expose pas d'API publique sans clé.
- L'API iTunes limite à ~20 requêtes/minute : largement assez pour un usage perso.

## 💡 Astuce sans rien installer

`https://song.link/<ton-lien>` (Odesli) affiche une page avec le titre sur toutes les plateformes — le convertisseur la référence d'ailleurs sous chaque résultat.
