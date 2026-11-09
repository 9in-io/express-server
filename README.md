9in Express Server
==================

<img src="docs/img/logo.png" width="160" alt="9in"/>

Keep your users in your own database and sign them in with [9in](https://9in.io).

`@9in-io/express-server` is an Express router for 9in's **adapter protocol v2**, built on
[`@9in-io/node`](https://github.com/9in-io/node-sdk) and `@9in-io/sdk`:

| Endpoint | What 9in asks |
|---|---|
| `POST /authenticate` | Is this password right for this email / username / phone? |
| `POST /user` | Who is this user (by id or identifier)? |
| `POST /event` | Notifications, including one-time codes for you to deliver |

Requests must carry a valid `9in-signature` less than five minutes old; responses are
signed over the path and 9in's request id. Applications, scopes, social login, sessions
and two-factor authentication are configured in the 9in console.

```bash
npm install @9in-io/express-server express
```

Upgrading from `@ssofy/express-server` 1.x? Read [MIGRATION.md](MIGRATION.md).

## Usage

```ts
import express from 'express';
import bcrypt from 'bcryptjs';
import {nineAdapter, Notifications, type UserStore} from '@9in-io/express-server';

const users: UserStore<UserRow> = {
    findById: (id) => db.user.findUnique({where: {id: Number(id)}}),
    findByIdentifier: ({type, value}) =>
        type === 'phone'
            ? db.user.findFirst({where: {phone: value}})
            : db.user.findFirst({where: {[type]: {equals: value, mode: 'insensitive'}}}),
    verifyPassword: (user, password) => bcrypt.compare(password, user.passwordHash),
    toAdapterUser: (user) => ({
        id: String(user.id),
        email: user.email,
        email_verified: !!user.emailVerifiedAt,
        username: user.username,
        name: user.name,
        blocked: user.disabled,
        metadata: {plan: user.plan},          // becomes the token's `app` claim
    }),
};

const app = express();

// Mount before express.json(): signatures cover the raw body.
app.use('/nine', nineAdapter({
    users,                                   // secret: NINE_ADAPTER_SECRET (or pass `secret`, [new, old] during rotation)
    otp: {
        email: new Notifications.NodemailerEmailNotifier(transporter, Notifications.Channel.EMAIL, 'no-reply@acme.com'),
        // sms: new Notifications.TwilioSMSNotifier(twilio, '+15550000000'),
        vars: {brand: 'Acme'},
    },
    onEvent: async (event) => {
        // user.updated, user.password_changed, session.revoked, …
    },
}));

app.use(express.json());
app.listen(3000);
```

Then, in the 9in console, open **Connections → User database**, choose **Adapter** and set
the URL to `https://your-app.com/nine`.

### One-time codes

9in generates sign-in and password-reset codes for adapter users and sends them as
`otp.requested`. With `otp` notifiers configured, they are delivered with the bundled
Handlebars templates (`build/templates/otp/{email,sms}.handlebars`; data `data.code`,
`data.purpose`, `data.expiresAt`, `vars.brand`). Register your own `otp` template on a
notifier to replace them, or set `otp: false` and deliver the code in `onEvent`.

### Events

Pass `channels: [new Events.NodeEventChannel()]` (or `RedisEventChannel`) to publish every
adapter event under its type, and/or handle them in `onEvent`.

## Environment

| Variable | Fallback |
|---|---|
| `NINE_ADAPTER_SECRET` | `SSOFY_ADAPTER_SECRET`, `SSOFY_API_SECRET` |

Everything from `@9in-io/node` is re-exported (`requireAuth`, `webhookHandler`,
`ManagementClient`, notifiers, …).

## Development

```bash
npm install     # links @9in-io/node from ../node (see package.json)
npm test
npm run build
```

## License

The MIT License (MIT). See [LICENSE](LICENSE). 9in and SSOfy are by [Cubelet Ltd](https://cubelet.co.uk).
