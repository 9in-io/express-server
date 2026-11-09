"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultOtpTemplate = defaultOtpTemplate;
exports.nineAdapter = nineAdapter;
const node_path_1 = require("node:path");
const express_1 = require("express");
const node_1 = require("@9in/node");
const TEMPLATES = (0, node_path_1.join)(__dirname, 'templates', 'otp');
/** The bundled OTP templates (Handlebars; data: `data.code`, `data.purpose`, `data.expiresAt`, `vars.brand`). */
function defaultOtpTemplate(channel) {
    return {
        name: 'otp',
        channel,
        path: (0, node_path_1.join)(TEMPLATES, channel === node_1.Notifications.Channel.SMS ? 'sms.handlebars' : 'email.handlebars'),
        engine: new node_1.Notifications.HandlebarsEngine(),
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
function nineAdapter(config) {
    const secret = config.secret ?? (0, node_1.env)('ADAPTER_SECRET');
    if (!secret || (Array.isArray(secret) && secret.length === 0)) {
        throw new Error('9in: adapter secret missing (pass `secret` or set NINE_ADAPTER_SECRET)');
    }
    let sendOtp = null;
    if (config.otp) {
        for (const notifier of [config.otp.email, config.otp.sms]) {
            if (!notifier)
                continue;
            for (const [name, value] of Object.entries(config.otp.vars ?? {}))
                notifier.setVar(name, value);
            if (!notifier.hasTemplate('otp'))
                notifier.setTemplate(defaultOtpTemplate(notifier === config.otp.sms ? node_1.Notifications.Channel.SMS : node_1.Notifications.Channel.EMAIL));
        }
        sendOtp = (0, node_1.otpSender)({ email: config.otp.email, sms: config.otp.sms });
    }
    const handler = (0, node_1.adapterMiddleware)({
        secret,
        toleranceSeconds: config.toleranceSeconds,
        async authenticate(identifier, password) {
            const user = await config.users.findByIdentifier(identifier);
            if (!user || !(await config.users.verifyPassword(user, password)))
                return 'invalid';
            const claims = await config.users.toAdapterUser(user);
            return claims.blocked ? 'blocked' : claims;
        },
        async findUser(query) {
            const user = 'id' in query ? await config.users.findById(query.id) : await config.users.findByIdentifier(query.identifier);
            return user ? config.users.toAdapterUser(user) : null;
        },
        async onEvent(event) {
            if (sendOtp)
                await sendOtp(event);
            for (const channel of config.channels ?? [])
                channel.publish(event.type, event);
            await config.onEvent?.(event);
        },
    });
    const router = (0, express_1.Router)();
    router.post(['/authenticate', '/user', '/event'], handler);
    return router;
}
__exportStar(require("@9in/node"), exports);
exports.default = nineAdapter;
