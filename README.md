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

## Usage

Pick the store for your database, mount the router, and point 9in at it:

```ts
import express from 'express';
import {nineAdapter, prismaUserStore, Notifications} from '@9in-io/express-server';

const app = express();

// Mount before express.json(): signatures cover the raw body.
app.use('/nine', nineAdapter({
    users: prismaUserStore(prisma.user, {fields: {password: 'passwordHash'}}),
    // secret: NINE_ADAPTER_SECRET (or pass `secret`, [new, old] during rotation)
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

### Ready-made user stores

Each store takes the client or model you already have; none is a dependency of this package.

| Database | Store |
|---|---|
| Prisma (any database) | `prismaUserStore(prisma.user, {caseMatching?, parseId?})` |
| PostgreSQL, MySQL, MariaDB, SQLite, SQL Server | `sqlUserStore({dialect, query, table?, parseId?})`, with your `pg`, `mysql2`, `better-sqlite3`, Sequelize or Knex connection |
| MongoDB | `mongoUserStore(db.collection('users'))` (the `mongodb` driver) |
| Mongoose | `mongooseUserStore(User)` |
| DynamoDB | `dynamoUserStore({client, table, indexes})` (`@aws-sdk/lib-dynamodb`) |

```ts
// pg
sqlUserStore({dialect: 'postgres', query: (sql, params) => pool.query(sql, params).then((r) => r.rows)});
// mysql2/promise
sqlUserStore({dialect: 'mysql', query: (sql, params) => pool.query(sql, params).then(([rows]) => rows)});
// better-sqlite3
sqlUserStore({dialect: 'sqlite', query: async (sql, params) => db.prepare(sql).all(...params)});
// Sequelize
sqlUserStore({dialect: 'postgres', query: (sql, bind) => sequelize.query(sql, {bind, type: QueryTypes.SELECT})});
// DynamoDB: one global secondary index per identifier you sign in with
dynamoUserStore({client: DynamoDBDocumentClient.from(new DynamoDBClient({})), table: 'users', indexes: {email: 'email-index'}});
```

Every store:

- **Maps your columns** with `fields`. The defaults are `id`, `email`, `username`,
  `phone_number`, `password_hash`, `email_verified`, `blocked`, `name`, `given_name`,
  `family_name`, `picture`, `locale`, `zoneinfo` and `birthdate`. MongoDB stores use `_id`.
  Set a field to `null` when you don't have it, or to a function of the row for `blocked`
  and `email_verified` (`blocked: (row) => row.disabledAt !== null`). `metadata: (row) =>
  ({plan: row.plan})` adds values to the user's metadata.
- **Matches emails and usernames ignoring case, and phone numbers exactly.** An email or
  username that two users share signs nobody in. SQL uses `lower(column) = lower(value)`;
  MongoDB uses a case-insensitive collation; Prisma uses `mode: 'insensitive'` (use
  `caseMatching: 'database'` on MySQL and SQL Server, or `'lowercase'` on SQLite with
  lowercased columns); DynamoDB looks up lowercased values, so store them that way (or keep a
  lowercased copy and name it in `fields`).
- **Checks bcrypt (`$2a$`, `$2b$`, `$2y$`) and argon2 hashes** with `bcrypt` / `bcryptjs` or
  `argon2`, whichever you have installed. For anything else, pass `verifyPassword(user,
  password)`. Users without a hash can't sign in with a password, and an unknown email takes
  about as long to refuse as a wrong password.
- **Lets you take over** with `toAdapterUser(user)`, when the mapping isn't enough.

For an integer primary key, pass `parseId: (id) => /^\d+$/.test(id) ? Number(id) : undefined`
so an id the column can't hold is no user rather than a database error.

### Your own UserStore

Any database works through four functions:

```ts
import bcrypt from 'bcryptjs';
import type {UserStore} from '@9in-io/express-server';

const users: UserStore<UserRow> = {
    findById: (id) => db.users.byId(id),
    findByIdentifier: ({type, value}) => db.users.byLogin(type, value),   // email / username: ignore case
    verifyPassword: (user, password) => bcrypt.compare(password, user.passwordHash),
    toAdapterUser: (user) => ({
        id: String(user.id),
        email: user.email,
        email_verified: !!user.emailVerifiedAt,
        name: user.name,
        blocked: user.disabled,
        metadata: {plan: user.plan},
    }),
};
```

Then, in the 9in console, open **Connections → User database**, choose **Adapter** and set
the URL to `https://your-app.com/nine`.

### One-time codes

9in generates sign-in and password-reset codes for adapter users and sends them as
`otp.requested`. With `otp` notifiers configured, they are delivered with the bundled
templates (`build/templates/otp/email.html` and `sms.txt`), which fill `{{ data.code }}`,
`{{ data.purpose }}`, `{{ data.expires_at }}` and `{{ vars.brand }}`. Register your own `otp`
template on a notifier to replace them, or set `otp: false` and deliver the code in `onEvent`.

### Events

Pass `channels: [new Events.NodeEventChannel()]` (or `RedisEventChannel`) to publish every
adapter event under its name, and/or handle them in `onEvent`. Events are
`{id, event_type, created_at, data}` with snake_case data (`user_id`, `expires_at`).

## Environment

| Variable | Used for |
|---|---|
| `NINE_ADAPTER_SECRET` | The adapter secret (Connections → User database), when `secret` isn't passed |

Everything from `@9in-io/node` is re-exported (`requireAuth`, `webhookHandler`,
`ManagementClient`, notifiers, …).

## Development

```bash
npm install     # links @9in-io/node from ../node (see package.json)
npm test
npm run build
```

## License

The MIT License (MIT). See [LICENSE](LICENSE). 9in is by [Cubelet Ltd](https://cubelet.co.uk).
