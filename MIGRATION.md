# Migrating from `@ssofy/express-server` 1.x to `@9in-io/express-server` 2.x

SSOfy is now [9in](https://9in.io). 2.0 is a new major version under a new package name
that serves **adapter protocol v2**.

**Upgrading is required to use 9in.** `@ssofy/express-server` 1.x serves the SSOfy v1
resource-server protocol (eight signed endpoints), which only the SSOfy service called.
That service has shut down (ssofy.com has lapsed), and 9in never calls those endpoints, so
1.x does not work with 9in. The old version stays on npm but is no longer maintained.

```bash
npm uninstall @ssofy/express-server @ssofy/node-sdk
npm install @9in-io/express-server
```

Node.js 20.19+ is required.

## Endpoints

| 1.x | 2.x |
|---|---|
| `POST <prefix>/auth/password` | `POST <mount>/authenticate` |
| `POST <prefix>/user` | `POST <mount>/user` |
| `POST <prefix>/event` | `POST <mount>/event` |
| `POST <prefix>/client`, `/scopes` | Gone: applications and APIs are created in the 9in console |
| `POST <prefix>/otp-options` | Gone: derived from the user's email and phone |
| `POST <prefix>/auth/social` | Gone: 9in links social accounts itself |
| `POST <prefix>/auth/token` | Gone: create login links with `ManagementClient.createLoginLink()` |
| `POST <prefix>/users` | Gone |

## Setup

| 1.x | 2.x |
|---|---|
| `import routes from '@ssofy/express-server'`, `app.use(routes(config))` with `ServerConfig` | `app.use('/nine', nineAdapter({users, otp, channels, onEvent}))` |
| `secret` (SSOfy API secret) | `secret` or `NINE_ADAPTER_SECRET` (a new secret from the 9in console; `SSOFY_API_SECRET` is read as a fallback) |
| `connection` (Datasource), `user.schema`, `user.columns`, `repositories.*`, `user.filter`, `user.transformer` | `users: UserStore` with four functions: `findById`, `findByIdentifier`, `verifyPassword`, `toAdapterUser` |
| `socialLink.*` | Gone |
| `data.clients`, `data.scopes` | Gone (9in console) |
| `authentication.methods`, `.passwordless` | Configured in the 9in console |
| `otp.storage` | Gone: 9in stores and checks the codes |
| `otp.notifiers`, `otp.vars` | `otp.email`, `otp.sms`, `otp.vars` |
| `events.channels` | `channels` |
| `mockMode` | Gone; use an in-memory `UserStore` |

User objects use OIDC claim names (`phone_number`, `email_verified`, `picture`,
`metadata`, `blocked`) instead of `UserEntity` (`phone`, `display_name`, `hash`).

## Signatures and body parsing

Requests and responses use `9in-signature: t=<unix>,v1=<HMAC-SHA256(t.METHOD.path.body)>`
(five-minute window, responses bound to `9in-request-id`) instead of SSOfy's salted
signature. The signature covers the raw body: mount the router **before** `express.json()`.

## Events

1.x emitted `OTPSent`, `UserAuthenticated`, `UserCreated`, `UserUpdated`, `TokenDeleted` with
`*EventParameters`. 2.x publishes the 9in adapter events as they arrive
(`otp.requested`, `user.updated`, `user.password_changed`, `session.revoked`, …) to your
channels and `onEvent`. For users stored by 9in, use tenant webhooks
(`webhookHandler()` from `@9in-io/node`).
