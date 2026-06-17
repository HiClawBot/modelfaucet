export type RequestMetricInput = {
  service: string;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
};

type RequestMetric = RequestMetricInput & {
  count: number;
  durationMsTotal: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
};

type RateLimitBucket = {
  count: number;
  resetAtMs: number;
};

export function createRequestId(nowMs = Date.now(), random = Math.random): string {
  return `req_${Math.trunc(nowMs).toString(36)}_${random().toString(36).slice(2, 10)}`;
}

function labels(values: Record<string, string | number>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}="${String(value).replace(/"/g, '\\"')}"`)
    .join(",");
}

export class InMemoryMetrics {
  private readonly requests = new Map<string, RequestMetric>();
  private readonly rateLimited = new Map<string, number>();

  observeRequest(input: RequestMetricInput): void {
    const key = [
      input.service,
      input.method,
      input.route,
      String(input.statusCode)
    ].join("\u001f");
    const existing = this.requests.get(key);
    if (existing === undefined) {
      this.requests.set(key, {
        ...input,
        count: 1,
        durationMsTotal: input.durationMs
      });
      return;
    }

    existing.count += 1;
    existing.durationMsTotal += input.durationMs;
  }

  incrementRateLimited(service: string, route: string): void {
    const key = [service, route].join("\u001f");
    this.rateLimited.set(key, (this.rateLimited.get(key) ?? 0) + 1);
  }

  renderPrometheus(): string {
    const lines = [
      "# HELP modelfaucet_http_requests_total Total HTTP requests.",
      "# TYPE modelfaucet_http_requests_total counter"
    ];

    for (const metric of this.requests.values()) {
      const metricLabels = labels({
        service: metric.service,
        method: metric.method,
        route: metric.route,
        status: metric.statusCode
      });
      lines.push(`modelfaucet_http_requests_total{${metricLabels}} ${metric.count}`);
    }

    lines.push(
      "# HELP modelfaucet_http_request_duration_ms_sum Total HTTP request duration in milliseconds.",
      "# TYPE modelfaucet_http_request_duration_ms_sum counter"
    );
    for (const metric of this.requests.values()) {
      const metricLabels = labels({
        service: metric.service,
        method: metric.method,
        route: metric.route,
        status: metric.statusCode
      });
      lines.push(
        `modelfaucet_http_request_duration_ms_sum{${metricLabels}} ${metric.durationMsTotal.toFixed(3)}`
      );
    }

    lines.push(
      "# HELP modelfaucet_rate_limited_total Total rate limited requests.",
      "# TYPE modelfaucet_rate_limited_total counter"
    );
    for (const [key, count] of this.rateLimited.entries()) {
      const [service = "unknown", route = "unknown"] = key.split("\u001f");
      lines.push(`modelfaucet_rate_limited_total{${labels({ service, route })}} ${count}`);
    }

    return `${lines.join("\n")}\n`;
  }
}

export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number
  ) {}

  check(key: string, nowMs: number): RateLimitResult {
    if (this.maxRequests <= 0) {
      return {
        allowed: true,
        remaining: Number.POSITIVE_INFINITY,
        resetAtMs: nowMs + this.windowMs
      };
    }

    const existing = this.buckets.get(key);
    if (existing === undefined || existing.resetAtMs <= nowMs) {
      this.buckets.set(key, {
        count: 1,
        resetAtMs: nowMs + this.windowMs
      });
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetAtMs: nowMs + this.windowMs
      };
    }

    if (existing.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAtMs: existing.resetAtMs
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: this.maxRequests - existing.count,
      resetAtMs: existing.resetAtMs
    };
  }
}
