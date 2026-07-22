# AUDIT PHASE 02 — MENU AUDIT
> Generated: 2026-07-22 | SYNDYCAT GLOBAL CPS

---

## Bottom Tab Bar

| Tab | Visible To | Frequency | Classification | Issues |
|---|---|---|---|---|
| Dashboard | All roles | Daily | **Critical** | ✅ Correct |
| Members | super_admin, syndicate_admin | Weekly | **Important** | ⚠️ secretary/treasurer/president need member directory too |
| Finance | syndicate_admin, treasurer | Daily | **Critical** | ❌ treasurer sees MEMBER view (bug in finance.tsx) |
| Marketplace | syndicate_admin only | Weekly | **Important** | ❌ members should browse marketplace |
| More | All roles | Daily | **Critical** | ✅ Correct |

---

## More Menu — Full Analysis

### Section: SUPER ADMIN (Platform Administration)
| Item | Route | Roles | Frequency | Classification | Verdict |
|---|---|---|---|---|---|
| Tableau National | /tableau-national | super_admin | Weekly | Critical | ✅ Correct |
| Gestion Utilisateurs | /utilisateurs | super_admin | Monthly | Important | ✅ Correct |
| Créer Syndicat | /syndicate-setup | super_admin | Rarely | Important | ✅ Correct |
| Journal Audit | /journal-audit | super_admin | Weekly | Important | ✅ Correct |
| Statistiques Globales | /statistiques | super_admin | Weekly | Important | ✅ Correct |
| Marketplace Moderation | /admin/marketplace | super_admin | Weekly | Important | ✅ Correct |
| Modèles Plateforme | /template-studio | super_admin | Monthly | Optional | ✅ Correct |

### Section: BUILDING (Syndicate Admin)
| Item | Route | Roles | Frequency | Classification | Verdict |
|---|---|---|---|---|---|
| Buildings/Résidences | /buildings | syndicate_admin | Monthly | Important | ✅ Correct — operational |
| Lots/Units | /lots | syndicate_admin | Monthly | Important | ❌ secretary should also see lots for convocation |
| Owners | /members | syndicate_admin | Weekly | Critical | ❌ treasurer/president/secretary need this |
| Locataires | /locataires | syndicate_admin | Monthly | Important | ✅ Correct |

### Section: MY HOME (Tenant)
| Item | Route | Roles | Frequency | Classification | Verdict |
|---|---|---|---|---|---|
| My Apartment | /mon-lot | tenant | Daily | Critical | ✅ Correct |
| Mon Bail | /mon-bail | tenant | Monthly | Important | ✅ Correct |
| Etat des Lieux | /etat-des-lieux | tenant | Rarely | Optional | ✅ Correct — needed at move-in/out |

**NOTE:** `member` role has `/mon-lot` route accessible but NOT listed in My Home section — it's accessed via a different path. Members should also have a "My Apartment" item pointing to their lot details.

### Section: FINANCE
| Item | Route | Roles | Frequency | Classification | Verdict |
|---|---|---|---|---|---|
| Tableau Bord | /tableau-bord-financier | syndicate_admin, treasurer | Daily | Critical | ✅ Correct roles |
| Charges & Appels | /charges | syndicate_admin, treasurer, member | Daily | Critical | ✅ Correct — member needs to pay |
| Cotisations | /cotisations | member | Monthly | Important | ✅ Correct |
| Payment History | /paiements | member, tenant | Monthly | Important | ✅ Correct |
| Budget Prévisionnel | /budget-previsionnel | syndicate_admin, treasurer | Monthly | Critical | ❌ president chairs AG where budget is voted — should see this |
| Devis & Factures | /invoices | syndicate_admin, treasurer | Weekly | Important | ✅ Correct |
| Fiches Paie | /fiches-paie | syndicate_admin, treasurer | Monthly | Important | ✅ Correct |
| Bon Livraison | /bon-livraison | syndicate_admin, treasurer | Weekly | Important | ✅ Correct |
| Escalation | /escalation | syndicate_admin, treasurer | Monthly | Important | ✅ Correct |

### Section: MAINTENANCE
| Item | Route | Roles | Frequency | Classification | Verdict |
|---|---|---|---|---|---|
| Travaux | /travaux | syndicate_admin, president | Monthly | Important | ❌ committee_member should also see — they vote on works |
| Prestataires | /prestataires | syndicate_admin, president | Monthly | Important | ❌ same — committee oversight |
| Sinistres | /sinistres | syndicate_admin, president | Monthly | Important | ❌ same |
| Travaux Privatifs | /travaux-privatifs | syndicate_admin | Monthly | Optional | ✅ Correct — admin operation |
| Parking & Véhicules | /parking | syndicate_admin | Monthly | Optional | ✅ Correct |

### Section: GOVERNANCE
| Item | Route | Roles | Frequency | Classification | Verdict |
|---|---|---|---|---|---|
| Assemblée Générale | /assemblee-generale | syndicate_admin, president, secretary, committee_member | Monthly | Critical | ✅ Correct |
| Réunions | /meetings | syndicate_admin, president, secretary, committee_member | Weekly | Critical | ✅ Correct |
| Élections | /elections | syndicate_admin, president, committee_member, member | Yearly | Important | ✅ Correct — member votes |
| PV Réunions | /pv | syndicate_admin, president, secretary, committee_member, member | Monthly | Important | ✅ Correct |
| Gouvernance | /governance | syndicate_admin, president, committee_member | Monthly | Critical | ❌ secretary should be included — prepares organigram |
| Membres Élus | /elected-members | all except super_admin, tenant | Monthly | Important | ✅ Correct |
| Actes Administratifs | /actes-administratifs | syndicate_admin, secretary, president | Monthly | Important | ✅ Correct |
| Réglements | /reglements | syndicate_admin, secretary, president | Monthly | Important | ✅ Correct |

### Section: DOCUMENTS
| Item | Route | Roles | Frequency | Classification | Verdict |
|---|---|---|---|---|---|
| Documents | /documents | syndicate_admin, secretary, president | Weekly | Critical | ❌ member needs document access (attestations, certificates) |
| Fiches Juridiques | /fiches-juridiques | syndicate_admin, secretary, president | Monthly | Optional | ⚠️ committee_member should see |
| Repertoire Juridique | /repertoire-juridique | syndicate_admin, secretary, president, committee_member | Monthly | Optional | ✅ Correct |
| Template Request | /template-request | syndicate_admin, secretary | Monthly | Optional | ✅ Correct |

### Section: COMMUNICATION
| Item | Route | Roles | Frequency | Classification | Verdict |
|---|---|---|---|---|---|
| Avis Résidents | /annonces | ALL_RESIDENTS | Daily | Critical | ✅ Correct |
| Publications | /publications | syndicate_admin, secretary, president | Weekly | Important | ❌ member/tenant should VIEW publications (they can't create, but should read) |
| Chat & Messagerie | /chat | syndicate_admin, president, secretary | Daily | Important | ❌ member/tenant cannot chat — major communication gap |
| Messagerie Interne | /messagerie-interne | syndicate_admin, secretary | Weekly | Important | ✅ Correct — internal management |
| Ideas | /ideas | syndicate_admin, president | Monthly | Optional | ❌ member/committee_member should suggest ideas |

### Section: SUPPORT
| Item | Route | Roles | Frequency | Classification | Verdict |
|---|---|---|---|---|---|
| Demandes Intervention | /support | ALL_RESIDENTS | Weekly | Critical | ✅ Correct |
| Support Plateforme | /platform-support | super_admin, syndicate_admin, mgmt team | Monthly | Important | ✅ Correct |
| Réclamations | /reclamations | syndicate_admin, president, member | Monthly | Important | ❌ tenant is missing — tenants file complaints too |

### Section: MARKETPLACE
| Item | Route | Roles | Frequency | Classification | Verdict |
|---|---|---|---|---|---|
| Mon Panier | /cart | syndicate_admin | Weekly | Important | ❌ member should shop |
| Mes Commandes | /orders | syndicate_admin | Weekly | Important | ❌ member should track orders |
| Ma Boutique | /my-shop | syndicate_admin | Monthly | Optional | ✅ Admin/seller manages their shop |

**NOTE:** `marketplace` bottom tab is only shown to `syndicate_admin`. Members have no way to browse or purchase from the marketplace.

### Section: STATISTICS
| Item | Route | Roles | Frequency | Classification | Verdict |
|---|---|---|---|---|---|
| Statistiques | /statistiques | syndicate_admin, treasurer | Monthly | Important | ✅ Correct |
| Plans Abonnements | /abonnements | super_admin, syndicate_admin | Monthly | Optional | ✅ Correct |

### Section: ACCOUNT
| Item | Route | Roles | Frequency | Classification | Verdict |
|---|---|---|---|---|---|
| Mon Profil | /profile | ALL | Daily | Critical | ✅ Correct |
| Notifications | /notifications | ALL | Daily | Critical | ✅ Correct |
| Settings | /settings | super_admin, syndicate_admin ONLY | Weekly | Important | ❌ ALL users need settings (language, dark mode, security) |
| CGU | /cgu | ALL | Rarely | Optional | ✅ Correct |

---

## Summary of Menu Issues

| # | Issue | Severity | Fix Required |
|---|---|---|---|
| M1 | Finance tab shows MEMBER view to treasurer | 🔴 Critical | Fix isAdmin in finance.tsx |
| M2 | Marketplace inaccessible to members (no cart/orders/tab) | 🔴 Critical | Add member to marketplace tab + cart/orders |
| M3 | Settings hidden from member/tenant | 🟠 High | Add ALL_USERS to settings |
| M4 | Documents hidden from member | 🟠 High | Add member to /documents |
| M5 | Reclamations missing tenant | 🟠 High | Add tenant to reclamations |
| M6 | Publications hidden from member/tenant | 🟡 Medium | Add read-only view for residents |
| M7 | Chat inaccessible to member/tenant | 🟡 Medium | Add member/tenant to chat |
| M8 | Ideas inaccessible to member/committee_member | 🟡 Medium | Add these roles |
| M9 | Budget visible to president (needed for AG) | 🟡 Medium | Add president to budget |
| M10 | Lots/Members hidden from secretary/treasurer/president | 🟡 Medium | Add syndicate team roles |
| M11 | committee_member missing from travaux/sinistres | 🟡 Medium | Add committee_member |
| M12 | secretary missing from governance | 🟡 Medium | Add secretary |
