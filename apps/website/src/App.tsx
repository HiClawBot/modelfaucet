import { useEffect, useMemo, useState } from "react";
import {
  calculateScenario,
  formatCompact,
  formatUsd,
  type RouteMode,
  type ScenarioInput
} from "./model";

export const supportedLocales = ["en", "zh"] as const;
type Locale = (typeof supportedLocales)[number];
export const websiteRouteKeys = ["home", "use-cases", "demo"] as const;
export type WebsiteRoute = (typeof websiteRouteKeys)[number];

type Scenario = {
  key: string;
  title: string;
  audience: string;
  description: string;
  route: RouteMode;
};

export const routeModeKeys: RouteMode[] = ["platform", "byok", "local"];

export const copy = {
  en: {
    meta: {
      title: "ModelFaucet",
      description:
        "ModelFaucet is building an invite-only source Beta for platform-routed, non-streaming chat completions with short-lived sessions and a usage ledger."
    },
    homeLabel: "ModelFaucet home",
    brandAlt: "ModelFaucet logo",
    language: {
      label: "Language",
      names: {
        en: "English",
        zh: "Chinese"
      }
    },
    routeBoardId: "app_pub_demo",
    aria: {
      primaryNavigation: "Primary navigation",
      routeDiagram: "ModelFaucet route diagram",
      routeModes: "Route modes",
      proofPoints: "Project proof points"
    },
    nav: {
      cases: "Use cases",
      demo: "Scenario demo",
      docs: "Docs",
      github: "GitHub"
    },
    routeLabels: {
      platform: "Platform credits",
      byok: "User-supplied key",
      local: "Local Bridge"
    } satisfies Record<RouteMode, string>,
    laneLabels: ["App", "SDK", "Gateway", "Policy", "Ledger"],
    hero: {
      kicker: "Open-source AI distribution Beta",
      title: "Turn software products into AI channels.",
      body: "The current Beta scope focuses on short-lived sessions, platform-routed non-streaming chat completions, and a usage ledger. BYOK, Local Bridge, payments, and additional OpenAI-compatible endpoints remain disabled until their production gates pass.",
      primary: "Run the quickstart",
      secondary: "Model the economics"
    },
    proof: [
      ["Source Beta", "Non-streaming chat scope"],
      ["Tenant auth", "Scoped mf_dev tokens"],
      ["Release gate", "Real staging still required"]
    ],
    routes: {
      platform: "ModelFaucet pays the provider, meters usage, and splits the explicit margin.",
      byok: "Roadmap mode: the user pays their own provider and any gateway or product fee must stay visible.",
      local: "Roadmap mode: sensitive work stays in the user's local boundary through Local Bridge."
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
        "Change the route mode and volume assumptions. User-supplied key and local modes stay explicit: no hidden token markup is applied to a user's provider bill.",
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
      kicker: "GitHub Pages",
      title: "Review the source Beta boundary.",
      body:
        "Start locally, inspect the capability matrix, and only enable the production surface whose gates have passed.",
      docs: "Open docs",
      release: "View published releases",
      domain: "Custom domain ready: add DNS and a CNAME when modelfaucet.aifund.com is prepared."
    }
  },
  zh: {
    meta: {
      title: "ModelFaucet 中文官网",
      description:
        "ModelFaucet 正在建设受邀制源码测试版，当前范围是平台路由、非流式对话、短期会话和用量账本。"
    },
    homeLabel: "ModelFaucet 中文首页",
    brandAlt: "ModelFaucet 标志",
    language: {
      label: "语言",
      names: {
        en: "英语",
        zh: "中文"
      }
    },
    routeBoardId: "应用编号示例",
    aria: {
      primaryNavigation: "主导航",
      routeDiagram: "ModelFaucet 路由示意图",
      routeModes: "路由模式",
      proofPoints: "项目证明点"
    },
    nav: {
      cases: "应用场景",
      demo: "场景模型",
      docs: "文档",
      github: "源码"
    },
    routeLabels: {
      platform: "平台额度",
      byok: "自带密钥",
      local: "本地桥接"
    } satisfies Record<RouteMode, string>,
    laneLabels: ["应用", "开发包", "网关", "策略", "账本"],
    hero: {
      kicker: "开源智能模型分发测试版",
      title: "让软件产品变成智能模型渠道。",
      body:
        "当前测试版只聚焦短期会话、平台路由的非流式对话和用量账本。自带密钥、本地桥接、支付及更多兼容接口会在各自生产门禁通过后再启用。",
      primary: "运行快速开始",
      secondary: "计算场景收益"
    },
    proof: [
      ["源码测试版", "非流式对话范围"],
      ["租户认证", "按开发者限定的令牌"],
      ["发布门禁", "仍需真实环境验证"]
    ],
    routes: {
      platform: "ModelFaucet 支付服务商成本，记录用量，并按显式毛利分成。",
      byok: "路线图模式：用户支付自己的服务商账单，所有网关费或产品费必须保持可见。",
      local: "路线图模式：敏感任务通过本地桥接留在用户本地边界内。"
    },
    casesTitle: "适合哪些产品",
    casesBody:
      "同一套协议可用于软件服务、插件、桌面软件和渠道产品。每个场景都保持相同安全边界。",
    scenarios: [
      {
        key: "crm",
        title: "客户关系管理回复助手",
        audience: "垂直软件服务",
        description: "为客户回复生成加入功能策略、钱包额度和渠道收入。",
        route: "platform"
      },
      {
        key: "browser",
        title: "浏览器插件助手",
        audience: "插件生态",
        description: "使用短期会话和可见自带密钥控制，不在插件中打包服务商密钥。",
        route: "byok"
      },
      {
        key: "desktop",
        title: "桌面研究工具",
        audience: "本地优先软件",
        description: "把私密草稿路由到本地模型运行环境，保留在用户自己的机器边界内。",
        route: "local"
      },
      {
        key: "commerce",
        title: "电商后台动作",
        audience: "市场运营",
        description: "把商品清理、客服摘要和活动文案按原生产品动作计量。",
        route: "platform"
      },
      {
        key: "knowledge",
        title: "内部知识应用",
        audience: "企业团队",
        description: "托管试点之前，先把租户用量、成本和审计轨迹做清楚。",
        route: "platform"
      }
    ] satisfies Scenario[],
    model: {
      kicker: "交互式场景模型",
      title: "在同一个界面展示路由和收入。",
      body:
        "切换路由模式和流量假设。自带密钥与本地模式保持显式收费：不会对用户自己的服务商账单做隐藏令牌加价。",
      users: "月活用户",
      requests: "每用户月请求",
      input: "输入令牌",
      output: "输出令牌",
      cost: "每千令牌服务商成本",
      markup: "平台路由加价",
      share: "开发者收入分成",
      byokFee: "可见自带密钥网关费",
      localFee: "可见本地软件费",
      monthlyRequests: "月请求量",
      monthlyTokens: "月令牌量",
      providerCost: "服务商成本",
      endUserPrice: "用户支付价格",
      developerRevenue: "开发者收入",
      platformRevenue: "平台收入",
      margin: "毛利"
    },
    boundary: {
      title: "安全边界就是产品的一部分。",
      items: [
        "服务商接口密钥只能保存在服务端。",
        "自带密钥必须有可见控制，不做隐藏加价。",
        "云端服务拒绝本机地址、元数据地址、链路本地地址和私有局域网地址。",
        "开发者令牌按开发者编号隔离，并且只以哈希存储。"
      ]
    },
    cta: {
      kicker: "公开官网",
      title: "先核对源码测试版边界。",
      body: "先本地运行并检查能力矩阵，只启用已经通过生产门禁的能力。",
      docs: "打开文档",
      release: "查看已发布版本",
      domain: "自定义域名准备项：当 modelfaucet.aifund.com 的域名解析就绪后再添加域名别名记录。"
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

export function getInitialLocaleForPath(pathname: string): Locale {
  return /(^|\/)zh(\/|$)/.test(pathname) ? "zh" : "en";
}

function getCurrentPathname(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

export function getRouteForPath(pathname: string): WebsiteRoute {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.includes("demo")) {
    return "demo";
  }

  if (segments.includes("use-cases")) {
    return "use-cases";
  }

  return "home";
}

export function getLocalizedRoutePath(targetLocale: Locale, route: WebsiteRoute): string {
  const pathByRoute = {
    home: "",
    "use-cases": "use-cases/",
    demo: "demo/"
  } satisfies Record<WebsiteRoute, string>;
  const suffix = pathByRoute[route];

  return targetLocale === "zh" ? `zh/${suffix}` : suffix;
}

export function getLocalePath(targetLocale: Locale, pathname: string): string {
  return getLocalizedRoutePath(targetLocale, getRouteForPath(pathname));
}

function localeToHrefLang(locale: Locale): "en" | "zh-CN" {
  return locale === "en" ? "en" : "zh-CN";
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
  const [locale, setLocale] = useState<Locale>(() =>
    getInitialLocaleForPath(getCurrentPathname())
  );
  const [route, setRoute] = useState<WebsiteRoute>(() => getRouteForPath(getCurrentPathname()));
  const [scenario, setScenario] = useState<ScenarioInput>(defaultInput);
  const text = copy[locale];
  const result = useMemo(() => calculateScenario(scenario), [scenario]);
  const activeRouteText = text.routes[scenario.routeMode];
  const docsHref = locale === "en" ? withBase("quickstart") : withBase("zh-CN/quickstart");
  const releaseHref = "https://github.com/HiClawBot/modelfaucet/releases";

  function syncStateWithLocation() {
    const nextPathname = getCurrentPathname();
    setLocale(getInitialLocaleForPath(nextPathname));
    setRoute(getRouteForPath(nextPathname));
  }

  function getRouteHref(nextRoute: WebsiteRoute, nextLocale = locale) {
    return withBase(getLocalizedRoutePath(nextLocale, nextRoute));
  }

  function navigateWebsiteRoute(nextRoute: WebsiteRoute, nextLocale = locale) {
    setLocale(nextLocale);
    setRoute(nextRoute);

    if (typeof window === "undefined") {
      return;
    }

    const nextPath = getRouteHref(nextRoute, nextLocale);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({ locale: nextLocale, route: nextRoute }, "", nextPath);
    }
    syncStateWithLocation();
  }

  function changeLocale(nextLocale: Locale) {
    navigateWebsiteRoute(route, nextLocale);
  }

  function handleRouteClick(
    event: React.MouseEvent<HTMLAnchorElement>,
    nextRoute: WebsiteRoute
  ) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }

    event.preventDefault();
    navigateWebsiteRoute(nextRoute);
  }

  useEffect(() => {
    document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
    document.title = text.meta.title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", text.meta.description);
  }, [locale, text.meta.description, text.meta.title]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    window.addEventListener("popstate", syncStateWithLocation);
    return () => window.removeEventListener("popstate", syncStateWithLocation);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (route === "home") {
        window.scrollTo({ top: 0 });
        return;
      }

      document.getElementById(route)?.scrollIntoView({ block: "start" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [locale, route]);

  return (
    <main>
      <header className="site-header">
        <a
          aria-label={text.homeLabel}
          className="brand"
          href={getRouteHref("home")}
          onClick={(event) => handleRouteClick(event, "home")}
        >
          <img src={withBase("assets/modelfaucet-logo.svg")} alt={text.brandAlt} />
        </a>
        <nav aria-label={text.aria.primaryNavigation}>
          <a
            aria-current={route === "use-cases" ? "page" : undefined}
            href={getRouteHref("use-cases")}
            onClick={(event) => handleRouteClick(event, "use-cases")}
          >
            {text.nav.cases}
          </a>
          <a
            aria-current={route === "demo" ? "page" : undefined}
            href={getRouteHref("demo")}
            onClick={(event) => handleRouteClick(event, "demo")}
          >
            {text.nav.demo}
          </a>
          <a href={docsHref}>{text.nav.docs}</a>
          <a href="https://github.com/HiClawBot/modelfaucet">{text.nav.github}</a>
        </nav>
        <div className="language-tabs" role="tablist" aria-label={text.language.label}>
          {supportedLocales.map((item) => (
            <a
              aria-selected={locale === item}
              href={getRouteHref(route, item)}
              hrefLang={localeToHrefLang(item)}
              key={item}
              onClick={(event) => {
                event.preventDefault();
                changeLocale(item);
              }}
              role="tab"
              tabIndex={locale === item ? 0 : -1}
            >
              {text.language.names[item]}
            </a>
          ))}
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{text.hero.kicker}</p>
          <h1>{text.hero.title}</h1>
          <p>{text.hero.body}</p>
          <div className="hero-actions">
            <a className="button primary" href={docsHref}>
              {text.hero.primary}
            </a>
            <a
              className="button secondary"
              href={getRouteHref("demo")}
              onClick={(event) => handleRouteClick(event, "demo")}
            >
              {text.hero.secondary}
            </a>
          </div>
        </div>

        <div className="route-board" aria-label={text.aria.routeDiagram}>
          <div className="route-board-top">
            <img src={withBase("assets/modelfaucet-mark.svg")} alt="" aria-hidden="true" />
            <div>
              <span>{text.routeBoardId}</span>
              <strong>{text.routeLabels[scenario.routeMode]}</strong>
            </div>
          </div>
          <div className="route-lanes">
            {text.laneLabels.map((item, index) => (
              <div className="lane" key={item} style={{ "--index": index } as React.CSSProperties}>
                <span>{item}</span>
              </div>
            ))}
          </div>
          <p>{activeRouteText}</p>
          <div className="route-modes" role="tablist" aria-label={text.aria.routeModes}>
            {routeModeKeys.map((item) => (
              <button
                aria-selected={scenario.routeMode === item}
                key={item}
                type="button"
                onClick={() => setScenario((current) => ({ ...current, routeMode: item }))}
              >
                {text.routeLabels[item]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="proof-grid" aria-label={text.aria.proofPoints}>
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
              {text.routeLabels[item.route]}
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
            {routeModeKeys.map((item) => (
              <button
                className={scenario.routeMode === item ? "active" : ""}
                key={item}
                type="button"
                onClick={() => setScenario((current) => ({ ...current, routeMode: item }))}
              >
                {text.routeLabels[item]}
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
          <p className="eyebrow">{text.cta.kicker}</p>
          <h2>{text.cta.title}</h2>
          <p>{text.cta.body}</p>
          <small>{text.cta.domain}</small>
        </div>
        <div className="cta-actions">
          <a className="button primary" href={docsHref}>
            {text.cta.docs}
          </a>
          <a
            className="button secondary"
            href={releaseHref}
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
