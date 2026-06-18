import { useMemo, useState } from "react";
import {
  calculateScenario,
  formatCompact,
  formatUsd,
  type RouteMode,
  type ScenarioInput
} from "./model";

type Locale = "en" | "zh";

type Scenario = {
  key: string;
  title: string;
  audience: string;
  description: string;
  route: RouteMode;
};

const routeModes: Array<{ key: RouteMode; label: string }> = [
  { key: "platform", label: "Platform credits" },
  { key: "byok", label: "BYOK" },
  { key: "local", label: "Local Bridge" }
];

const copy = {
  en: {
    nav: {
      cases: "Use cases",
      demo: "Scenario demo",
      docs: "Docs",
      github: "GitHub"
    },
    hero: {
      kicker: "Open-source AI distribution layer",
      title: "Turn software products into AI channels.",
      body: "ModelFaucet gives apps a gateway, SDK, BYOK, local model path, usage ledger, and revenue sharing contract without putting provider keys in client code.",
      primary: "Run the quickstart",
      secondary: "Model the economics"
    },
    proof: [
      ["Source GA", "Stable 1.x contracts"],
      ["Tenant auth", "Scoped mf_dev tokens"],
      ["Safety", "Cloud URLs reject private networks"]
    ],
    routes: {
      platform: "ModelFaucet pays the provider, meters usage, and splits the explicit margin.",
      byok: "The user pays their own provider. ModelFaucet can charge only a visible gateway or product fee.",
      local: "Sensitive work stays in the user's local boundary through Local Bridge."
    },
    casesTitle: "Where it fits",
    casesBody:
      "The same protocol works for SaaS, plugins, desktop software, and channel products. Each case keeps the same hard security rules.",
    scenarios: [
      {
        key: "crm",
        title: "CRM reply assistant",
        audience: "Vertical SaaS",
        description:
          "Add customer reply generation with per-feature policy, wallet credits, and channel revenue.",
        route: "platform"
      },
      {
        key: "browser",
        title: "Browser extension copilot",
        audience: "Plugin ecosystem",
        description:
          "Use short-lived sessions and visible BYOK controls without shipping provider secrets.",
        route: "byok"
      },
      {
        key: "desktop",
        title: "Desktop research tool",
        audience: "Local-first software",
        description:
          "Route private drafts to Ollama, LM Studio, vLLM, or another loopback-bound local model.",
        route: "local"
      },
      {
        key: "commerce",
        title: "Commerce admin actions",
        audience: "Marketplace operators",
        description:
          "Meter catalog cleanup, support summaries, and campaign copy as product-native actions.",
        route: "platform"
      },
      {
        key: "knowledge",
        title: "Internal knowledge app",
        audience: "Enterprise teams",
        description:
          "Keep tenant-specific usage, cost, and audit trails clear before expanding to hosted pilots.",
        route: "platform"
      }
    ] satisfies Scenario[],
    model: {
      kicker: "Interactive scenario model",
      title: "Show the route and the money in one screen.",
      body:
        "Change the route mode and volume assumptions. BYOK and local modes stay explicit: no hidden token markup is applied to a user's provider bill.",
      users: "Monthly active users",
      requests: "Requests per user",
      input: "Input tokens",
      output: "Output tokens",
      cost: "Provider cost per 1K tokens",
      markup: "Platform route markup",
      share: "Developer revenue share",
      byokFee: "Visible BYOK gateway fee",
      localFee: "Visible local software fee",
      monthlyRequests: "Monthly requests",
      monthlyTokens: "Monthly tokens",
      providerCost: "Provider cost",
      endUserPrice: "End-user price",
      developerRevenue: "Developer revenue",
      platformRevenue: "Platform revenue",
      margin: "Gross margin"
    },
    boundary: {
      title: "The safety boundary is part of the product.",
      items: [
        "Provider API keys stay server-side only.",
        "BYOK has visible controls and no hidden markup.",
        "Cloud services refuse localhost, metadata, link-local, and private LAN URLs.",
        "Developer tokens are scoped by developer_id and stored hash-only."
      ]
    },
    cta: {
      title: "Build with the source release.",
      body:
        "Start locally, inspect the contracts, then decide whether to run ModelFaucet under your own domain.",
      docs: "Open docs",
      release: "View v1.2.0 release",
      domain: "Custom domain ready: add DNS and a CNAME when modelfaucet.aifund.com is prepared."
    }
  },
  zh: {
    nav: {
      cases: "应用场景",
      demo: "场景模型",
      docs: "文档",
      github: "GitHub"
    },
    hero: {
      kicker: "开源 AI 分发层",
      title: "让软件产品变成 AI 渠道。",
      body:
        "ModelFaucet 给应用提供 gateway、SDK、BYOK、本地模型路径、usage ledger 和收入分成契约，同时不把 provider key 放进客户端。",
      primary: "运行 Quickstart",
      secondary: "计算场景收益"
    },
    proof: [
      ["Source GA", "稳定 1.x 契约"],
      ["租户认证", "Scoped mf_dev tokens"],
      ["安全边界", "云端 URL 拒绝私有网络"]
    ],
    routes: {
      platform: "ModelFaucet 支付 provider 成本，记录 usage，并按显式 margin 分成。",
      byok: "用户支付自己的 provider 账单。ModelFaucet 只能收取可见 gateway fee 或产品费。",
      local: "敏感任务通过 Local Bridge 留在用户本地边界内。"
    },
    casesTitle: "适合哪些产品",
    casesBody:
      "同一套协议可用于 SaaS、插件、桌面软件和渠道产品。每个场景都保持相同安全边界。",
    scenarios: [
      {
        key: "crm",
        title: "CRM 回复助手",
        audience: "垂直 SaaS",
        description: "为客户回复生成加入 feature policy、wallet credits 和渠道收入。",
        route: "platform"
      },
      {
        key: "browser",
        title: "浏览器插件 Copilot",
        audience: "插件生态",
        description: "使用短期 session 和可见 BYOK 控制，不在插件中打包 provider secrets。",
        route: "byok"
      },
      {
        key: "desktop",
        title: "桌面研究工具",
        audience: "Local-first 软件",
        description: "把私密草稿路由到 Ollama、LM Studio、vLLM 或其他 loopback 本地模型。",
        route: "local"
      },
      {
        key: "commerce",
        title: "电商后台动作",
        audience: "Marketplace 运营",
        description: "把商品清理、客服摘要和活动文案按原生产品动作计量。",
        route: "platform"
      },
      {
        key: "knowledge",
        title: "内部知识应用",
        audience: "企业团队",
        description: "Hosted pilot 之前，先把租户 usage、成本和 audit trail 做清楚。",
        route: "platform"
      }
    ] satisfies Scenario[],
    model: {
      kicker: "交互式场景模型",
      title: "在同一个界面展示路由和收入。",
      body:
        "切换路由模式和流量假设。BYOK 与本地模式保持显式收费：不会对用户自己的 provider 账单做隐藏 token markup。",
      users: "月活用户",
      requests: "每用户月请求",
      input: "输入 tokens",
      output: "输出 tokens",
      cost: "每 1K tokens provider 成本",
      markup: "Platform route markup",
      share: "开发者收入分成",
      byokFee: "可见 BYOK gateway fee",
      localFee: "可见本地软件费",
      monthlyRequests: "月请求量",
      monthlyTokens: "月 tokens",
      providerCost: "Provider 成本",
      endUserPrice: "用户支付价格",
      developerRevenue: "开发者收入",
      platformRevenue: "平台收入",
      margin: "毛利"
    },
    boundary: {
      title: "安全边界就是产品的一部分。",
      items: [
        "Provider API key 只能保存在服务端。",
        "BYOK 必须有可见控制，不做隐藏 markup。",
        "云端服务拒绝 localhost、metadata、link-local 和私有局域网 URL。",
        "Developer token 按 developer_id 限制，并且只以 hash 存储。"
      ]
    },
    cta: {
      title: "从源码版本开始构建。",
      body: "先本地运行，检查契约，再决定是否把 ModelFaucet 部署到自己的域名下。",
      docs: "打开文档",
      release: "查看 v1.2.0 Release",
      domain: "自定义域名准备项：当 modelfaucet.aifund.com DNS 就绪后再添加 CNAME。"
    }
  }
} as const;

const defaultInput: ScenarioInput = {
  routeMode: "platform",
  monthlyUsers: 3200,
  requestsPerUser: 18,
  inputTokens: 850,
  outputTokens: 260,
  providerCostPerThousandUsd: 0.003,
  markupPercent: 35,
  developerShareBps: 4200,
  byokGatewayFeeUsd: 0.004,
  localSoftwareFeeUsd: 0.002
};

function withBase(path: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base}${path.replace(/^\//, "")}`;
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="control">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <strong>{value.toLocaleString("en-US")}</strong>
    </label>
  );
}

function App() {
  const [locale, setLocale] = useState<Locale>("en");
  const [scenario, setScenario] = useState<ScenarioInput>(defaultInput);
  const text = copy[locale];
  const result = useMemo(() => calculateScenario(scenario), [scenario]);
  const activeRouteText = text.routes[scenario.routeMode];

  return (
    <main>
      <header className="site-header">
        <a className="brand" href={withBase("")} aria-label="ModelFaucet home">
          <img src={withBase("assets/modelfaucet-logo.png")} alt="ModelFaucet logo" />
          <span>ModelFaucet</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href={withBase("use-cases/")}>{text.nav.cases}</a>
          <a href={withBase("demo/")}>{text.nav.demo}</a>
          <a href={withBase("quickstart")}>{text.nav.docs}</a>
          <a href="https://github.com/HiClawBot/modelfaucet">{text.nav.github}</a>
        </nav>
        <button
          className="language-toggle"
          type="button"
          onClick={() => setLocale(locale === "en" ? "zh" : "en")}
        >
          {locale === "en" ? "中文" : "English"}
        </button>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{text.hero.kicker}</p>
          <h1>{text.hero.title}</h1>
          <p>{text.hero.body}</p>
          <div className="hero-actions">
            <a className="button primary" href={withBase("quickstart")}>
              {text.hero.primary}
            </a>
            <a className="button secondary" href={withBase("demo/")}>
              {text.hero.secondary}
            </a>
          </div>
        </div>

        <div className="route-board" aria-label="ModelFaucet route diagram">
          <div className="route-board-top">
            <span>app_pub_demo</span>
            <strong>{routeModes.find((item) => item.key === scenario.routeMode)?.label}</strong>
          </div>
          <div className="route-lanes">
            {["App", "SDK", "Gateway", "Policy", "Ledger"].map((item, index) => (
              <div className="lane" key={item} style={{ "--index": index } as React.CSSProperties}>
                <span>{item}</span>
              </div>
            ))}
          </div>
          <p>{activeRouteText}</p>
          <div className="route-modes" role="tablist" aria-label="Route modes">
            {routeModes.map((item) => (
              <button
                aria-selected={scenario.routeMode === item.key}
                key={item.key}
                type="button"
                onClick={() => setScenario((current) => ({ ...current, routeMode: item.key }))}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="proof-grid" aria-label="Project proof points">
        {text.proof.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>

      <section className="section-intro" id="use-cases">
        <p className="eyebrow">{text.nav.cases}</p>
        <h2>{text.casesTitle}</h2>
        <p>{text.casesBody}</p>
      </section>

      <section className="scenario-grid">
        {text.scenarios.map((item, index) => (
          <article
            className={`scenario-card scenario-${index + 1}`}
            key={item.key}
            style={{ "--index": index } as React.CSSProperties}
          >
            <span>{item.audience}</span>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <button
              type="button"
              onClick={() => setScenario((current) => ({ ...current, routeMode: item.route }))}
            >
              {routeModes.find((mode) => mode.key === item.route)?.label}
            </button>
          </article>
        ))}
      </section>

      <section className="demo-section" id="demo">
        <div className="demo-copy">
          <p className="eyebrow">{text.model.kicker}</p>
          <h2>{text.model.title}</h2>
          <p>{text.model.body}</p>
          <div className="mode-stack">
            {routeModes.map((item) => (
              <button
                className={scenario.routeMode === item.key ? "active" : ""}
                key={item.key}
                type="button"
                onClick={() => setScenario((current) => ({ ...current, routeMode: item.key }))}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="demo-panel">
          <div className="controls-grid">
            <NumberField
              label={text.model.users}
              min={400}
              max={25000}
              step={100}
              value={scenario.monthlyUsers}
              onChange={(value) =>
                setScenario((current) => ({ ...current, monthlyUsers: value }))
              }
            />
            <NumberField
              label={text.model.requests}
              min={3}
              max={80}
              step={1}
              value={scenario.requestsPerUser}
              onChange={(value) =>
                setScenario((current) => ({ ...current, requestsPerUser: value }))
              }
            />
            <NumberField
              label={text.model.input}
              min={120}
              max={3000}
              step={10}
              value={scenario.inputTokens}
              onChange={(value) =>
                setScenario((current) => ({ ...current, inputTokens: value }))
              }
            />
            <NumberField
              label={text.model.output}
              min={60}
              max={1600}
              step={10}
              value={scenario.outputTokens}
              onChange={(value) =>
                setScenario((current) => ({ ...current, outputTokens: value }))
              }
            />
            <NumberField
              label={text.model.cost}
              min={0.001}
              max={0.03}
              step={0.001}
              value={scenario.providerCostPerThousandUsd}
              onChange={(value) =>
                setScenario((current) => ({
                  ...current,
                  providerCostPerThousandUsd: value
                }))
              }
            />
            <NumberField
              label={text.model.markup}
              min={0}
              max={90}
              step={1}
              value={scenario.markupPercent}
              onChange={(value) =>
                setScenario((current) => ({ ...current, markupPercent: value }))
              }
            />
            <NumberField
              label={text.model.share}
              min={0}
              max={8000}
              step={100}
              value={scenario.developerShareBps}
              onChange={(value) =>
                setScenario((current) => ({ ...current, developerShareBps: value }))
              }
            />
            <NumberField
              label={
                scenario.routeMode === "local" ? text.model.localFee : text.model.byokFee
              }
              min={0}
              max={0.03}
              step={0.001}
              value={
                scenario.routeMode === "local"
                  ? scenario.localSoftwareFeeUsd
                  : scenario.byokGatewayFeeUsd
              }
              onChange={(value) =>
                setScenario((current) =>
                  current.routeMode === "local"
                    ? { ...current, localSoftwareFeeUsd: value }
                    : { ...current, byokGatewayFeeUsd: value }
                )
              }
            />
          </div>

          <div className="results-grid" aria-live="polite">
            <Metric label={text.model.monthlyRequests} value={formatCompact(result.monthlyRequests)} />
            <Metric label={text.model.monthlyTokens} value={formatCompact(result.monthlyTokens)} />
            <Metric label={text.model.providerCost} value={formatUsd(result.providerCostUsd)} />
            <Metric label={text.model.endUserPrice} value={formatUsd(result.endUserPriceUsd)} />
            <Metric label={text.model.margin} value={formatUsd(result.grossMarginUsd)} />
            <Metric label={text.model.developerRevenue} value={formatUsd(result.developerRevenueUsd)} />
            <Metric label={text.model.platformRevenue} value={formatUsd(result.platformRevenueUsd)} />
          </div>
        </div>
      </section>

      <section className="boundary-section">
        <h2>{text.boundary.title}</h2>
        <div className="boundary-list">
          {text.boundary.items.map((item, index) => (
            <div key={item}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="final-cta">
        <div>
          <p className="eyebrow">GitHub Pages</p>
          <h2>{text.cta.title}</h2>
          <p>{text.cta.body}</p>
          <small>{text.cta.domain}</small>
        </div>
        <div className="cta-actions">
          <a className="button primary" href={withBase("quickstart")}>
            {text.cta.docs}
          </a>
          <a
            className="button secondary"
            href="https://github.com/HiClawBot/modelfaucet/releases/tag/v1.2.0"
          >
            {text.cta.release}
          </a>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default App;
