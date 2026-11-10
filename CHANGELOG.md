# CHANGELOG

## 3.0.0 - 2026-11-10

Breaking, with `@9in-io/node` 4.0.0 and the 9in release of 2026-11-10: adapter events are
`{id, event_type, created_at, data}` with snake_case data. See [MIGRATION.md](MIGRATION.md).

* `channels` publish each event under `event.event_type` (was `event.type`); `onEvent` receives the new shape.
* The OTP template data is `data.expires_at` and `data.user_id` (were `data.expiresAt`, `data.userId`).
  The bundled templates only print `data.code` and `vars.brand`, so they are unchanged; update your own.
* Re-exports `@9in-io/node` 4 (webhook events: `event.event_type`, `event.created_at`, `data.user.id`).

## 2.0.1 - 2026-11-09

First release on npm, as `@9in-io/express-server`: the npm organisation `9in` belongs to someone else, so the 9in
packages are published under `@9in-io` (the name of 9in's GitHub account). Same code as 2.0.0.

## 2.0.0 - 2026-11-09 (not published to npm)

Rebranded as **9in** (`@9in-io/express-server`) and moved to adapter protocol v2 on `@9in-io/node`. See [MIGRATION.md](MIGRATION.md).

* `nineAdapter({users, otp, channels, onEvent})`: Express router with `POST /authenticate`, `/user`, `/event` only.
* Timestamped `9in-signature` on requests and responses (via `adapterHandler` from `@9in-io/sdk`), secret rotation.
* `UserStore` interface (four functions) replaces datasource connections, repositories, filters and transformers.
* `otp.requested` delivered with the existing notifiers and bundled templates.
* Removed: client, scopes, users, otp-options, social and token endpoints; validators; `ServerConfig`; demo app.
* Node.js 20.19+, Express 4 or 5. Jest tests.

## 1.0.1 - 2023-10-01

* Fixed brand in default otp templates.

## 1.0.0 - 2023-08-28

* First Release.
