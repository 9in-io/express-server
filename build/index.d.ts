import { Router } from 'express';
import { Events, Notifications, type AdapterEvent, type AdapterIdentifier, type AdapterUser } from '@9in-io/node';
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
    /** Every adapter event is published to these channels under its name (`event.event`, e.g. `user.updated`). */
    channels?: Events.EventChannel[];
    /** Called for every adapter event after OTP delivery and publishing. */
    onEvent?(event: AdapterEvent): unknown;
    /** Signature tolerance in seconds (default 300). */
    toleranceSeconds?: number;
}
/** The bundled OTP templates (Handlebars; data: `data.code`, `data.purpose`, `data.expires_at`, `vars.brand`). */
export declare function defaultOtpTemplate(channel: Notifications.Channel): Notifications.Template;
/**
 * Express router serving adapter protocol v2: `POST /authenticate`, `POST /user`,
 * `POST /event`. Mount it before `express.json()` (signatures cover the raw body):
 *
 *   app.use('/nine', nineAdapter({users: myUserStore, otp: {email: mailer}}));
 *
 * and set the adapter URL in the 9in console to https://your-app.com/nine.
 */
export declare function nineAdapter<U>(config: NineAdapterConfig<U>): Router;
export * from '@9in-io/node';
export default nineAdapter;
