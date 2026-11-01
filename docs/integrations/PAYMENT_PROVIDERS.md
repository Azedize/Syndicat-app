# Paiements électroniques — analyse et décision

État au 21 octobre 2026. Document de travail : les points marqués
**À valider** relèvent d'un juriste, d'un expert-comptable ou du prestataire
de paiement, pas d'un choix technique.

## 1. Deux flux d'argent différents

| Flux | Payeur → bénéficiaire | État dans l'application |
|---|---|---|
| **Charges de copropriété** (appels de fonds) | copropriétaire → **syndicat de la copropriété** (compte bancaire du syndicat : `syndicates.bank_iban`) | déclaration de paiement (virement, chèque, espèces) avec justificatif, validation par le trésorier, écriture au journal, reçu numéroté, rapprochement bancaire |
| **Abonnement SaaS** | syndicat → **exploitant de MIZAN** | virement confirmé par le super admin ; carte via Stripe Checkout si des clés Stripe sont configurées |

Les fonds des copropriétaires appartiennent à chaque syndicat. Le modèle de
données le reflète : un compte bancaire, un journal et une numérotation par
copropriété. **MIZAN agit comme logiciel de gestion**, pas comme
intermédiaire qui encaisse puis reverse.

**À valider** : un modèle où la plateforme encaisserait pour le compte des
syndicats (compte technique commun, puis reversement) relève de la
réglementation des établissements de paiement au Maroc. Il ne doit pas être
mis en place sans avis juridique et agrément ou partenariat adapté.

## 2. Comparaison des solutions

| Solution | Disponibilité pour une entité marocaine | Modèle multi-syndics | Intégration technique | Statut dans MIZAN |
|---|---|---|---|---|
| **Virement bancaire + justificatif** | oui, sans contrat | naturel : chaque syndicat reçoit sur son propre compte | déjà en place : référence, justificatif, validation, reçu, rapprochement avec le relevé | **implémenté et testé** |
| **CMI** (Centre Monétique Interbancaire) | oui, via un **contrat d'affiliation** (questionnaire e-marchand, dépôt de garantie, ordre de prélèvement) | un contrat marchand **par syndicat** garde les fonds sur le compte du syndicat | page de paiement personnalisable, remboursement total ou partiel et liens de paiement depuis l'espace marchand ; documentation technique (notification serveur, signature) **non publique**, remise après affiliation | **non intégré** : spécification et accès de test à obtenir |
| **Autres acquéreurs / agrégateurs marocains** (ex. PayZone, Attijari Payment — agréée établissement de paiement par Bank Al-Maghrib, acquisition commerçants depuis 2025) | oui, sur contrat | à vérifier pour chacun (compte bénéficiaire par syndicat ou non) | API et frais à obtenir auprès de chaque prestataire ; aucune documentation publique vérifiée | **non intégré** |
| **Stripe** | **non** : le Maroc ne figure pas dans la liste des pays où une entreprise peut ouvrir un compte | sans objet pour un syndicat marocain | Checkout hébergé + webhook signé (déjà codé pour l'abonnement SaaS) | utilisable **seulement** pour l'abonnement SaaS, si l'exploitant est établi dans un pays pris en charge — **À valider** |
| **PayPal** | non vérifié | — | aucune intégration | **désactivé** (était proposé dès que des clés étaient présentes, sans intégration) |

Sources :

- [Stripe — disponibilité mondiale](https://stripe.com/fr/global) (consultée le 21/10/2026 : liste sans le Maroc ; Côte d'Ivoire, Ghana, Kenya, Nigeria et Afrique du Sud via Paystack)
- [CMI — solutions de paiement e-commerce](https://www.cmi.co.ma/fr/solutions-paiement-ecommerce)
- [Attijari Payment — lancement de l'acquisition commerçants (Médias24)](https://medias24.com/2025/07/07/attijari-payment-lance-officiellement-son-activite-dacquisition-commercants/)
- [Comparatif CMI / PayZone / Stripe (blog Kolonell — source commerciale, chiffres à vérifier)](https://kolonell.com/fr/blog/paiement-en-ligne-pme-maroc-cmi-ou-stripe-2026)

## 3. Décision

1. **Charges de copropriété** : le paiement par virement avec justificatif,
   référence, validation et rapprochement est la solution en production. Elle
   ne mélange aucun fonds et ne dépend d'aucun contrat.
2. **Paiement par carte des charges** : à intégrer avec le CMI (ou un autre
   acquéreur marocain) **par syndicat**, chaque syndicat signant son propre
   contrat marchand. La plateforme ne détient pas les fonds.
   Bloqué par une dépendance externe : contrat, documentation technique et
   environnement de test du prestataire.
3. **Abonnement SaaS** : Stripe reste possible si l'exploitant est une société
   établie dans un pays pris en charge. Sinon, virement confirmé (en place) ou
   CMI pour l'exploitant lui-même.

## 4. Architecture à appliquer à l'intégration d'un acquéreur

Exigences, quel que soit le prestataire (déjà respectées par l'intégration
Stripe de l'abonnement) :

- paiement créé côté serveur pour une obligation précise (appel de fonds,
  lot, copropriété) ; montant **calculé par le serveur** à partir du reste dû,
  jamais fourni par le client ;
- référence de transaction unique et clé d'idempotence par tentative ;
- page de paiement **hébergée** par le prestataire : aucun numéro de carte,
  CVV ou identifiant bancaire ne transite par MIZAN ;
- confirmation uniquement par la **notification serveur signée** du
  prestataire (vérification cryptographique selon sa documentation), jamais
  par le retour du navigateur sur la page de succès ;
- notifications rejouées ou désordonnées sans effet en double : verrou sur la
  ligne de paiement, états `created → pending → (authorized) → confirmed |
  failed | cancelled | refunded | partially_refunded` ;
- un paiement confirmé suit le circuit existant : `appel_payments` validé,
  écriture au journal du compte bancaire du syndicat, reçu numéroté,
  rapprochement avec le relevé ;
- frais du prestataire enregistrés comme une dépense du syndicat (ou selon
  le contrat), jamais déduits en silence du montant dû par le copropriétaire ;
- remboursement tracé par une écriture inverse, sans effacer le paiement
  d'origine ;
- identifiants du prestataire par syndicat, chiffrés côté serveur, jamais
  dans l'application mobile ni dans le dépôt.

## 5. Corrections faites le 21/10/2026 sur l'existant

- Stripe Checkout (abonnement) :
  - **Clé d'idempotence :** elle était régénérée à chaque appel et pas transmise à Stripe. Elle est désormais stable et transmise.
  - **Doubles demandes :** deux demandes simultanées créaient deux abonnements en attente. Elles sont maintenant sérialisées par condominium.
  - **Échec de création de session :** il laissait des lignes « en attente ». Ce cas est désormais traité.
  - **Session expirée :** gérée via `checkout.session.expired`.
  - **Tentative abandonnée :** elle est libérée après 10 minutes.
- L'application mobile n'ouvrait jamais Stripe : « Carte » créait un paiement
  en attente impossible à régler. Elle ouvre maintenant la session de
  paiement, et l'état est relu sur le serveur.
- PayPal et la « passerelle marocaine » n'étaient pas intégrés mais étaient
  proposés dès que des variables d'environnement existaient : désactivés.

Non testé de bout en bout : aucune clé Stripe de test n'est configurée dans
l'environnement local (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).
