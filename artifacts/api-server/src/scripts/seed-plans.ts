/**
 * Seed subscription plans — run once.
 * Usage: pnpm --filter @workspace/api-server tsx src/scripts/seed-plans.ts
 */
import { db } from "@workspace/db";
import { subscriptionPlansTable } from "@workspace/db/schema";

const PLANS = [
  {
    name: "Essai Gratuit",
    description: "Découvrez toutes les fonctionnalités pendant 30 jours, sans engagement.",
    price: "0",
    yearlyPrice: "0",
    interval: "monthly",
    isTrial: true,
    isActive: true,
    sortOrder: 0,
    color: "#3b82f6",
    maxBuildings: 1,
    maxLots: 10,
    maxMembers: 20,
    maxStorageGb: 1,
    maxDocuments: 50,
    maxSignatures: 10,
    features: JSON.stringify([
      "1 immeuble",
      "10 lots maximum",
      "20 membres maximum",
      "1 Go de stockage",
      "50 documents",
      "10 signatures électroniques",
      "Réunions & PV",
      "Gestion financière de base",
      "Support par email",
    ]),
  },
  {
    name: "Starter",
    description: "Idéal pour les petits syndicats qui démarrent leur digitalisation.",
    price: "299",
    yearlyPrice: "2990",
    interval: "monthly",
    isTrial: false,
    isActive: true,
    sortOrder: 1,
    color: "#10b981",
    maxBuildings: 3,
    maxLots: 50,
    maxMembers: 100,
    maxStorageGb: 5,
    maxDocuments: 200,
    maxSignatures: 50,
    features: JSON.stringify([
      "3 immeubles",
      "50 lots maximum",
      "100 membres maximum",
      "5 Go de stockage",
      "200 documents",
      "50 signatures électroniques",
      "Réunions & assemblées générales",
      "Gestion financière complète",
      "Appels de fonds",
      "Notifications push",
      "Support prioritaire",
    ]),
  },
  {
    name: "Professional",
    description: "Pour les syndicats en croissance avec des besoins avancés.",
    price: "699",
    yearlyPrice: "6990",
    interval: "monthly",
    isTrial: false,
    isActive: true,
    sortOrder: 2,
    color: "#7c3aed",
    maxBuildings: 10,
    maxLots: 200,
    maxMembers: 500,
    maxStorageGb: 20,
    maxDocuments: 1000,
    maxSignatures: 200,
    features: JSON.stringify([
      "10 immeubles",
      "200 lots maximum",
      "500 membres maximum",
      "20 Go de stockage",
      "1 000 documents",
      "200 signatures électroniques",
      "Signatures multi-parties",
      "Rapports avancés",
      "Analytiques financières",
      "Journal d'audit",
      "Marketplace partenaires",
      "Export Excel & PDF",
      "API access",
      "Support dédié",
    ]),
  },
  {
    name: "Business",
    description: "Pour les grandes organisations immobilières multi-immeubles.",
    price: "1299",
    yearlyPrice: "12990",
    interval: "monthly",
    isTrial: false,
    isActive: true,
    sortOrder: 3,
    color: "#f59e0b",
    maxBuildings: 30,
    maxLots: 1000,
    maxMembers: 2000,
    maxStorageGb: 100,
    maxDocuments: 5000,
    maxSignatures: 1000,
    features: JSON.stringify([
      "30 immeubles",
      "1 000 lots maximum",
      "2 000 membres maximum",
      "100 Go de stockage",
      "5 000 documents",
      "1 000 signatures électroniques",
      "Workflows de signature avancés",
      "Tableau de bord national",
      "IA assistant (beta)",
      "Branding personnalisé",
      "Intégrations tierces",
      "SLA 99.9%",
      "Account manager dédié",
    ]),
  },
  {
    name: "Enterprise",
    description: "Solution sur mesure pour les plateformes et fédérations nationales.",
    price: "2499",
    yearlyPrice: "24990",
    interval: "monthly",
    isTrial: false,
    isActive: true,
    sortOrder: 4,
    color: "#ec4899",
    maxBuildings: null,   // unlimited
    maxLots: null,
    maxMembers: null,
    maxStorageGb: null,
    maxDocuments: null,
    maxSignatures: null,
    features: JSON.stringify([
      "Immeubles illimités",
      "Lots illimités",
      "Membres illimités",
      "Stockage illimité",
      "Documents illimités",
      "Signatures illimitées",
      "Tout Professional +",
      "Déploiement dédié",
      "Conformité RGPD avancée",
      "Rapports sur mesure",
      "Formation & onboarding",
      "SLA 99.99%",
      "Support 24/7",
    ]),
  },
];

async function seed() {
  console.log("Seeding subscription plans...");
  for (const plan of PLANS) {
    const existing = await db
      .select({ id: subscriptionPlansTable.id })
      .from(subscriptionPlansTable)
      .where((t: any) => t.name.equals(plan.name))
      .limit(1)
      .catch(() => []);

    if (existing.length > 0) {
      console.log(`  ↳ Skip (exists): ${plan.name}`);
      continue;
    }

    await db.insert(subscriptionPlansTable).values(plan as any);
    console.log(`  ✓ Created: ${plan.name}`);
  }
  console.log("Done.");
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
