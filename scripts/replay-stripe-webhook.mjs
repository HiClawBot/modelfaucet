#!/usr/bin/env node
import { createHmac } from "node:crypto";

const apiBaseUrl = process.env.MODELFAUCET_API_BASE_URL ?? "http://127.0.0.1:3001";
const checkoutSessionId = process.env.STRIPE_CHECKOUT_SESSION_ID ?? "cs_test_replay";
const stripeEventId = process.env.STRIPE_EVENT_ID ?? `evt_replay_${Date.now()}`;
const amountCents = Number(process.env.STRIPE_AMOUNT_CENTS ?? "500");
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

function isPrivateNetworkHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }

  if (
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  const octets = normalized.split(".");
  if (octets.length !== 4) {
    return false;
  }

  const parts = octets.map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first = -1, second = -1] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function assertReplayTarget(value) {
  const url = new URL(value);
  const isPrivate = isPrivateNetworkHostname(url.hostname);
  if (!isPrivate && process.env.ALLOW_REMOTE_WEBHOOK_REPLAY !== "1") {
    throw new Error(
      "Webhook replay refuses remote targets unless ALLOW_REMOTE_WEBHOOK_REPLAY=1 is set."
    );
  }

  return url;
}

function stripeSignature(rawBody, secret) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function assertValidAmount(value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("STRIPE_AMOUNT_CENTS must be a positive integer.");
  }
}

async function main() {
  assertValidAmount(amountCents);
  const target = new URL("/v1/stripe/webhook", assertReplayTarget(apiBaseUrl));
  const event = {
    id: stripeEventId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: checkoutSessionId,
        payment_status: "paid",
        amount_total: amountCents,
        currency: "usd"
      }
    }
  };
  const rawBody = JSON.stringify(event);
  const headers = {
    "content-type": "application/json"
  };
  if (webhookSecret !== undefined && webhookSecret.trim() !== "") {
    headers["stripe-signature"] = stripeSignature(rawBody, webhookSecret);
  }

  const response = await fetch(target, {
    method: "POST",
    headers,
    body: rawBody
  });
  const responseText = await response.text();

  if (!response.ok) {
    if (
      process.env.REQUIRE_WEBHOOK_CREDIT !== "1" &&
      response.status === 404 &&
      responseText.includes("Stripe checkout top-up was not found")
    ) {
      console.log(
        `Webhook signature/path check passed; no pending top-up matched ${checkoutSessionId}.`
      );
      return;
    }

    throw new Error(`Webhook replay failed with HTTP ${response.status}: ${responseText}`);
  }

  console.log(`Webhook replay accepted for ${checkoutSessionId}: ${responseText}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
