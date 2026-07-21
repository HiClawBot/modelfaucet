import { randomUUID } from "node:crypto";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function required(source, key) {
  const value = source[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function positiveInteger(value, key, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${key} must be an integer between 1 and ${maximum}.`);
  }
  return parsed;
}

function isPrivateHostname(hostname) {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized)
  ) {
    return true;
  }

  const octets = normalized.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [first = -1, second = -1] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function hostedHttpsUrl(value, key, allowPrivate) {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error(`${key} must use HTTPS.`);
  }
  if (!allowPrivate && isPrivateHostname(url.hostname)) {
    throw new Error(`${key} must not target a private or localhost address.`);
  }
  return url;
}

function exactHttpsOrigin(value, key, allowPrivate) {
  const url = hostedHttpsUrl(value, key, allowPrivate);
  if (url.origin !== value) {
    throw new Error(`${key} must be an exact HTTPS origin without a path.`);
  }
  return value;
}

function chatCompletionsUrl(baseUrl) {
  const normalized = baseUrl.toString().replace(/\/$/, "");
  return normalized.endsWith("/v1")
    ? `${normalized}/chat/completions`
    : `${normalized}/v1/chat/completions`;
}

async function readJson(response, label) {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${label} did not return JSON.`);
  }
}

function completionRequestId(completion) {
  const requestId = completion?.modelfaucet?.request_id;
  assert(
    typeof requestId === "string" && requestId.length > 0,
    "Completion is missing modelfaucet.request_id."
  );
  return requestId;
}

function completionText(completion) {
  const content = completion?.choices?.[0]?.message?.content;
  assert(
    typeof content === "string" && content.length > 0,
    "Completion is missing assistant content."
  );
  return content;
}

export function readHostedCanaryConfig(source = process.env) {
  if (source.ALLOW_PROVIDER_BILLING !== "1") {
    throw new Error(
      "Set ALLOW_PROVIDER_BILLING=1 to acknowledge that this check incurs provider cost."
    );
  }

  const allowPrivate = source.ALLOW_PRIVATE_HOSTED_SMOKE === "1";
  return {
    apiBaseUrl: hostedHttpsUrl(
      required(source, "MODELFAUCET_API_BASE_URL"),
      "MODELFAUCET_API_BASE_URL",
      allowPrivate
    ),
    gatewayBaseUrl: hostedHttpsUrl(
      required(source, "MODELFAUCET_GATEWAY_BASE_URL"),
      "MODELFAUCET_GATEWAY_BASE_URL",
      allowPrivate
    ),
    publicAppId: required(source, "MODELFAUCET_PUBLIC_APP_ID"),
    origin: exactHttpsOrigin(
      required(source, "MODELFAUCET_CANARY_ORIGIN"),
      "MODELFAUCET_CANARY_ORIGIN",
      allowPrivate
    ),
    model: required(source, "MODELFAUCET_CANARY_MODEL"),
    featureKey: source.MODELFAUCET_CANARY_FEATURE?.trim() || "beta_canary",
    maxTokens: positiveInteger(
      source.MODELFAUCET_CANARY_MAX_TOKENS ?? "8",
      "MODELFAUCET_CANARY_MAX_TOKENS",
      32
    )
  };
}

export async function runHostedCanary(options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const externalUserId = options.externalUserId ?? `canary-${randomUUID()}`;
  const idempotencyKey = options.idempotencyKey ?? `canary_${randomUUID()}`;
  const apiBaseUrl = options.apiBaseUrl.toString().replace(/\/$/, "");
  const headers = {
    "content-type": "application/json",
    origin: options.origin
  };

  const startedAt = Date.now();
  const session = await readJson(
    await fetchImpl(`${apiBaseUrl}/v1/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        public_app_id: options.publicAppId,
        external_user_id: externalUserId,
        feature_key: options.featureKey,
        metadata: { probe: "hosted_canary" }
      })
    }),
    "Session creation"
  );
  assert(typeof session.session_token === "string", "Session creation did not return a token.");
  assert(Number(session.wallet_balance_usd) > 0, "Canary wallet has no spendable balance.");

  const completionBody = JSON.stringify({
    model: options.model,
    messages: [
      { role: "user", content: "Reply with one short word confirming service availability." }
    ],
    max_tokens: options.maxTokens,
    metadata: { feature_key: options.featureKey }
  });
  const completionHeaders = {
    ...headers,
    authorization: `Bearer ${session.session_token}`,
    "idempotency-key": idempotencyKey
  };
  const completionUrl = chatCompletionsUrl(options.gatewayBaseUrl);

  const firstStartedAt = Date.now();
  const first = await readJson(
    await fetchImpl(completionUrl, {
      method: "POST",
      headers: completionHeaders,
      body: completionBody
    }),
    "Canary completion"
  );
  const firstLatencyMs = Date.now() - firstStartedAt;

  const replayStartedAt = Date.now();
  const replay = await readJson(
    await fetchImpl(completionUrl, {
      method: "POST",
      headers: completionHeaders,
      body: completionBody
    }),
    "Idempotency replay"
  );
  const replayLatencyMs = Date.now() - replayStartedAt;

  const requestId = completionRequestId(first);
  assert(
    completionRequestId(replay) === requestId,
    "Idempotency replay returned a different request ID."
  );
  assert(
    completionText(replay) === completionText(first),
    "Idempotency replay returned different assistant content."
  );

  return {
    ok: true,
    request_id: requestId,
    route_mode: first.modelfaucet?.route_mode,
    model: first.model,
    estimated_price_usd: first.modelfaucet?.estimated_price_usd,
    prompt_tokens: first.usage?.prompt_tokens,
    completion_tokens: first.usage?.completion_tokens,
    first_latency_ms: firstLatencyMs,
    replay_latency_ms: replayLatencyMs,
    total_latency_ms: Date.now() - startedAt,
    idempotency_replay_verified: true
  };
}
