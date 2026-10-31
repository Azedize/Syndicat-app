import Stripe from "stripe";

let stripe: Stripe | null = null;

export function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY est requis pour utiliser Stripe");
  }
  if (!stripe) stripe = new Stripe(secretKey);
  return stripe;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET est requis pour vérifier les webhooks Stripe");
  }
  return secret;
}