# 🎶 shareApplemusicToDeezer — Apple Music ↔ Deezer

Convertis un lien **Apple Music** en lien **Deezer** (et inversement) en collant simplement le lien. Pensé pour partager des musiques entre un iPhone sous Apple Music et une copine sous Deezer 💜

**➡️ La page : https://ossamabenjemaa.github.io/shareApplemusicToDeezer/**

```
https://music.apple.com/fr/album/ghost/1634875613?i=1634875617
                              ⇅
https://www.deezer.com/track/2096231467
```

- **100 % navigateur** : une page HTML statique, aucun serveur, aucun compte, aucune clé d'API.
- **Titres et albums**, dans les deux sens, avec pochette, indicateur de fiabilité et candidats alternatifs.
- Boutons **Copier** et **Partager** (feuille de partage iOS), historique des dernières conversions.
- Lien bonus « song.link » pour voir le titre sur toutes les plateformes (comme l'encart Google).

Le site est déployé automatiquement par GitHub Actions (`.github/workflows/pages.yml`) à chaque push sur `main`.

## 📱 Partage en 2 taps depuis l'iPhone (app Raccourcis)

La page accepte un paramètre `?url=` et convertit automatiquement au chargement.
On en profite pour brancher le convertisseur directement dans la feuille de partage :

1. Ouvre **Raccourcis** → onglet **Raccourcis** → **+** pour créer un raccourci.
2. Touche **ⓘ** (infos) → active **« Afficher dans la feuille de partage »**.
   Dans « Recevoir », limite aux types **URL** et **Texte**.
3. Ajoute l'action **« Encoder l'URL »** (elle encode l'entrée du raccourci).
4. Ajoute l'action **« URL »** avec :
   `https://ossamabenjemaa.github.io/shareApplemusicToDeezer/?url=` puis insère la variable **Texte encodé** juste après.
5. Ajoute l'action **« Ouvrir les URL »**.
6. Renomme le raccourci, par exemple **« Envoyer sur Deezer »** 💜

Ensuite, depuis Apple Music : **Partager → Envoyer sur Deezer** → la page s'ouvre avec le
lien Deezer déjà trouvé → **Partager…** → iMessage/WhatsApp. Deux taps.
(Ça marche aussi dans l'autre sens quand elle t'envoie un lien Deezer.)

Astuce bonus : ouvre la page dans Safari → **Partager → « Sur l'écran d'accueil »** pour
l'avoir en icône d'app, pratique pour coller un lien Deezer reçu (bouton 📋).

## 🖥️ En local / en ligne de commande

```bash
git clone https://github.com/ossamabenjemaa/shareApplemusicToDeezer
cd shareApplemusicToDeezer
python3 -m http.server 8000   # puis ouvre http://localhost:8000
```

```bash
node cli.js "https://music.apple.com/fr/album/ghost/1634875613?i=1634875617"
# 🎵 Source (Apple Music, titre)
#    Ghost · Ava Max · Diamonds & Dancefloors [3:02]
# ➡️  Deezer
#    https://www.deezer.com/track/2096231467
# Fiabilité : exacte

node cli.js "https://www.deezer.com/fr/track/2096231467?autoplay=true"
# ➡️  Apple Music
#    https://music.apple.com/fr/album/ghost/1634875613?i=1634875617
```

## ⚙️ Comment ça marche

Aucune API privée : uniquement les APIs publiques **iTunes** (lookup/search) et **Deezer**.

| Sens | Stratégie |
|---|---|
| Deezer → Apple (album) | Correspondance **exacte par code UPC** (code-barres de l'album). |
| Deezer → Apple (titre) | Métadonnées Deezer → recherche iTunes → classement titre + artiste + durée. |
| Apple → Deezer (titre) | Métadonnées iTunes → recherche Deezer stricte `artist:"…" track:"…"` (repli en recherche libre) → même classement. |
| Apple → Deezer (album) | Idem avec le nombre de pistes en critère supplémentaire. |

Le score de correspondance compare le titre (avec normalisation des accents,
apostrophes, suffixes « feat. », « Remix », « - Single »…), l'artiste et la durée
(à ±2 s près). Il produit l'indicateur affiché : **exacte**, **probable** ou **à vérifier**,
avec les autres candidats en dépliant « Pas la bonne version ? ».

Côté navigateur, iTunes est appelé en `fetch` (CORS ouvert) et Deezer en **JSONP**
(pas d'en-têtes CORS chez eux) — c'est ce qui permet de rester 100 % statique.

## 📁 Structure

```
index.html    — l'interface (mobile-first, mode sombre automatique)
converter.js  — le cœur : analyse des liens, appels API, score de correspondance
cli.js        — la même conversion en ligne de commande (Node ≥ 18)
```

## ⚠️ Limites connues

- **Liens courts** `deezer.page.link` : impossibles à résoudre depuis le navigateur
  (redirections cross-origin). Ouvre le lien puis copie l'adresse complète
  `www.deezer.com/…`. Le CLI, lui, les résout automatiquement.
- **Playlists et artistes** : non gérés (titres et albums uniquement).
- Le sens « vers Deezer » repose sur la recherche (pas de lookup ISRC public côté
  iTunes) : sur une compilation obscure, vérifie l'indicateur de fiabilité.
- L'API iTunes limite à ~20 requêtes/minute : largement assez pour un usage perso.

## 💡 Astuce sans rien installer

`https://song.link/<ton-lien>` (Odesli) affiche une page avec le titre sur toutes les
plateformes — pratique quand tu veux laisser le choix. Le convertisseur, lui, donne
directement **le bon lien Deezer cliquable**, sans page intermédiaire.
