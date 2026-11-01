import { getStripeClient } from "../../integrations/stripe/stripeClient.js";

export function envPriceKey(planId: string) {
  return `STRIPE_PRICE_${planId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`;
}

export async function resolveStripePrice(
  plan: { id: string; price: string | null; yearlyPrice: string | null },
  interval: "monthly" | "yearly",
) {
  const stripe = getStripeClient();
  const expectedAmount = Number(interval === "yearly" ? plan.yearlyPrice : plan.price);
  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
    throw Object.assign(new Error("Le prix du plan n'est pas configuré"), {
      status: 409,
      code: "PLAN_PRICE_NOT_CONFIGURED",
    });
  }

  const configuredPriceId = process.env[envPriceKey(plan.id)];
  if (configuredPriceId) {
    const price = await stripe.prices.retrieve(configuredPriceId);
    if (
      !price.active ||
      price.type !== "recurring" ||
      price.currency !== "mad" ||
      price.unit_amount !== Math.round(expectedAmount * 100) ||
      price.recurring?.interval !== (interval === "yearly" ? "year" : "month")
    ) {
      throw Object.assign(new Error("Le prix Stripe configuré ne correspond pas au plan"), {
        status: 409,
        code: "STRIPE_PRICE_MISMATCH",
      });
    }
    return price;
  }

  const products = await stripe.products.list({ active: true, limit: 100 });
  const product = products.data.find((candidate) => candidate.metadata?.mizanPlanId === plan.id);
  if (!product) {
    throw Object.assign(
      new Error("Aucun produit Stripe n'est associé à ce plan. Exécutez seed-stripe-products."),
      { status: 409, code: "STRIPE_PRICE_NOT_CONFIGURED" },
    );
  }

  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  const price = prices.data.find(
    (candidate) =>
      candidate.type === "recurring" &&
      candidate.currency === "mad" &&
      candidate.unit_amount === Math.round(expectedAmount * 100) &&
      candidate.recurring?.interval === (interval === "yearly" ? "year" : "month"),
  );
  if (!price) {
    throw Object.assign(new Error("Aucun prix Stripe correspondant à ce plan"), {
      status: 409,
      code: "STRIPE_PRICE_NOT_CONFIGURED",
    });
  }
  return price;
}

export async function findOrCreateCustomer(userId: string, email: string, name: string) {
  const stripe = getStripeClient();
  const existing = await stripe.customers.search({
    query: `metadata['mizanUserId']:'${userId.replaceAll("'", "")}'`,
    limit: 1,
  });
  if (existing.data[0]) return existing.data[0];
  return stripe.customers.create({
    email,
    name,
    metadata: { mizanUserId: userId },
  });
}
