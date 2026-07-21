import { ModelFaucetError } from "@modelfaucet/shared";
import pg from "pg";

const { Pool } = pg;

export type UsageDashboardRow = {
  request_id: string;
  feature_key: string | null;
  route_mode: string;
  provider: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  retail_price_usd: string;
  channel_revenue_usd: string;
  created_at: string;
};

export type UsageDashboardSummary = {
  public_app_id: string;
  app_name: string;
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_retail_price_usd: string;
  total_developer_revenue_usd: string;
  usage: UsageDashboardRow[];
  next_cursor?: string;
};

export type GetAppUsageInput = {
  publicAppId: string;
  developerId?: string;
  limit: number;
  cursor?: string;
};

export type DashboardRepository = {
  getAppUsage(input: GetAppUsageInput): Promise<UsageDashboardSummary>;
  close?(): Promise<void>;
};

type SummaryRow = {
  public_app_id: string;
  app_name: string;
  total_calls: string;
  total_input_tokens: string;
  total_output_tokens: string;
  total_retail_price_usd: string;
  total_developer_revenue_usd: string;
};

type UsageRow = Omit<UsageDashboardRow, "created_at"> & {
  created_at: Date;
};

function toNumber(value: string): number {
  return Number.parseInt(value, 10);
}

function decodeCursor(value: string | undefined): { createdAt: Date; requestId: string } | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "string" ||
      typeof parsed[1] !== "string" ||
      parsed[1].length === 0
    ) {
      throw new Error("invalid cursor");
    }
    const createdAt = new Date(parsed[0]);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error("invalid cursor date");
    }
    return { createdAt, requestId: parsed[1] };
  } catch {
    throw new ModelFaucetError({
      code: "invalid_request",
      message: "The usage cursor is invalid.",
      statusCode: 400
    });
  }
}

function encodeCursor(row: UsageRow): string {
  return Buffer.from(
    JSON.stringify([row.created_at.toISOString(), row.request_id]),
    "utf8"
  ).toString("base64url");
}

export class PostgresDashboardRepository implements DashboardRepository {
  private readonly pool: pg.Pool;

  constructor(config: pg.PoolConfig) {
    this.pool = new Pool(config);
  }

  async getAppUsage(input: GetAppUsageInput): Promise<UsageDashboardSummary> {
    const cursor = decodeCursor(input.cursor);
    const summaryResult = await this.pool.query<SummaryRow>(
      `
        select
          apps.public_app_id,
          apps.name as app_name,
          count(usage_events.id)::text as total_calls,
          coalesce(sum(usage_events.input_tokens), 0)::text as total_input_tokens,
          coalesce(sum(usage_events.output_tokens), 0)::text as total_output_tokens,
          coalesce(sum(usage_events.retail_price_usd), 0)::text as total_retail_price_usd,
          coalesce(sum(usage_events.channel_revenue_usd), 0)::text as total_developer_revenue_usd
        from apps
        left join usage_events on usage_events.app_id = apps.id
        where apps.public_app_id = $1
          and apps.status = 'active'
          and ($2::uuid is null or apps.developer_id = $2)
        group by apps.id
      `,
      [input.publicAppId, input.developerId ?? null]
    );
    const summary = summaryResult.rows[0];
    if (summary === undefined) {
      throw new ModelFaucetError({
        code: "invalid_app",
        message: "The public app id is invalid or inactive.",
        statusCode: 404
      });
    }

    const usageResult = await this.pool.query<UsageRow>(
      `
        select
          usage_events.request_id,
          usage_events.feature_key,
          usage_events.route_mode,
          usage_events.provider,
          usage_events.model,
          usage_events.input_tokens,
          usage_events.output_tokens,
          usage_events.retail_price_usd::text,
          usage_events.channel_revenue_usd::text,
          usage_events.created_at
        from usage_events
        join apps on apps.id = usage_events.app_id
        where apps.public_app_id = $1
          and apps.status = 'active'
          and ($2::uuid is null or apps.developer_id = $2)
          and (
            $3::timestamptz is null
            or (usage_events.created_at, usage_events.request_id) < ($3, $4)
          )
        order by usage_events.created_at desc, usage_events.request_id desc
        limit $5
      `,
      [
        input.publicAppId,
        input.developerId ?? null,
        cursor?.createdAt ?? null,
        cursor?.requestId ?? "",
        input.limit + 1
      ]
    );

    const hasNextPage = usageResult.rows.length > input.limit;
    const pageRows = usageResult.rows.slice(0, input.limit);
    const lastRow = pageRows.at(-1);

    return {
      public_app_id: summary.public_app_id,
      app_name: summary.app_name,
      total_calls: toNumber(summary.total_calls),
      total_input_tokens: toNumber(summary.total_input_tokens),
      total_output_tokens: toNumber(summary.total_output_tokens),
      total_retail_price_usd: summary.total_retail_price_usd,
      total_developer_revenue_usd: summary.total_developer_revenue_usd,
      usage: pageRows.map((row) => ({
        ...row,
        created_at: row.created_at.toISOString()
      })),
      ...(hasNextPage && lastRow !== undefined ? { next_cursor: encodeCursor(lastRow) } : {})
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
