## Summary

Describe the change and the user/developer problem it addresses.

## Checks

- [ ] `pnpm verify:secrets`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm docs:build`

## Security

- [ ] No provider API keys or Stripe secrets are exposed to client-side code.
- [ ] BYOK changes use visible user controls and no hidden markup.
- [ ] Cloud services do not access localhost, loopback, link-local, or private LAN URLs.

## Notes

Call out migrations, config changes, release checklist updates, or follow-up work.
