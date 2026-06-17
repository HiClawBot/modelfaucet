import { describe, expect, it } from "vitest";
import { InMemoryMetrics, InMemoryRateLimiter, createRequestId } from "../src/index";

describe("observability helpers", () => {
  it("creates request ids with a stable prefix", () => {
    expect(createRequestId(0, () => 0.5)).toMatch(/^req_0_/);
  });

  it("renders request and rate-limit metrics", () => {
    const metrics = new InMemoryMetrics();
    metrics.observeRequest({
      service: "gateway",
      method: "POST",
      route: "/v1/chat/completions",
      statusCode: 200,
      durationMs: 12.5
    });
    metrics.incrementRateLimited("gateway", "/v1/chat/completions");

    expect(metrics.renderPrometheus()).toContain(
      'modelfaucet_http_requests_total{service="gateway",method="POST",route="/v1/chat/completions",status="200"} 1'
    );
    expect(metrics.renderPrometheus()).toContain(
      'modelfaucet_rate_limited_total{service="gateway",route="/v1/chat/completions"} 1'
    );
  });

  it("limits requests by key inside a window", () => {
    const limiter = new InMemoryRateLimiter(2, 1000);

    expect(limiter.check("session", 0).allowed).toBe(true);
    expect(limiter.check("session", 100).allowed).toBe(true);
    expect(limiter.check("session", 200).allowed).toBe(false);
    expect(limiter.check("session", 1200).allowed).toBe(true);
  });
});
