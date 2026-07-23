# Audit complet — Passerelle musicale

*Audit mené le 23/07/2026 par 10 revues spécialisées (UX, UI, produit, business,
marketing, dev, écoconception, qualité, RGAA, direction artistique), chacune
fondée sur des tests réels (parcours navigateur, matrice CLI de 45 cas, mesures
de poids et de contraste, revue de code ligne à ligne). ~90 constats au total.
Ce document résume l'état, les correctifs appliqués dans la foulée, et les
plans d'action restants.*

## Ce que les audits ont confirmé de solide

- **Tous les parcours aboutissent** (conversion manuelle, arrivée `?url=`,
  `?to=youtube`, les deux sens, albums par UPC) en 1,4-1,7 s, résultat au-dessus
  de la ligne de flottaison sur iPhone.
- **Moteur fiable** : 40/45 cas de la matrice qualité PASS d'emblée ; paliers de
  fiabilité conformes à la documentation ; UPC pour les albums = zéro ambiguïté.
- **Sobriété top 1 % du web** : landing 6,7 Ko / 1 requête ; conversion complète
  27-34 Ko / 5 requêtes (page médiane du web : ~2,4 Mo / ~70 requêtes).
- **Modèle économique sain** : 0 €, ~7 millions de chargements/mois de marge
  sous les limites GitHub Pages, montée en charge répartie sur les navigateurs
  des visiteurs.
- **Base d'accessibilité saine** : lang, zoom libre, reflow 320 px, focus
  visible, SVG décoratifs neutralisés, panneau pédagogique du badge ⓘ.

## Correctifs appliqués (le jour de l'audit)

### Fiabilité et moteur
- Ponctuation collée au lien (« …?i=456. ») ne détourne plus vers l'album ;
  schéma `HTTPS://` accepté ; `new URL` protégé ; segments de chemin
  insensibles à la casse.
- 3ᵉ repli de recherche avec titre « allégé » (sans suffixes plateforme type
  « (Video Album) ») avant de déclarer l'échec — dans les deux sens.
- Liens Spotify et plateformes inconnues : message dédié + repli song.link
  cliquable. Playlists/artistes : messages explicites avec orientation
  (TuneMyMusic/Soundiiz).
- `deezer.page.link` (service arrêté par Google) : messages corrigés partout,
  CLI compris ; `link.deezer.com` proposé en lien cliquable.
- Timeout de 15 s sur les appels iTunes ; pannes réseau désormais en français
  (« Impossible de joindre Apple Music — vérifie ta connexion puis réessaie. »)
  avec lien **Réessayer** ; codes HTTP humanisés.
- Recherche manuelle : terme nettoyé des suffixes (ne renvoie plus zéro
  résultat).
- **`test.js` : 18 tests hors-ligne** (parsing + paliers de fiabilité sur
  transport simulé), exécutés avant chaque déploiement (`pages.yml`) ;
  **canary hebdomadaire** (`canary.yml`) qui rejoue de vraies conversions et
  alerte par e-mail si une API publique casse.

### Sécurité et robustesse
- Messages d'état construits en DOM (`textContent`) au lieu d'`innerHTML` ;
  Content-Security-Policy en `<meta>` sur les deux pages ; historique
  localStorage blindé (`Array.isArray`) ; identifiants techniques retirés des
  messages d'erreur.

### Accessibilité (RGAA)
- Statuts annoncés aux lecteurs d'écran (`role="status"` + `aria-live`, zone
  d'annonce pour « Lien copié » et le résumé de résultat).
- Contrastes AA : bouton Apple Music assombri (#e11d33, 4,75:1), rouge YouTube
  sombre calibré (#e51b1b), bordure de champ dédiée, placeholder lisible.
- `<main>` + lien d'évitement sur les deux pages ; titres de page distincts ;
  badge de fiabilité devenu un vrai `<button aria-controls>` ; bouton
  « Effacer » sorti du `<h2>` ; cibles tactiles ≥ 44 px ;
  `prefers-reduced-motion` respecté.

### UX / UI / DA
- Nommage unifié « **Partager sur Deezer / sur YouTube** » (aligné sur les
  fichiers signés) sur la landing, l'app et le README.
- L'app n'est plus un cul-de-sac : footer réécrit (exit « POC »), lien vers le
  tutoriel `../#raccourci`, eyebrow cliquable vers la landing.
- Mode `?to=youtube` assumé : en-tête et titre de page adaptés ; pastille du
  statut « Lien de recherche » neutralisée (le bouton rouge porte seul la
  marque) ; cible `?to=` inconnue signalée sans bloquer.
- Ligne « Depuis : titre — artiste » quand la correspondance n'est pas exacte ;
  bouton Convertir avec état occupé ; lien « Essayer avec un exemple » sur les
  deux pages ; promesse du flux corrigée (« le lien est prêt à envoyer ») ;
  filet signature dégradé rouge→violet ; favicon unifié.
- FAQ enrichie : « Pourquoi pas song.link ? », playlists, question formulée
  comme une vraie recherche, données personnelles précisées, liens courts.

### Marketing / diffusion / conformité
- **Open Graph + Twitter cards + `og-image` 1200×630** sur les deux pages —
  les partages WhatsApp/iMessage ont désormais un vrai aperçu (canal de
  diffusion n° 1 du produit).
- `sitemap.xml`, `robots.txt`, `canonical`, JSON-LD `WebApplication`, H2 avec
  la requête cible, manifest PWA + icône 512 px.
- **LICENSE MIT** (la FAQ promettait un code ouvert), mentions légales LCEN
  dans le footer, phrase d'origine du produit (« Né pour envoyer des chansons
  à deux personnes… »).
- Écoconception : pochettes Deezer servies en 120 px au lieu de 250 px
  (−71 % sur l'image, poste principal du parcours), `limit` API 25 → 10,
  `preconnect` vers les deux APIs, `<noscript>` explicatif.

## Plans d'action restants (nécessitent le propriétaire ou une décision)

| # | Action | Pourquoi | Effort |
|---|---|---|---|
| 1 | **Liens iCloud des raccourcis** : sur l'iPhone, Raccourcis → Partager → « Copier le lien iCloud » pour chacun des deux raccourcis, puis me donner les 2 URLs pour en faire les boutons primaires (les fichiers restent en repli). | Installation en 1 tap au lieu de 4-5 (téléchargement de fichier). C'est LE frein d'adoption n° 1 relevé par l'audit UX. | 10 min |
| 2 | **Fiche GitHub** : Settings du dépôt → description (« Convertisseur de liens Apple Music ↔ Deezer (+ YouTube) — gratuit, sans compte, 100 % statique »), website (l'URL de la landing), topics (`apple-music`, `deezer`, `music`, `ios-shortcuts`, `static-site`). | Découvrabilité + la fiche renvoie vers le produit. | 5 min |
| 3 | **Captures du tutoriel** : 2-3 captures de l'app Raccourcis (étape ⓘ, action URL avec variable, résultat final) à m'envoyer pour illustrer les étapes. | Le tutoriel 100 % texte est le 2ᵉ frein d'adoption. | 15 min |
| 4 | **Nom/URL** : décision à prendre — garder le slug actuel (recommandé : les URLs sont gravées dans les raccourcis signés) ou acheter un domaine perso ~10 €/an qui masquerait le slug et sécuriserait la marque. Ne PAS renommer le dépôt (casserait Pages et les raccourcis). | Cohérence marque vs coût. | décision |
| 5 | **Diffusion** (après n° 1) : valider en usage réel avec les deux destinataires ; puis publier les raccourcis sur RoutineHub et la landing dans les cercles Apple/Deezer francophones. | Croissance douce, canal par canal. | progressif |
| 6 | **Android** : si un proche est sur Android, ajouter un service worker minimal pour l'installabilité PWA complète (le manifest est déjà en place) et documenter « Installer sur Android » sur la landing. | Moitié Android du duo d'usage. | ~1 j |
| 7 | **Spotify en cible** : `to=spotify` en lien de recherche (même mécanique que YouTube) si un destinataire Spotify apparaît. Le matching exact nécessiterait un mini-backend (Cloudflare Worker) — à ne faire que sur besoin réel. | Extension à coût quasi nul. | 1 h |
| 8 | **Risque APIs** : accepté et documenté — les deux APIs sont des tolérances sans contrat. Le canary hebdomadaire alerte en cas de casse ; le repli song.link est référencé partout. Rester non commercial (condition des ToS Deezer et GitHub Pages). | Lucidité sur la fondation du produit. | fait/veille |

## Ce que les audits recommandent de NE PAS faire

- **Pas de backend, pas de paiement** : les ToS Deezer (non commercial) et
  GitHub Pages (pas de SaaS) l'interdisent — et l'architecture 100 % client
  est précisément ce qui rend le produit gratuit et scalable.
- **Pas de renommage du dépôt** : l'URL Pages est codée dans les deux
  raccourcis signés distribués.
- **Pas de playlists ni de nouvelles plateformes par API privée** : coût de
  maintenance disproportionné pour un mainteneur solo ; la niche du produit
  est le partage en deux taps, pas l'exhaustivité (song.link existe pour ça).
