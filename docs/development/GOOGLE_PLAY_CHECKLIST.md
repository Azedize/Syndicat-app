# Publication sur Google Play : liste de contrôle

Pour le propriétaire du projet. Mise à jour le 02/11/2026.

Contrôle automatique : `pnpm --filter @workspace/scripts run release:check` (il ne construit et ne publie rien).

## À fournir avant toute publication

| Élément | Pourquoi | Qui |
|---|---|---|
| Serveur de production en HTTPS | L'app ne peut rien faire sans API. Les pages publiques en dépendent aussi. | Propriétaire |
| Compte Expo et `extra.eas.projectId` | Sans lui, ni build EAS ni jeton de notification Expo. | Propriétaire |
| Compte Google Play Console | Publication et compte de service. | Propriétaire |
| Raison sociale et e-mail de confidentialité (`EXPO_PUBLIC_LEGAL_ENTITY`, `EXPO_PUBLIC_PRIVACY_EMAIL`) | Sinon la politique affiche « à compléter ». | Propriétaire |
| Relecture juridique de la politique et des CGU | L'écran affirme une conformité à la loi 09-08 et au RGPD que personne n'a vérifiée. Déclaration à la CNDP à vérifier. | Juriste |
| Lieu d'hébergement | La section « Transferts internationaux » en dépend. | Propriétaire |

## À décider, car irréversible ou coûteux

- **Identifiant Android :** `com.syndycatglobalcps.app` porte l'ancien nom. Il ne peut plus changer après la première publication.
- **Clé de signature :** à laisser gérer par Play App Signing. Ne jamais la mettre dans Git.
- **Adresse d'envoi :** Gmail personnel aujourd'hui, avec une limite d'envoi quotidienne. Un domaine propre (SPF, DKIM, DMARC) est préférable.

## Exigences de Google Play

| Exigence | État |
|---|---|
| Viser l'API 36 | Configuré (React Native 0.88). Pas encore confirmé sur un fichier compilé. |
| Permissions justifiées | Fait dans la configuration. Liste finale à relire sur le fichier compilé. |
| Suppression de compte dans l'app | Fait et testé. |
| Lien web public de suppression | Page prête (`/api/account-deletion`). Il lui manque une adresse publique. |
| URL publique de la politique de confidentialité | **Manquante.** L'écran n'existe que dans l'app. |
| Formulaire Data safety | Brouillon ci-dessous, à valider. |
| Accès pour les examinateurs | Compte de démonstration à créer sur le serveur de production. |
| Fiche : description, captures, icône 512 px, image 1024 × 500 | À préparer. |
| Test fermé | Google l'exige pour certains comptes personnels récents : à vérifier sur la Console. |

## Permissions Android

| Permission | Motif |
|---|---|
| `INTERNET` | Accès à l'API |
| `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `VIBRATE` | Notifications |
| `CAMERA` (ajoutée à la compilation par `expo-image-picker`) | Photo d'un justificatif de paiement |
| `READ/WRITE_EXTERNAL_STORAGE` (jusqu'à Android 12) | Choix d'images sur les anciens téléphones |

Bloquées : `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`.

## Brouillon du formulaire Data safety

Établi à partir du code. Aucun SDK de publicité, d'analyse ou de suivi de plantages n'est présent. Aucune localisation ni lecture des contacts du téléphone.

| Donnée | Collectée | Usage |
|---|---|---|
| Nom, e-mail, téléphone | Oui | Compte, gestion de la résidence |
| Photo de profil, photos de justificatifs, images d'annonces | Oui | Fonctions de l'app |
| Documents de copropriété, fichiers joints | Oui | Fonctions de l'app |
| Messages entre résidents | Oui | Fonctions de l'app |
| Charges, paiements, commandes | Oui | Gestion financière |
| Jeton de notification | Oui | Notifications |
| Adresse IP, journaux d'audit | Oui | Sécurité |

**Prestataires qui reçoivent des données, à déclarer :**

| Prestataire | Donnée | Quand |
|---|---|---|
| Google (Gmail SMTP) | E-mail, contenu des messages | Envois d'e-mails |
| Expo Push, Google FCM | Jeton, texte de la notification | Notifications |
| Zimsend | Numéro de téléphone, texte du SMS | Si les SMS sont activés |
| Stripe | Données de paiement | Si le paiement Stripe est activé. Disponibilité au Maroc non acquise. |
| Google Cloud Storage | Fichiers | Si ce stockage est retenu en production |
| Cloudflare (cdnjs) | Adresse IP | Chargement du lecteur PDF |

Chiffrement en transit : seulement si l'API de production est en HTTPS, ce que `release:check` exige.
La politique de confidentialité ne nomme pas ces prestataires et ne mentionne ni les messages ni les justificatifs : à compléter lors de la relecture juridique.

## Risques connus à l'ouverture

- `zod` 3 : faille haute de consommation mémoire, corrigée seulement en version 4.
- Après une réinitialisation, un jeton d'accès déjà émis reste valable jusqu'à 15 minutes.
- Le lecteur PDF charge `pdf.js` depuis un CDN public, sans contrôle d'intégrité. Il ne fonctionne pas hors ligne.
- L'invitation envoie un mot de passe temporaire par e-mail.
- Fonctionnement sur téléphone réel jamais vérifié.
