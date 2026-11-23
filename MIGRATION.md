# Migrating

## 3.x → 4.x

4.0 is built on `@9in-io/node` 5, which no longer reads the old SSOfy names: set the adapter
secret as `NINE_ADAPTER_SECRET` (not `SSOFY_ADAPTER_SECRET` or `SSOFY_API_SECRET`), or pass
`secret`. Your `UserStore` keeps working as it is; the ready-made stores are new and optional.

## 2.x → 3.x

3.0 moves to `@9in-io/node` 4 and 9in's snake_case wire format (the 9in release of 2026-11-10).
Upgrade both together; 2.x cannot read the new events.

| 2.x | 3.x |
|---|---|
| `onEvent(event)`: `event.type`, `event.createdAt` | `event.event_type`, `event.created_at` |
| `channels` published under `event.type` | under `event.event_type` (same names, e.g. `otp.requested`) |
| `otp.requested` `data.userId`, `data.expiresAt` | `data.user_id`, `data.expires_at` |
| Your own OTP templates using `{{ data.expiresAt }}` | `{{ data.expires_at }}` |
| Webhooks through the re-exported `webhookHandler`: `event.type`, `event.data.userId` | `event.event_type`, `event.data.user.id` |

The full list of renamed fields (users, sessions, Management API) is in
[`@9in-io/node`'s MIGRATION.md](https://github.com/9in-io/node-sdk/blob/master/MIGRATION.md#3x--4x).
