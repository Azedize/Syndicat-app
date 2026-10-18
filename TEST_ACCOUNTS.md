# Comptes de test

Comptes de **démonstration** créés par le seed (`pnpm --filter @workspace/scripts run seed`).
Vérifiés dans la base de développement le 2026-10-18 : tous actifs, mot de passe ci-dessous.

> ⚠️ Développement uniquement. Ces comptes et ce mot de passe ne doivent jamais exister
> sur un environnement de production.

**Mot de passe de tous les comptes : `password123`**

Connexion : écran de connexion de l'application, avec l'email et le mot de passe.
Après 60 tentatives en 15 minutes depuis la même adresse, l'API répond 429 : il faut
attendre ou redémarrer l'API locale.

## Plateforme

| Rôle | Nom | Email (login) |
|---|---|---|
| Super admin (propriétaire de la plateforme) | Karim Bensouda | `superadmin@mizan.ma` |

## Syndicat Résidence Atlas

| Rôle | Nom | Email (login) | Lot(s) |
|---|---|---|---|
| Syndic (administrateur) | Nadia Ouahbi | `syndic@andalous.ma` | — |
| Président | Abdelhak Essaidi | `president@andalous.ma` | — |
| Trésorier | Fatima Zahra Amghar | `tresorier@andalous.ma` | — |
| Secrétaire | Samir Hamdouch | `secretaire@andalous.ma` | — |
| Membre du conseil syndical | Naima Beldjoudi | `conseil@andalous.ma` | — |
| Copropriétaire | Mohammed Alaoui | `mohammed.alaoui@residence-atlas.ma` | A101, A301 |
| Copropriétaire | Khadija Tahiri | `khadija.tahiri@residence-atlas.ma` | A102, B01 |
| Copropriétaire | Hassan Cherkaoui | `hassan.cherkaoui@residence-atlas.ma` | A205 |
| Locataire | Sara Bouzid | `sara.bouzid@gmail.com` | loue A205 |

## Syndicat Les Jardins d'Agdal

| Rôle | Nom | Email (login) | Lot(s) |
|---|---|---|---|
| Syndic (administrateur) | Youssef Idrissi | `syndic@jardins-agdal.ma` | — |
| Copropriétaire | Rachid El Amrani | `rachid.elamrani@jardins-agdal.ma` | Ag-12, Ag-01 |
| Copropriétaire | Amina Rachidi | `amina.rachidi@jardins-agdal.ma` | Ag-02 |
| Locataire | Omar Zaki | `omar.zaki@gmail.com` | loue Ag-01 |

Agdal n'a pas de président, trésorier, secrétaire ni conseil dans le seed.

## Idées de vérifications

- **Isolation entre copropriétés** : se connecter avec `syndic@andalous.ma` puis `syndic@jardins-agdal.ma` ;
  aucun ne voit les données de l'autre.
- **Rôles** : le trésorier valide les paiements et paie les dépenses ; le président approuve les dépenses ;
  le conseil lit la trésorerie sans écrire.
- **Résident** : `mohammed.alaoui@…` voit ses deux lots et ses appels de fonds ; il ne voit pas ceux de
  `khadija.tahiri@…`.
- **Locataire** : `sara.bouzid@gmail.com` voit son lot et son bail, sans données financières.
- **Réclamations** : signaler avec un copropriétaire, traiter sur le tableau avec `syndic@andalous.ma`.

## Réinitialiser

Si un mot de passe a été changé pendant un test, relancer le seed (les comptes existants ne sont pas
écrasés : supprimer d'abord le compte concerné, ou réinitialiser la base de développement).
Les suites de tests automatiques créent leurs propres comptes temporaires et les suppriment à la fin.
