import { db, subscriptionPlansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getStripeClient } from "./stripeClient.js";

const stripe = getStripeClient();

async function findProduct(planId: string, name: string) {
  const products = await stripe.products.list({ active: true, limit: 100 });
  return products.data.find((product) => product.metadata?.mizanPlanId === planId)
    ?? await stripe.products.create({
      name: `MIZAN ${name}`,
      description: `Abonnement MIZAN — ${name}`,
      metadata: { mizanPlanId: planId },
    });
}

async function ensurePrice(
  productId: string,
  amount: string | number | null,
  interval: "month" | "year",
) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return null;
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const existing = prices.data.find(
    (price) =>
      price.currency === "mad" &&
      price.unit_amount === Math.round(numericAmount * 100) &&
      price.recurring?.interval === interval,
  );
  if (existing) return existing;
  return stripe.prices.create({
    product: productId,
    unit_amount: Math.round(numericAmount * 100),
    currency: "mad",
    recurring: { interval },
    metadata: { mizanBillingInterval: interval === "year" ? "yearly" : "monthly" },
  });
}

async function main() {
  const plans = await db
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.isActive, true));
  for (const plan of plans.filter((item) => !item.isTrial)) {
    const product = await findProduct(plan.id, plan.name);
    const monthly = await ensurePrice(product.id, plan.price, "month");
    const yearly = await ensurePrice(product.id, plan.yearlyPrice, "year");
    console.log(`Stripe catalog ready for ${plan.name}: ${monthly?.id ?? "no monthly"}, ${yearly?.id ?? "no yearly"}`);
  }
}

main().catch((error) => {
  console.error("Stripe catalog seeding failed:", error.message);
  process.exit(1);
});