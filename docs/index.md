---
layout: home

hero:
  name: ModelFaucet
  text: Turn every app into an AI last-mile channel.
  tagline: Invite-only Beta construction for platform-routed, non-streaming chat completions with usage ledger and operator controls.
  image:
    src: /assets/modelfaucet-logo.svg
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

ModelFaucet is a `v1.3.0-beta.1` construction candidate. Production entrypoints, ordered migrations, concurrency-safe billing, protected usage, enforced feature flags, and three production images pass local plus Docker CI verification; hosted Beta traffic remains blocked on tagged GHCR digest/provenance evidence and managed real-provider staging, routed alerts, soak, restore, and rollback drills. The [capability matrix](./capability-matrix.md) is the source of truth for implemented, verified, disabled, and Beta-enabled capabilities.

For the public website and scenario model, use the GitHub Pages root. For local production smoke testing, see the [local smoke test guide](./local-smoke.md). For hosted beta setup, see the [hosted beta guide](./hosted-beta.md). For developer token auth and tenant controls, see [developer auth](./developer-auth.md). The [stability policy](./stability-policy.md) describes intended compatibility; hosted GA has not been declared.

See the [roadmap](./roadmap.md) for the planned path from source MVP to hosted beta and general availability.
