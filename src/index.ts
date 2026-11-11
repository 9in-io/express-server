import {join} from 'node:path';
import {Router} from 'express';
import {
    Events,
    Notifications,
    adapterMiddleware,
    env,
    otpSender,
    type AdapterEvent,
    type AdapterIdentifier,
    type AdapterUser,
} from '@9in-io/node';

/**
 * Your user database, as 9in needs it. `U` is your own user record.
 */
export interface UserStore<U = unknown> {
    findById(id: string): Promise<U | null>;
    /** Look up by email, username or phone (match emails/usernames case-insensitively). */
    findByIdentifier(identifier: AdapterIdentifier): Promise<U | null>;
    /** Check a password against the stored hash (bcrypt, argon2, …). */
    verifyPassword(user: U, password: string): Promise<boolean>;
    /** Map to OIDC claims. Return `blocked: true` for disabled accounts. */
    toAdapterUser(user: U): AdapterUser | Promise<AdapterUser>;
}

export interface NineAdapterConfig<U = unknown> {
    /** Adapter secret from the console; several during rotation. Default: NINE_ADAPTER_SECRET (SSOFY_API_SECRET fallback). */
    secret?: string | string[];
    users: UserStore<U>;
    /**
     * One-time codes for adapter users (`otp.requested`). Pass notifiers to deliver them;
     * the bundled `otp` templates are used unless the notifier already has one.
     * `false` leaves delivery to `onEvent`.
     */
    otp?: false | {
        email?: Notifications.Notifier;
        sms?: Notifications.Notifier;
        /** Template variables, e.g. {brand: 'Acme'}. */
        vars?: Record<string, unknown>;
    };
    /** Every adapter event is published to these channels under its name (`event.event_type`, e.g. `user.updated`). */
    channels?: Events.EventChannel[];
    /** Called for every adapter event after OTP delivery and publishing. */
    onEvent?(event: AdapterEvent): unknown;
    /** Signature tolerance in seconds (default 300). */
    toleranceSeconds?: number;
}

const TEMPLATES = join(__dirname, 'templates', 'otp');

/**
 * The bundled OTP templates, filled by @9in-io/node's placeholder engine (`{{ data.code }}`,
 * `{{ data.purpose }}`, `{{ data.expires_at }}`, `{{ vars.brand }}`).
 */
export function defaultOtpTemplate(channel: Notifications.Channel): Notifications.Template {
    return {
        name: 'otp',
        channel,
        path: join(TEMPLATES, channel === Notifications.Channel.SMS ? 'sms.txt' : 'email.html'),
    };
}

/**
 * Express router serving adapter protocol v2: `POST /authenticate`, `POST /user`,
 * `POST /event`. Mount it before `express.json()` (signatures cover the raw body):
 *
 *   app.use('/nine', nineAdapter({users: myUserStore, otp: {email: mailer}}));
 *
 * and set the adapter URL in the 9in console to https://your-app.com/nine.
 */
export function nineAdapter<U>(config: NineAdapterConfig<U>): Router {
    const secret = config.secret ?? env('ADAPTER_SECRET');
    if (!secret || (Array.isArray(secret) && secret.length === 0)) {
        throw new Error('9in: adapter secret missing (pass `secret` or set NINE_ADAPTER_SECRET)');
    }

    let sendOtp: ((event: AdapterEvent) => Promise<boolean>) | null = null;
    if (config.otp) {
        for (const notifier of [config.otp.email, config.otp.sms]) {
            if (!notifier) continue;
            for (const [name, value] of Object.entries(config.otp.vars ?? {})) notifier.setVar(name, value);
            if (!notifier.hasTemplate('otp')) notifier.setTemplate(defaultOtpTemplate(notifier === config.otp.sms ? Notifications.Channel.SMS : Notifications.Channel.EMAIL));
        }
        sendOtp = otpSender({email: config.otp.email, sms: config.otp.sms});
    }

    const handler = adapterMiddleware({
        secret,
        toleranceSeconds: config.toleranceSeconds,
        async authenticate(identifier, password) {
            const user = await config.users.findByIdentifier(identifier);
            if (!user || !(await config.users.verifyPassword(user, password))) return 'invalid';
            const claims = await config.users.toAdapterUser(user);
            return claims.blocked ? 'blocked' : claims;
        },
        async findUser(query) {
            const user = 'id' in query ? await config.users.findById(query.id) : await config.users.findByIdentifier(query.identifier);
            return user ? config.users.toAdapterUser(user) : null;
        },
        async onEvent(event) {
            if (sendOtp) await sendOtp(event);
            for (const channel of config.channels ?? []) channel.publish(event.event_type, event);
            await config.onEvent?.(event);
        },
    });

    const router = Router();
    router.post(['/authenticate', '/user', '/event'], handler);
    return router;
}

export * from '@9in-io/node';
export default nineAdapter;
