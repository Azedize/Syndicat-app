# MIZAN — Identité et système de design

Direction « Riad au crépuscule », mise en place le 21/10/2026.
Code : `artifacts/mobile/constants/{brand,colors,typography,motion,spacing}.ts`,
`components/ui/*`, `components/brand/*`, `components/signature/*`.

## 1. Recherche : ce qui a été retenu, et pourquoi

| Source | Principe retenu | Application dans MIZAN |
|---|---|---|
| Référence fournie (instagram.com/dailyflutterui_2001/reels) | **Non analysée** : la page ne charge aucune vidéo sans session Instagram (vérifié le 21/10/2026). | — |
| Concurrence marocaine : Syndic Connect, application Thaïs, DIL Group | Ces applications listent des fonctions (soldes, documents, réclamations) sans identité spatiale ni langage visuel propre. | L'écart à combler est l'identité et la lisibilité, pas le nombre de fonctions. |
| Refonte Airbnb 2025 (icônes en volume, objets qui se transforment) — sources secondaires | Le volume et la matière rendent un service reconnaissable. Le mouvement montre la transformation d'un objet, il ne décore pas. | Scène isométrique de la résidence. La marque est animée (l'arche se trace, le fléau se stabilise). |
| Revolut 10 (2023) : hiérarchie claire, « pas de bruit » | Une seule donnée héroïque par écran ; tout le reste est secondaire. | En-tête d'accueil limité à l'identité, la résidence et le solde ; puis « À faire ». |
| Apple Design Awards 2025 (catégories Interaction / Delight) | Le plaisir naît d'une interaction utile, pas de l'effet. | Pas de boucle d'animation. Une seule chorégraphie, au lancement, et elle ne bloque jamais. |
| Documentation Reanimated (`useReducedMotion`, `ReduceMotion.System`) | Le réglage système doit couper les animations. | Toutes les animations l'honorent (`hooks/useMotion`). |
| Expo SDK 54 (Skia 2.2.12 recommandé) | Skia ajouterait un module natif. | Non retenu : react-native-svg et Reanimated, déjà installés, suffisent. Aucune nouvelle dépendance native. |

## 2. Nom et marque

**Décision : garder MIZAN** (« mîzân », la balance, ميزان).

Candidats évalués :

| Nom | Verdict | Raison |
|---|---|---|
| Jiran (« voisins ») | écarté | Une application de voisinage « Jiran » est publiée sur l'App Store depuis mai 2026. Une autre existe en Malaisie (Jiran SOS). |
| Sakina (sérénité, racine s-k-n = habiter) | écarté | sakina.ma et sakina.app sont déjà enregistrés. C'est aussi un prénom courant. |
| Wasti (« mon centre ») | écarté | Le mot est ambigu en darija. |
| Riadly | écarté | Évoque la maison d'hôtes et le tourisme, pas la copropriété. |
| Darna (« notre maison ») | écarté | Très répandu au Maroc (associations, commerces). |
| **MIZAN** | **retenu** | Le nom dit la promesse : des comptes justes, des quotes-parts équitables. Il se prononce en FR/AR/EN et figure déjà dans les documents, PDF et e-mails produits. |

Vérifications **préliminaires** (pas une recherche d'antériorité juridique) :
- **Domaines :** mizan.app est parqué chez un revendeur (afternic) ; mizan.ma n'a pas de serveur DNS public, son statut reste à vérifier auprès du registre .ma.
- **Homonymie :** Meezan Bank (Pakistan, banque islamique, graphie différente) est le risque principal en classe 36.
- **À faire avant tout dépôt :** une recherche OMPIC (Maroc) et WIPO Global Brand Database en classes 36 et 42, par un conseil en propriété industrielle.

**Symbole.** L'arche d'un riad tient un fléau de balance en laiton : un lieu partagé (les parties communes autour de la cour) et des comptes à l'équilibre.
- **Source :** `assets/brand/_build.mjs`, qui génère toutes les variantes depuis une seule géométrie.
- **Variantes :** tuile (icône), icône iOS pleine page, avant-plan Android adaptatif (zone de sécurité de 66 %), splash, notification (monochrome), version encre pour fonds clairs.
- **Composants :** `components/brand/MizanMark.tsx` (statique et animé) et `MizanLogo.tsx` (mot-symbole en Fraunces).

Régénérer les PNG (le moteur de rendu `@resvg/resvg-js` n'est pas une dépendance du projet) :

```
cd artifacts/mobile
npm i --no-save @resvg/resvg-js@2.6.2
node assets/brand/_build.mjs && node assets/brand/_render.mjs
```


## 3. Couleurs

Un immeuble en copropriété fonctionne comme un riad : des logements privés autour d'une cour commune. La palette vient de ses matériaux, pas du bleu SaaS habituel (l'ancien `#1F5EFF`).

| Rôle | Clair | Sombre | Usage |
|---|---|---|---|
| Majorelle (`primary`) | `#5A4AD6` | `#6B5DE6` | La seule couleur d'action |
| `tint` (liens, libellés colorés) | `#5A4AD6` | `#B39CFF` | Le texte coloré, jamais `primary` sur fond sombre |
| Nuit (`navy`) | `#1A1640` | `#120F2C` | En-têtes, scène, icône |
| Tadelakt (`background`) | `#F7F4EE` | `#0E0C1C` | Fond de page |
| Laiton (`gold`) | `#B8862F` | `#E3B75C` | Fléau, arête de toit, rares accents, jamais une action |
| Zellige (`success`) | `#0B7A57` | `#4CD39B` | Réglé, validé |
| Safran (`warning`) | `#C98511` | `#F2B84B` | À payer, en attente |
| Grenade (`danger`) | `#B42530` | `#F58A90` | En retard, refusé |
| Cèdre (`info`) | `#0F6E7D` | `#5CC6D4` | Information |

Contrôle automatique : `pnpm --filter @workspace/scripts design-tokens:test` (44/44).
- **Texte sur fond :** chaque paire atteint au moins 4,5:1, dans les deux modes.
- **Exception documentée :** `primary` utilisé comme texte en sombre ne fait que 3,7 à 4:1. C'est pourquoi les liens utilisent `tint` ; 139 usages ont été convertis.

Les 1 849 couleurs codées en dur de l'ancienne palette, dans 87 fichiers, ont été remappées vers leur équivalent sémantique. Deux fichiers sont exclus, car ils déduisent un ton des valeurs hex : `(tabs)/index` et `(tabs)/more`.

## 4. Typographie

| Famille | Rôle | Raison |
|---|---|---|
| **Fraunces** 500/600 | Titres, titres de section, montants héroïques, mot-symbole | Une voix éditoriale : celle du registre de la copropriété, pas d'un tableau de bord. |
| **Noto Kufi Arabic** 500/600 | Titres en arabe | Fraunces n'a pas de glyphes arabes ; sans elle, les titres retombent sur une police système fine. Le coufique, géométrique, fait écho à l'arche. |
| **Inter** 400–700 | Tout le texte courant, les formulaires, les tableaux | Ses métriques sont validées sur tous les écrans. |

- **Bascule des titres :** `applyScriptFonts(lang)` change les presets `TYPE.display/title/headline` avant le rendu, et `displayFace(lang)` sert aux styles statiques. Passer à l'arabe ou en revenir redémarre l'application (RTL), donc les styles construits au démarrage suivent aussi.
- **Conversion :** 90 blocs de titre (Inter Bold de 20 px et plus) sont passés en Fraunces, et leur espacement négatif a été retiré, car il casse la liaison des lettres arabes.

## 5. Mouvement — « l'équilibre »

Les éléments se posent comme un fléau : un mouvement rapide, un léger dépassement, puis le repos (`SPRING.balance`).

| Animation | Raison d'être | Durée |
|---|---|---|
| Marque (arche tracée, fléau qui se stabilise) | Première impression. Le nom fait image. | ≈ 1,1 s, sans blocage |
| Résidence : étages posés de bas en haut, puis l'étage du résident en laiton | Répondre à « où suis-je dans la résidence ? » | 0,65 s puis 0,42 s |
| Entrée des sections de l'accueil, en cascade de 45 ms | Indiquer l'ordre de lecture | 260 ms |
| Pastille de l'onglet actif (ressort) | Retour de navigation | ressort `glide` |
| Bouton pressé (échelle 0,98) et retour haptique | Réponse perçue | ≤ 120 ms |

- **Réduire les animations (système) :** aucun mouvement ; Reanimated saute ses animations et la scène s'affiche dans son état final.
- **Appareils Android de moins de 3 Go de RAM :** scènes statiques.
- **Aucune boucle.**

Mesures relevées dans Chrome (version web, viewport 390×844), pendant les 1,5 s qui suivent l'apparition de la marque :

| Écran | Processeur normal | Processeur ralenti 4× |
|---|---|---|
| Accueil public | 57 img/s, p95 16,8 ms | 43 img/s, p95 17 ms (3 images > 34 ms, au montage) |
| Accueil copropriétaire | 60 img/s | 42 img/s |

**Ces chiffres ne valent pas pour le natif.** Sur le web, les animations SVG tournent sur le thread JavaScript ; sur natif, Reanimated les exécute sur le thread UI. Aucune mesure n'a été faite sur un appareil réel.

## 6. Composants et règles

- **En-têtes :** les écrans racines d'onglet utilisent `PageHeader` (grand titre sur la page). Tous les écrans secondaires utilisent `ScreenHeader` : une bande Nuit, le titre en Fraunces, un retour avec repli (`useBackNavigation`), une flèche orientée selon le RTL et au plus deux actions nommées.
  - 25 écrans qui avaient un en-tête clair maison ont été convertis.
  - Les écrans d'entrée (`register`, `get-started`, `forgot-password`, `reset-password`, `sms-verify`, `email-verify`) utilisent `components/brand/AuthHero` : la même bande Nuit, la marque et l'icône de l'étape. `login`, `welcome` et `intro` ont leur propre bande, dans le même langage visuel. `onboarding` garde sa barre d'étapes sur fond clair.
- **Actions :** une seule action principale par écran (`Button` primaire). Les actions secondaires vont dans une ligne d'outils, pas dans l'en-tête ; exemple : `documents`.
- **Statuts :** jamais par la couleur seule ; ils passent par `StatusBadge` et `TONE_ICON`.
- **Données :** la scène, les compteurs et les montants viennent de l'API. Une illustration publique (`welcome`) ne porte aucun chiffre et est masquée aux lecteurs d'écran.
