# Tests — Module Documents SYNDYCAT GLOBAL CPS
> Généré le 15/07/2026 — Production Ready Implementation

---

## 1. Tests Fonctionnels (50 tests)

### 1.1 Génération de documents

| # | Test | Méthode | Condition | Résultat attendu |
|---|------|---------|-----------|-----------------|
| F01 | Générer attestation | POST /documents | Admin, syndicateId valide, category=attestation | 201, doc.fileUrl non vide, doc.status=generated |
| F02 | Générer PV | POST /documents | Admin, category=pv | 201, templateId=pv, documentNumber généré |
| F03 | Générer convocation | POST /documents | Admin, category=pv, content fourni | 201, size calculé en Ko |
| F04 | Générer mise en demeure | POST /documents | Admin, category=juridique | 201, templateId=mise_en_demeure |
| F05 | Générer circulaire | POST /documents | Admin, category=reglements | 201, templateId=circulaire |
| F06 | Générer rapport finances | POST /documents | Admin, category=finances | 201, templateId=rapport |
| F07 | Génération sans content | POST /documents | Admin, sans champ content | 201, content=null, size=0Ko |
| F08 | Génération avec memberName | POST /documents | Admin + memberName="John" | 201, memberName intégré dans PDF |
| F09 | Titre trop long | POST /documents | title > 500 chars | 400 Données invalides |
| F10 | Catégorie invalide | POST /documents | category="autre" | 400 Données invalides |

### 1.2 Liste et consultation

| # | Test | Méthode | Condition | Résultat attendu |
|---|------|---------|-----------|-----------------|
| F11 | Lister tous les docs | GET /documents | Admin authentifié | 200, array |
| F12 | Filtrer par catégorie | GET /documents?category=pv | Admin | 200, docs.category === "pv" seulement |
| F13 | Filtrer par statut | GET /documents?status=published | Tout rôle | 200, docs.status === "published" seulement |
| F14 | Récupérer par ID | GET /documents/:id | Propriétaire du syndicat | 200, doc complet |
| F15 | ID inexistant | GET /documents/:id | Admin | 404 Document introuvable |
| F16 | Lister sans auth | GET /documents | Sans token | 401 Non authentifié |
| F17 | Voir doc d'autre syndicat | GET /documents/:id | Autre syndicateId | 403 Accès refusé |
| F18 | Member voit publiés seulement | GET /documents | role=member | 200, status=published uniquement |
| F19 | Member ne voit pas drafts | GET /documents | role=member | Draft absent de la liste |
| F20 | Tenant voit publiés seulement | GET /documents | role=tenant | 200, status=published uniquement |

### 1.3 URL de téléchargement

| # | Test | Méthode | Condition | Résultat attendu |
|---|------|---------|-----------|-----------------|
| F21 | Obtenir URL signée | GET /documents/:id/download-url | Admin, doc avec fileUrl | 200, { url, expiresIn: 3600 } |
| F22 | Doc sans PDF | GET /documents/:id/download-url | Admin, doc sans fileUrl | 404 Aucun fichier PDF |
| F23 | URL expirée en 1h | GET /documents/:id/download-url | Admin | url valide 3600s, expirée après |
| F24 | Member télécharge publié | GET /documents/:id/download-url | role=member, published | 200, URL signée |
| F25 | Member télécharge draft | GET /documents/:id/download-url | role=member, draft | 403 Document non publié |

### 1.4 Workflow — transitions d'état

| # | Test | Méthode | Transition | Résultat attendu |
|---|------|---------|------------|-----------------|
| F26 | draft → generated | PUT /documents/:id | status=generated | 200, version incrémenté |
| F27 | draft → pending_review | PUT /documents/:id | status=pending_review | 200 |
| F28 | generated → validated | PUT /documents/:id | status=validated | 200 |
| F29 | validated → signed | PUT /documents/:id | status=signed | 200, signedAt défini |
| F30 | signed → published | PUT /documents/:id | status=published | 200, publishedAt défini |
| F31 | published → archived | PUT /documents/:id | status=archived | 200, archivedAt défini |
| F32 | archived → published | PUT /documents/:id | status=published | 422 Transition invalide |
| F33 | published → draft | PUT /documents/:id | status=draft | 422 Transition invalide |
| F34 | signed → draft | PUT /documents/:id | status=draft | 422 Transition invalide |
| F35 | Mise à jour titre seul | PUT /documents/:id | { title: "Nouveau titre" } | 200, version incrémenté |

### 1.5 Signatures électroniques

| # | Test | Méthode | Condition | Résultat attendu |
|---|------|---------|-----------|-----------------|
| F36 | Signer document validé | POST /documents/:id/sign | Admin, status=validated | 201, sig créé, doc.status=signed |
| F37 | Signer sans signatureData | POST /documents/:id/sign | Admin | 201, signatureData=null |
| F38 | Signer avec pad data | POST /documents/:id/sign | Admin + base64 PNG | 201, signatureData stocké |
| F39 | Signer document draft | POST /documents/:id/sign | Admin, status=draft | 422 ne peut pas être signé |
| F40 | Lister signatures | GET /documents/:id/signatures | Admin | 200, tableau de signatures |

### 1.6 Modification et suppression

| # | Test | Méthode | Condition | Résultat attendu |
|---|------|---------|-----------|-----------------|
| F41 | Modifier contenu | PUT /documents/:id | Admin, propriétaire | 200, version incrémenté |
| F42 | Modifier catégorie | PUT /documents/:id | Admin | 200, category mis à jour |
| F43 | Modifier doc autre syndicat | PUT /documents/:id | Autre syndicat | 403 Accès refusé |
| F44 | Supprimer document | DELETE /documents/:id | Admin, propriétaire | 200 Supprimé |
| F45 | Supprimer doc autre syndicat | DELETE /documents/:id | Autre syndicat | 403 Accès refusé |
| F46 | Supprimer inexistant | DELETE /documents/:id | ID inconnu | 404 Introuvable |
| F47 | Suppression efface GCS | DELETE /documents/:id | Doc avec fileUrl | GCS object supprimé |
| F48 | Member ne peut pas supprimer | DELETE /documents/:id | role=member | 403 Rôle insuffisant |
| F49 | Rafraîchir liste après génération | Mobile: handleGenerate | Génération réussie | Liste mise à jour immédiatement |
| F50 | Aperçu contenu texte | Mobile: handlePreview | Doc avec content | Modal affiche le contenu |

---

## 2. Tests de Sécurité (20 tests)

| # | Test | Vecteur d'attaque | Résultat attendu |
|---|------|-------------------|-----------------|
| S01 | Sans token JWT | GET /documents | 401 Unauthorized |
| S02 | Token expiré | GET /documents | 401 Token invalide |
| S03 | Token forgé | GET /documents | 401 Signature invalide |
| S04 | IDOR — lire doc autre syndicat | GET /documents/:id | 403 Accès refusé |
| S05 | IDOR — modifier doc autre syndicat | PUT /documents/:id | 403 Accès refusé |
| S06 | IDOR — supprimer doc autre syndicat | DELETE /documents/:id | 403 Accès refusé |
| S07 | IDOR — signer doc autre syndicat | POST /documents/:id/sign | 403 Accès refusé |
| S08 | syndicate_admin sans syndicateId | POST /documents | 403 syndicateId manquant |
| S09 | Member génère un doc | POST /documents | 403 Rôle insuffisant |
| S10 | Tenant génère un doc | POST /documents | 403 Rôle insuffisant |
| S11 | Injection SQL via title | POST /documents | title="'; DROP TABLE--" | 400 ou stocké comme texte inoffensif |
| S12 | XSS via content | POST /documents | content="<script>…</script>" | Stocké, jamais exécuté (PDF non HTML) |
| S13 | Contenu excessif | POST /documents | content > 500000 chars | 400 Données invalides |
| S14 | URL download-url sans auth | GET /documents/:id/download-url | Sans token | 401 |
| S15 | Signed URL réutilisation après TTL | GCS signed URL | Après 3600s | 403 URL expirée (GCS) |
| S16 | Audit log POST | POST /documents | Génération réussie | auditLogsTable contient DOCUMENT_GENERATED |
| S17 | Audit log PUT | PUT /documents/:id | Mise à jour réussie | auditLogsTable contient DOCUMENT_UPDATED |
| S18 | Audit log DELETE | DELETE /documents/:id | Suppression réussie | auditLogsTable contient DOCUMENT_DELETED |
| S19 | Audit log SIGN | POST /documents/:id/sign | Signature réussie | auditLogsTable contient DOCUMENT_SIGNED |
| S20 | Audit log DOWNLOAD | GET /documents/:id/download-url | Accès réussi | auditLogsTable contient DOCUMENT_DOWNLOAD |

---

## 3. Tests Mobile (20 tests)

| # | Test | Plateforme | Scénario | Résultat attendu |
|---|------|-----------|----------|-----------------|
| M01 | Afficher liste vide | iOS/Android | Aucun document | "Aucun document trouvé" affiché |
| M02 | Afficher liste avec docs | iOS/Android | Documents chargés | FlatList avec cartes |
| M03 | Filtrer par catégorie | iOS/Android | Tap sur "PV" | Seuls les PV affichés |
| M04 | Recherche textuelle | iOS/Android | Saisir dans SearchBar | Filtre en temps réel |
| M05 | Ouvrir détail | iOS/Android | Tap sur une carte | Modal détail s'ouvre |
| M06 | Bouton admin visible | iOS (admin) | role=syndicate_admin | Bouton "+" visible |
| M07 | Bouton admin caché | iOS (member) | role=member | Bouton "+" absent |
| M08 | Bouton admin caché (tenant) | iOS (tenant) | role=tenant | Bouton "+" absent |
| M09 | Ouvrir modal génération | iOS (admin) | Tap "+" | Liste des 6 templates |
| M10 | Sélectionner un template | iOS | Tap sur template | Formulaire apparaît |
| M11 | Générer document | iOS | Remplir + Générer | Alert succès + liste rafraîchie |
| M12 | Télécharger PDF (avec fichier) | iOS | Tap Télécharger, fileUrl présent | ShareSheet native ouvre le PDF |
| M13 | Télécharger PDF (sans fichier) | iOS | Tap Télécharger, pas de fileUrl | Alert avec contenu texte |
| M14 | Partager PDF | iOS | Tap Partager | ShareSheet native |
| M15 | Partager sans PDF | Android | Tap Partager, pas de fileUrl | Share.share() avec titre |
| M16 | Aperçu contenu | iOS | Tap Aperçu | Modal texte |
| M17 | Éditer document (admin) | iOS (admin) | Tap Modifier | Modal édition |
| M18 | Sauvegarder édition | iOS | Saisir + Sauvegarder | updateDocument() appelé |
| M19 | Stats en tête | iOS | Affichage | Compteurs Publiés/Brouillons/En attente |
| M20 | Favoris | iOS | Tap étoile | Document ajouté aux favoris |

---

## 4. Tests Multi-tenant (20 tests)

| # | Test | Isolation | Comportement attendu |
|---|------|-----------|---------------------|
| T01 | Syndicat A ne voit pas docs syndicat B | GET /documents | Résultats filtrés par syndicateId |
| T02 | super_admin voit tous les docs | GET /documents | Tous les syndicats retournés |
| T03 | Create doc syndicat A, liste depuis B | POST + GET | Doc absent de la liste B |
| T04 | Modifier doc syndicat A depuis B | PUT | 403 Accès refusé |
| T05 | Supprimer doc syndicat A depuis B | DELETE | 403 Accès refusé |
| T06 | Signer doc syndicat A depuis B | POST /sign | 403 Accès refusé |
| T07 | URL download doc syndicat A depuis B | GET /download-url | 403 Accès refusé |
| T08 | Transition workflow cross-tenant | PUT status | 403 Accès refusé |
| T09 | Audit log scoped par syndicat | audit | actorRole + syndicateId cohérents |
| T10 | Notification scoped au syndicat | POST /documents | Alert.syndicateId = doc.syndicateId |
| T11 | Member syndicat A accède doc syndicat B | GET /documents/:id | 403 Accès refusé |
| T12 | Tenant syndicat A accède doc syndicat B | GET /documents/:id | 403 Accès refusé |
| T13 | syndicate_admin créé sans syndicateId | POST /documents | 403 syndicateId manquant |
| T14 | PDF généré avec nom syndicat correct | POST /documents | PDF.content = syndName du bon syndicat |
| T15 | Compteurs stats par syndicat | GET /documents | Compteurs filtrés par syndicateId |
| T16 | super_admin crée pour syndicat A | POST + syndicateId=A | Doc.syndicateId = A |
| T17 | Deux syndicats ont même doc number | documentNumber | Pas de contrainte unique inter-syndicat |
| T18 | Signature cross-tenant bloquée | POST /sign | 403 même si doc est public |
| T19 | Soft delete scoped | DELETE | Autre syndicat ne peut pas supprimer |
| T20 | GCS cleanup après delete | DELETE | fileUrl GCS supprimé même si autre syndicat |

---

## 5. Tests Génération PDF (20 tests)

| # | Test | Template | Vérification |
|---|------|---------|-------------|
| P01 | Génération attestation | attestation | Buffer > 0 bytes, Content-Type: application/pdf |
| P02 | Génération PV | pv | Contenu "PROCÈS-VERBAL" dans PDF |
| P03 | Génération convocation | convocation | Contenu "CONVOCATION" dans PDF |
| P04 | Génération contrat | contrat | Contenu "CONTRAT" dans PDF |
| P05 | Génération rapport | rapport | Contenu "RAPPORT D'ACTIVITÉ" dans PDF |
| P06 | Génération décision | decision | Contenu "DÉCISION SYNDICALE" dans PDF |
| P07 | Génération certificat | certificat | Contenu "CERTIFICAT" dans PDF |
| P08 | Génération circulaire | circulaire | Contenu "CIRCULAIRE INTERNE" dans PDF |
| P09 | Génération mise en demeure | mise_en_demeure | Contenu "MISE EN DEMEURE" dans PDF |
| P10 | Nom du syndicat dans PDF | Tous | syndName visible dans l'en-tête |
| P11 | Numérotation automatique | Tous | documentNumber présent et unique |
| P12 | Date du jour dans PDF | Tous | Date au format DD/MM/YYYY |
| P13 | En-tête SYNDYCAT | Tous | Text "SYNDYCAT" en violet #7c3aed |
| P14 | Pied de page numéroté | Tous | "Page 1 / N" dans footer |
| P15 | Bloc signature présent | Tous | Ligne signature + rôle |
| P16 | Taille fichier > 0Ko | Tous | fileSizeKo != "0Ko" |
| P17 | Upload GCS réussit | Tous | fileUrl commence par /objects/documents/ |
| P18 | URL signée retournée | GET /download-url | URL commence par https://storage.googleapis.com |
| P19 | Fallback si GCS indisponible | POST /documents | 201, fileUrl="" mais doc créé |
| P20 | Téléchargement PDF valide | Mobile | PDF ouvert par la visionneuse native |

---

## Résumé des tests

| Catégorie | Total | Automatisables | Manuels |
|-----------|-------|---------------|---------|
| Fonctionnels | 50 | 40 | 10 |
| Sécurité | 20 | 18 | 2 |
| Mobile | 20 | 5 | 15 |
| Multi-tenant | 20 | 18 | 2 |
| PDF | 20 | 15 | 5 |
| **TOTAL** | **130** | **96** | **34** |
