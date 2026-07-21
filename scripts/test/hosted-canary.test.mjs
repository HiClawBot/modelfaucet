import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, test } from "node:test";
import { runHostedCanary } from "../hosted-canary-lib.mjs";

const servers = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.close(resolve);
        })
    )
  );
});

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, body, statusCode = 200) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function startCanaryServer({ changeReplayRequestId = false } = {}) {
  const idempotencyKeys = [];
  let completionCalls = 0;
  const server = createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/v1/sessions") {
      const body = await readBody(request);
      assert.equal(request.headers.origin, "https://pilot.example");
      assert.equal(body.public_app_id, "app_canary");
      return sendJson(response, {
        session_token: "mf_sess_canary",
        expires_in: 300,
        gateway_base_url: "https://gateway.example/v1",
        available_modes: ["platform"],
        wallet_balance_usd: "1.00000000"
      });
    }

    if (request.method === "POST" && request.url === "/v1/chat/completions") {
      await readBody(request);
      completionCalls += 1;
      idempotencyKeys.push(request.headers["idempotency-key"]);
      return sendJson(response, {
        id: "chatcmpl_canary",
        object: "chat.completion",
        model: "canary-model",
        choices: [
          { index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }
        ],
        usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        modelfaucet: {
          request_id: changeReplayRequestId && completionCalls === 2 ? "req_changed" : "req_canary",
          route_mode: "platform",
          feature_key: "beta_canary",
          estimated_price_usd: "0.00000100"
        }
      });
    }

    sendJson(response, { error: "not found" }, 404);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    baseUrl: new URL(`http://127.0.0.1:${address.port}`),
    idempotencyKeys
  };
}

test("runs one billable canary and verifies an idempotent replay", async () => {
  const fixture = await startCanaryServer();
  const result = await runHostedCanary({
    apiBaseUrl: fixture.baseUrl,
    gatewayBaseUrl: new URL("/v1", fixture.baseUrl),
    publicAppId: "app_canary",
    origin: "https://pilot.example",
    model: "canary-model",
    featureKey: "beta_canary",
    maxTokens: 8,
    idempotencyKey: "canary_test_key"
  });

  assert.equal(result.ok, true);
  assert.equal(result.request_id, "req_canary");
  assert.deepEqual(fixture.idempotencyKeys, ["canary_test_key", "canary_test_key"]);
});

test("rejects a replay that returns a different request", async () => {
  const fixture = await startCanaryServer({ changeReplayRequestId: true });
  await assert.rejects(
    runHostedCanary({
      apiBaseUrl: fixture.baseUrl,
      gatewayBaseUrl: new URL("/v1", fixture.baseUrl),
      publicAppId: "app_canary",
      origin: "https://pilot.example",
      model: "canary-model",
      featureKey: "beta_canary",
      maxTokens: 8,
      idempotencyKey: "canary_test_key"
    }),
    /different request ID/
  );
});
