import { createHmac, timingSafeEqual } from "node:crypto";
import { formatMoneyUnits, parseMoneyToUnits } from "@modelfaucet/shared";

const CENT_SCALE = 1_000_000n;

export type StripeCheckoutSessionInput = {
  walletId: string;
  amountUsd: string;
  successUrl: string;
  cancelUrl: string;
};

export type StripeCheckoutSessionResult = {
  id: string;
  url: string;
};

export type StripeCheckoutClient = {
  createCheckoutSession(input: StripeCheckoutSessionInput): Promise<StripeCheckoutSessionResult>;
};

export type StripeRestCheckoutClientOptions = {
  secretKey: string;
  fetch?: typeof fetch;
};

export function moneyToStripeCents(amountUsd: string): number {
  const units = parseMoneyToUnits(amountUsd);
  if (units <= 0n) {
    throw new Error("Stripe checkout amount must be greater than zero.");
  }

  if (units % CENT_SCALE !== 0n) {
    throw new Error("Stripe checkout amount must be in whole cents.");
  }

  const cents = units / CENT_SCALE;
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Stripe checkout amount is too large.");
  }

  return Number(cents);
}

export function stripeCentsToMoney(amountTotal: number): string {
  if (!Number.isInteger(amountTotal) || amountTotal <= 0) {
    throw new Error("Stripe amount_total must be a positive integer.");
  }

  return formatMoneyUnits(BigInt(amountTotal) * CENT_SCALE);
}

function appendParams(params: URLSearchParams, values: Record<string, string | number>): void {
  for (const [key, value] of Object.entries(values)) {
    params.append(key, String(value));
  }
}

export class StripeRestCheckoutClient implements StripeCheckoutClient {
  private readonly secretKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: StripeRestCheckoutClientOptions) {
    this.secretKey = options.secretKey;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async createCheckoutSession(
    input: StripeCheckoutSessionInput
  ): Promise<StripeCheckoutSessionResult> {
    const params = new URLSearchParams();
    appendParams(params, {
      mode: "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][product_data][name]": "ModelFaucet credits",
      "line_items[0][price_data][unit_amount]": moneyToStripeCents(input.amountUsd),
      "line_items[0][quantity]": 1,
      "metadata[wallet_id]": input.walletId,
      "metadata[amount_usd]": input.amountUsd
    });

    const response = await this.fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: params
    });
    if (!response.ok) {
      throw new Error(`Stripe checkout session failed with status ${response.status}.`);
    }

    const body = (await response.json()) as { id?: unknown; url?: unknown };
    if (typeof body.id !== "string" || typeof body.url !== "string") {
      throw new Error("Stripe checkout session response was missing id or url.");
    }

    return {
      id: body.id,
      url: body.url
    };
  }
}

function readStripeSignatureParts(signatureHeader: string): {
  timestamp: string;
  signatures: string[];
} {
  const values = new Map<string, string[]>();
  for (const part of signatureHeader.split(",")) {
    const [key, value] = part.split("=");
    if (key === undefined || value === undefined) {
      continue;
    }

    const items = values.get(key) ?? [];
    items.push(value);
    values.set(key, items);
  }

  const timestamp = values.get("t")?.[0];
  if (timestamp === undefined) {
    throw new Error("Stripe signature timestamp is missing.");
  }

  return {
    timestamp,
    signatures: values.get("v1") ?? []
  };
}

export function verifyStripeWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string | undefined;
  webhookSecret: string | undefined;
}): void {
  if (input.webhookSecret === undefined || input.webhookSecret.trim().length === 0) {
    return;
  }

  if (input.signatureHeader === undefined || input.signatureHeader.trim().length === 0) {
    throw new Error("Stripe signature header is missing.");
  }

  const { timestamp, signatures } = readStripeSignatureParts(input.signatureHeader);
  const expected = createHmac("sha256", input.webhookSecret)
    .update(`${timestamp}.${input.rawBody}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const matched = signatures.some((signature) => {
    const actualBuffer = Buffer.from(signature, "hex");
    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  });

  if (!matched) {
    throw new Error("Stripe webhook signature verification failed.");
  }
}
