# Developer Auth 和租户控制

ModelFaucet `1.1.0` 增加了 scoped developer API token，用于生产级开发者访问。`DEVELOPER_ADMIN_TOKEN` 仍保留为 bootstrap 和 operator 兼容路径，但 hosted 和生产开发者工作流应使用 developer API token。

## 安全模型

- Developer API token 由服务端生成，只在 `POST /v1/developer/tokens` 响应中返回一次。
- API 只保存 SHA-256 token hash 和短 token prefix。
- Token 列表响应永不包含 raw token 或 token hash。
- Token 可以配置 scope、过期时间，并可撤销。
- 使用 developer token 的请求，会在 API 层和 repository 查询层都限制到 token 所属 developer。
- Provider API key 仍只能留在服务端。Developer provider-key API 仍只保存加密后的 provider secret，并只返回 masked summary。
- BYOK 仍是用户显式控制的 markup，不加入隐藏 BYOK markup。
- Cloud provider base URL 在存储前仍会拒绝 localhost、loopback、link-local、metadata 和私有局域网目标。

## Bootstrap

使用仅限 operator 的 `DEVELOPER_ADMIN_TOKEN` 创建第一个 scoped token：

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

把返回的 `mf_dev_...` token 保存到服务端 secret manager。不要把它构建进公开浏览器 bundle。

## Scopes

| Scope | 允许操作 |
| --- | --- |
| `developer:apps:read` | 列出该 developer 的 apps。 |
| `developer:apps:write` | 创建、更新或归档该 developer 的 apps。 |
| `developer:features:read` | 列出该 developer app 的 feature manifest。 |
| `developer:features:write` | 创建、更新或删除 feature manifest。 |
| `developer:operations:read` | 读取限制到该 developer 的 wallet、top-up、payout 和 audit summary。 |
| `developer:provider_keys:read` | 列出 owned app 的 masked developer provider keys。 |
| `developer:provider_keys:write` | 为 owned app 添加或禁用 developer provider keys。 |
| `developer:tokens:read` | 列出该 developer 的 masked token metadata。 |
| `developer:tokens:write` | 创建或撤销 developer tokens。 |

## Token 生命周期

列出 token metadata：

```bash
curl -sS "$API_BASE_URL/v1/developer/tokens" \
  -H "Authorization: Bearer $MODELFAUCET_DEVELOPER_TOKEN"
```

撤销 token：

```bash
curl -sS -X DELETE "$API_BASE_URL/v1/developer/tokens/$TOKEN_ID" \
  -H "Authorization: Bearer $MODELFAUCET_DEVELOPER_TOKEN"
```

Token 创建和撤销会写入 audit log，但不会写入 raw token。

## 租户隔离

当请求使用 developer API token 认证时，ModelFaucet 会把 token 的 `developer_id` 传入 app、feature、operations 和 developer provider-key repository 调用。PostgreSQL repository 再用该 `developer_id` 限制查询和更新。Bootstrap admin path 不传 developer filter，只应保留给 operator-only 场景。
