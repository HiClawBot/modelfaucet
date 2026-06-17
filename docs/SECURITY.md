# ModelFaucet Security Architecture

Version: v0.1 Draft  
Date: 2026-06-17

---

## 1. Security stance

ModelFaucet has three non-negotiable rules:

```txt
1. No real provider API keys in client-side code.
2. No hidden token markup in BYOK mode.
3. No cloud-side access to user private networks.
```

These rules shape every architectural decision.

---

## 2. Secret handling

### 2.1 What can be in the SDK

```txt
public_app_id
public API base URL
feature manifest
short-lived session token
masked key summaries
```

### 2.2 What must never be in the SDK

```txt
OpenAI API key
Anthropic API key
Gemini API key
OpenRouter API key
Cloudflare/Vercel provider secret
Azure/OpenAI deployment key
developer raw provider key
end user raw BYOK key after submission
KMS encryption key
JWT signing secret
```

### 2.3 Storage model

Provider keys must be stored server-side only:

```txt
Postgres provider_credentials table:
  metadata, owner_scope, provider, status, masked value, encrypted_secret_ref

Vault/KMS/Secrets Manager:
  actual encrypted secret material
```

Dev mode may use local encryption, but production should use one of:

```txt
AWS KMS + Secrets Manager
GCP Cloud KMS + Secret Manager
Azure Key Vault
HashiCorp Vault
Cloudflare Secrets Store for Cloudflare-specific deployments
```

### 2.4 Key lifecycle

Every key needs:

```txt
created_at
created_by
last_validated_at
last_used_at
disabled_at
rotated_from_id
budget_limit
models_allowed
owner_scope
owner_id
```

Audit logs must record:

```txt
key_created
key_validated
key_disabled
key_deleted
key_used_for_route
key_validation_failed
```

Never log raw secrets.

---

## 3. Session security

### 3.1 Session token

Session tokens are short-lived and scoped.

```txt
token prefix: mf_sess_
ttl: 3600 seconds by default
storage: hash only
scope: app_id + end_user_id + optional feature_key
```

### 3.2 Token claims

Internal session claims:

```json
{
  "session_id": "sess_123",
  "app_id": "app_123",
  "end_user_id": "usr_123",
  "scopes": ["chat", "byok:read", "local:read"],
  "expires_at": "2026-06-17T01:00:00Z"
}
```

### 3.3 Session validation

Every gateway request must check:

```txt
- token hash exists
- token is not expired
- app is active
- developer is active
- feature exists if feature_key provided
- wallet/budget is sufficient unless BYOK/local route
- rate limit is not exceeded
```

---

## 4. Private network protection

### 4.1 Threat

If the cloud gateway accepts arbitrary `base_url`, an attacker could use it to scan internal networks or metadata services.

### 4.2 Rule

Cloud-side components must reject outbound requests to private ranges:

```txt
localhost
127.0.0.0/8
0.0.0.0/8
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
169.254.0.0/16
::1/128
fc00::/7
fe80::/10
```

### 4.3 Local Bridge exception

Local Bridge is installed and controlled by the user. It may access localhost and LAN endpoints because it runs inside the user's trust boundary.

Local Bridge default:

```txt
listen address: 127.0.0.1
port: 8787
auth: required if binding to non-loopback interface
prompt upload: disabled by default
```

---

## 5. BYOK transparency

BYOK mode must be explicit in the UI.

Required user-facing text:

```txt
You are using your own provider API key. Model usage charges are billed by your provider account. ModelFaucet may charge only the gateway or software service fee shown here.
```

ModelFaucet must not secretly apply token markup to a user's own provider bill.

---

## 6. Prompt and completion retention

Default retention policy:

```txt
Do not store raw prompts or completions.
Store token usage, model, route mode, request id, and cost metadata.
```

Optional debug logging requires explicit opt-in:

```txt
app-level opt-in
user-level opt-in where appropriate
redaction before persistence
retention period
delete/export controls
```

---

## 7. PII handling

Feature policies may require PII redaction.

Example:

```yaml
privacy_policy:
  pii: redact_before_cloud
  sensitive_fields:
    - customer_email
    - phone_number
    - shipping_address
  fallback: local_only
```

Implementation requirements:

```txt
- Redact before cloud provider call if policy requires it.
- Preserve mapping only in client or app backend when possible.
- Log redaction count, not raw PII.
```

---

## 8. Rate limits and budget limits

Apply at multiple layers:

```txt
platform
provider key
app
developer
end user
feature
session
IP / device fingerprint where appropriate
```

Budget checks must happen before provider calls.

---

## 9. Abuse prevention

Initial controls:

```txt
free credit quota
email/domain verification for developers
payout hold period
minimum payout threshold
velocity limits
route anomaly detection
suspicious app flagging
```

High-risk events:

```txt
sudden traffic spike
new app consuming large free credits
many users with same fingerprint
high error rate with successful provider charges
attempts to use private network base_url in cloud mode
```

---

## 10. Compliance checklist before launch

```txt
[ ] Terms of Service
[ ] Privacy Policy
[ ] Data Processing Addendum template
[ ] Provider terms matrix
[ ] BYOK disclosure text
[ ] Refund policy
[ ] Tax/VAT review
[ ] Payout KYC/AML via Stripe Connect or equivalent
[ ] Security contact
[ ] Vulnerability disclosure policy
```

---

## 11. Security acceptance tests

Codex should implement tests for:

```txt
[ ] provider key is never returned after creation
[ ] provider key is not present in frontend bundle
[ ] expired session cannot call gateway
[ ] unknown public_app_id cannot create session
[ ] cloud API rejects localhost/private base_url
[ ] BYOK route does not create platform upstream cost
[ ] local route does not call cloud provider
[ ] usage event has request_id and route_mode
[ ] ledger write is idempotent by request_id
```
