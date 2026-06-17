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
};

export type DashboardRepository = {
  getAppUsage(publicAppId: string): Promise<UsageDashboardSummary>;
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

export class PostgresDashboardRepository implements DashboardRepository {
  private readonly pool: pg.Pool;

  constructor(config: pg.PoolConfig) {
    this.pool = new Pool(config);
  }

  async getAppUsage(publicAppId: string): Promise<UsageDashboardSummary> {
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
        group by apps.id
      `,
      [publicAppId]
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
        order by usage_events.created_at desc
        limit 100
      `,
      [publicAppId]
    );

    return {
      public_app_id: summary.public_app_id,
      app_name: summary.app_name,
      total_calls: toNumber(summary.total_calls),
      total_input_tokens: toNumber(summary.total_input_tokens),
      total_output_tokens: toNumber(summary.total_output_tokens),
      total_retail_price_usd: summary.total_retail_price_usd,
      total_developer_revenue_usd: summary.total_developer_revenue_usd,
      usage: usageResult.rows.map((row) => ({
        ...row,
        created_at: row.created_at.toISOString()
      }))
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
