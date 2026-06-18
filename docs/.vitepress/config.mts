import { defineConfig } from "vitepress";

export default defineConfig({
  title: "ModelFaucet",
  description:
    "Open-source LLM distribution gateway and embeddable SDK for turning every app into an AI last-mile channel.",
  base: "/modelfaucet/",
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ["meta", { property: "og:title", content: "ModelFaucet" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Open-source LLM distribution gateway, SDK, BYOK, Local Bridge, usage ledger, and revenue sharing."
      }
    ],
    ["meta", { property: "og:type", content: "website" }]
  ],
  themeConfig: {
    logo: "/assets/modelfaucet-logo.png",
    siteTitle: "ModelFaucet",
    search: {
      provider: "local"
    },
    nav: [
      { text: "Guide", link: "/quickstart" },
      { text: "Roadmap", link: "/roadmap" },
      { text: "API", link: "/API_SPEC" },
      { text: "Security", link: "/SECURITY" },
      { text: "Release", link: "/RELEASE_CHECKLIST" },
      { text: "中文", link: "/zh-CN/" }
    ],
    sidebar: [
      {
        text: "Start",
        items: [
          { text: "Overview", link: "/" },
          { text: "Quickstart", link: "/quickstart" },
          { text: "Local Smoke Test", link: "/local-smoke" },
          { text: "Provider Routing", link: "/provider-routing" },
          { text: "SDK and Local Bridge", link: "/sdk-local-bridge" },
          { text: "Operations", link: "/operations" },
          { text: "Billing and Settlement", link: "/billing-settlement" },
          { text: "Threat and Abuse Model", link: "/threat-abuse-model" },
          { text: "Hosted Beta", link: "/hosted-beta" },
          { text: "Stability Policy", link: "/stability-policy" },
          { text: "Migration and Upgrade", link: "/migration-upgrade" },
          { text: "Production Architecture", link: "/production-architecture" },
          { text: "Governance and Support", link: "/governance-support" },
          { text: "Publishing Strategy", link: "/publishing-strategy" },
          { text: "Roadmap", link: "/roadmap" },
          { text: "Chinese Overview", link: "/zh-CN/" }
        ]
      },
      {
        text: "Chinese",
        items: [
          { text: "中文概览", link: "/zh-CN/" },
          { text: "本地 Smoke Test", link: "/zh-CN/local-smoke" },
          { text: "Provider Routing", link: "/zh-CN/provider-routing" },
          { text: "SDK 和 Local Bridge", link: "/zh-CN/sdk-local-bridge" },
          { text: "运维和可观测性", link: "/zh-CN/operations" },
          { text: "Billing 和 Settlement", link: "/zh-CN/billing-settlement" },
          { text: "Threat 和 Abuse Model", link: "/zh-CN/threat-abuse-model" },
          { text: "Hosted Beta", link: "/zh-CN/hosted-beta" },
          { text: "稳定性政策", link: "/zh-CN/stability-policy" },
          { text: "迁移和升级", link: "/zh-CN/migration-upgrade" },
          { text: "生产参考架构", link: "/zh-CN/production-architecture" },
          { text: "治理和支持", link: "/zh-CN/governance-support" },
          { text: "发布策略", link: "/zh-CN/publishing-strategy" },
          { text: "版本路线图", link: "/zh-CN/roadmap" }
        ]
      },
      {
        text: "Reference",
        items: [
          { text: "API Spec", link: "/API_SPEC" },
          { text: "Security", link: "/SECURITY" },
          { text: "Whitepaper", link: "/WHITEPAPER" },
          { text: "Release Checklist", link: "/RELEASE_CHECKLIST" }
        ]
      },
      {
        text: "Implementation",
        items: [
          { text: "Construction Guide", link: "/CONSTRUCTION" },
          { text: "Codex Tasks", link: "/CODEX_TASKS" }
        ]
      }
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/HiClawBot/modelfaucet" }
    ],
    footer: {
      message: "Released under the Apache-2.0 license.",
      copyright: "Copyright 2026 ModelFaucet contributors"
    }
  }
});
