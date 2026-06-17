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

ModelFaucet is at MVP source-release status. The repository includes the Control API, Gateway, Dashboard, SDK, React package, CRM demo, Local Bridge, wallet credits, Stripe test-mode top-ups, and payout mock.

For hosted production, complete the [release checklist](./RELEASE_CHECKLIST.md), including Docker smoke tests, a real LiteLLM test route, Stripe webhook delivery, deployment secrets, and namespace/trademark checks.

See the [roadmap](./roadmap.md) for the planned path from source MVP to hosted beta and general availability.
