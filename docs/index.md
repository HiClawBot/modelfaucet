---
layout: home

hero:
  name: ModelFaucet
  text: Turn every app into an AI last-mile channel.
  tagline: Open-source LLM distribution gateway, embeddable SDK, BYOK, Local Bridge, usage ledger, and revenue sharing.
  image:
    src: /assets/modelfaucet-logo.png
    alt: ModelFaucet logo
  actions:
    - theme: brand
      text: Quickstart
      link: /quickstart
    - theme: alt
      text: View on GitHub
      link: https://github.com/HiClawBot/modelfaucet

features:
  - title: Embeddable SDK
    details: Add AI features inside websites, plugins, desktop apps, and vertical SaaS products without rebuilding gateway or billing infrastructure.
  - title: BYOK and Local Models
    details: Let users route through their own provider keys or through the local bridge for Ollama, vLLM, LM Studio, and LAN-hosted models.
  - title: Usage and Revenue Ledger
    details: Track token usage, upstream cost, retail price, developer revenue, platform revenue, wallet credits, and payout state.
---

## Current status

ModelFaucet is at `1.1.0` source-GA auth hardening status. The repository includes stable public contracts for the Control API, Gateway, SDK, React package, Local Bridge, database schema, hosted deployment checks, Compose validation, scoped developer API tokens, and production operating expectations.

For local production smoke testing, see the [local smoke test guide](./local-smoke.md). For hosted beta setup, see the [hosted beta guide](./hosted-beta.md). For developer token auth and tenant controls, see [developer auth](./developer-auth.md). For GA contracts, see the [stability policy](./stability-policy.md), [migration and upgrade guide](./migration-upgrade.md), [production reference architecture](./production-architecture.md), [deployment validation guide](./deployment-validation.md), [governance and support policy](./governance-support.md), and [publishing strategy](./publishing-strategy.md).

See the [roadmap](./roadmap.md) for the planned path from source MVP to hosted beta and general availability.
