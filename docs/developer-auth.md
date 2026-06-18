# Developer Auth And Tenant Controls

ModelFaucet `1.1.0` adds scoped developer API tokens for production developer access. `DEVELOPER_ADMIN_TOKEN` remains available as a bootstrap and operator compatibility path, but hosted and production developer workflows should use developer API tokens.

## Security Model

- Developer API tokens are generated server-side and returned only once from `POST /v1/developer/tokens`.
- The API stores only a SHA-256 token hash and a short token prefix.
- Token list responses never include raw tokens or token hashes.
- Tokens can be scoped, expired, and revoked.
- Developer token requests are filtered to the token owner at both the API and repository query layers.
- Provider API keys remain server-side only. Developer provider-key APIs still store encrypted provider secrets and return only masked summaries.
- BYOK remains explicit user-controlled markup only. No hidden BYOK markup is added.
- Cloud provider base URLs still reject localhost, loopback, link-local, metadata, and private LAN targets before storage.

## Bootstrap

Use the operator-only `DEVELOPER_ADMIN_TOKEN` to create the first scoped token:

```bash
curl -sS "$API_BASE_URL/v1/developer/tokens" \
  -H "Authorization: Bearer $DEVELOPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "developer_email": "dev@example.com",
    "name": "production console",
    "scopes": [
      "developer:apps:read",
      "developer:apps:write",
      "developer:features:read",
      "developer:features:write",
      "developer:operations:read",
      "developer:provider_keys:read",
      "developer:provider_keys:write"
    ]
  }'
```

Store the returned `mf_dev_...` token in a server-side secret manager. Do not build it into public browser bundles.

## Scopes

| Scope | Allows |
| --- | --- |
| `developer:apps:read` | List the developer's apps. |
| `developer:apps:write` | Create, update, or archive the developer's apps. |
| `developer:features:read` | List feature manifests for the developer's apps. |
| `developer:features:write` | Create, update, or delete feature manifests. |
| `developer:operations:read` | Read wallet, top-up, payout, and audit summaries scoped to the developer. |
| `developer:provider_keys:read` | List masked developer provider keys for owned apps. |
| `developer:provider_keys:write` | Add or disable developer provider keys for owned apps. |
| `developer:tokens:read` | List masked token metadata for the developer. |
| `developer:tokens:write` | Create or revoke developer tokens. |

## Token Lifecycle

List token metadata:

```bash
curl -sS "$API_BASE_URL/v1/developer/tokens" \
  -H "Authorization: Bearer $MODELFAUCET_DEVELOPER_TOKEN"
```

Revoke a token:

```bash
curl -sS -X DELETE "$API_BASE_URL/v1/developer/tokens/$TOKEN_ID" \
  -H "Authorization: Bearer $MODELFAUCET_DEVELOPER_TOKEN"
```

Token create and revoke operations write audit log entries without raw token material.

## Tenant Isolation

When a request authenticates with a developer API token, ModelFaucet passes the token's `developer_id` into app, feature, operations, and developer provider-key repository calls. The PostgreSQL repositories then constrain queries and updates with that `developer_id`. The bootstrap admin path passes no developer filter and should be reserved for operator-only contexts.
