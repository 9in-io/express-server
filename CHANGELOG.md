# CHANGELOG

## 2.0.0 - unreleased

Rebranded as **9in** (`@9in/express-server`) and moved to adapter protocol v2 on `@9in/node`. See [MIGRATION.md](MIGRATION.md).

* `nineAdapter({users, otp, channels, onEvent})`: Express router with `POST /authenticate`, `/user`, `/event` only.
* Timestamped `9in-signature` on requests and responses (via `adapterHandler` from `@9in/sdk`), secret rotation.
* `UserStore` interface (four functions) replaces datasource connections, repositories, filters and transformers.
* `otp.requested` delivered with the existing notifiers and bundled templates.
* Removed: client, scopes, users, otp-options, social and token endpoints; validators; `ServerConfig`; demo app.
* Node.js 20.19+, Express 4 or 5. Jest tests.

## 1.0.1 - 2023-10-01

* Fixed brand in default otp templates.

## 1.0.0 - 2023-08-28

* First Release.
