import {afterEach, describe, expect, it} from '@jest/globals';
import express from 'express';
import type {AddressInfo} from 'node:net';
import type {Server} from 'node:http';
import {Events, Notifications, signPayload, verifySignature, type AdapterIdentifier} from '@9in-io/node';
import {nineAdapter, type UserStore} from '../index';

interface Row {
    id: number;
    email: string;
    username: string;
    password: string;
    disabled?: boolean;
}

const rows: Row[] = [
    {id: 1, email: 'Jane@Acme.test', username: 'jane', password: 'hunter2'},
    {id: 2, email: 'bob@acme.test', username: 'bob', password: 'pw', disabled: true},
];

const users: UserStore<Row> = {
    async findById(id) {
        return rows.find((r) => String(r.id) === id) ?? null;
    },
    async findByIdentifier({type, value}: AdapterIdentifier) {
        if (type === 'phone') return null;
        return rows.find((r) => r[type].toLowerCase() === value.toLowerCase()) ?? null;
    },
    async verifyPassword(user, password) {
        return user.password === password;
    },
    toAdapterUser(user) {
        return {id: String(user.id), email: user.email, email_verified: true, username: user.username, blocked: !!user.disabled};
    },
};

class RecordingNotifier extends Notifications.Notifier {
    sent: {receiver: string; message: string}[] = [];

    async notify(receiver: string, template: string, data?: unknown): Promise<void> {
        this.sent.push({receiver, message: await this.render(template, data)});
    }
}

const SECRET = 'adapter_secret';
let server: Server | null = null;

afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = null;
});

async function start(app: express.Express): Promise<string> {
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server!.once('listening', resolve));
    return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

async function call(base: string, path: string, body: unknown, secret = SECRET) {
    const raw = JSON.stringify(body);
    const res = await fetch(base + path, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', '9in-request-id': 'req_7', '9in-signature': await signPayload(secret, 'POST', path, raw)},
        body: raw,
    });
    return {res, text: await res.text()};
}

describe('nineAdapter', () => {
    it('authenticates with signed, request-bound responses', async () => {
        const app = express();
        app.use('/nine', nineAdapter({secret: SECRET, users}));
        const base = await start(app);

        const {res, text} = await call(base, '/nine/authenticate', {identifier: {type: 'email', value: 'jane@acme.test'}, password: 'hunter2'});
        expect(res.status).toBe(200);
        expect(JSON.parse(text).user).toEqual({id: '1', email: 'Jane@Acme.test', email_verified: true, username: 'jane', blocked: false});
        expect(await verifySignature(SECRET, res.headers.get('9in-signature'), 'POST', '/nine/authenticate#req_7', text)).toBe(true);
    });

    it('maps wrong passwords, blocked users and unknown users', async () => {
        const app = express();
        app.use('/nine', nineAdapter({secret: SECRET, users}));
        const base = await start(app);

        expect((await call(base, '/nine/authenticate', {identifier: {type: 'username', value: 'jane'}, password: 'nope'})).res.status).toBe(401);
        expect((await call(base, '/nine/authenticate', {identifier: {type: 'username', value: 'bob'}, password: 'pw'})).res.status).toBe(403);
        expect((await call(base, '/nine/user', {id: '1'})).res.status).toBe(200);
        expect((await call(base, '/nine/user', {identifier: {type: 'username', value: 'JANE'}})).res.status).toBe(200);
        expect((await call(base, '/nine/user', {id: '99'})).res.status).toBe(404);
    });

    it('rejects foreign signatures and serves only the three endpoints', async () => {
        const app = express();
        app.use('/nine', nineAdapter({secret: [SECRET, 'old'], users}));
        const base = await start(app);

        expect((await call(base, '/nine/user', {id: '1'}, 'wrong')).res.status).toBe(401);
        expect((await call(base, '/nine/user', {id: '1'}, 'old')).res.status).toBe(200);
        for (const legacy of ['/nine/client', '/nine/scopes', '/nine/users', '/nine/otp-options', '/nine/auth/token', '/nine/auth/social']) {
            expect((await call(base, legacy, {})).res.status).toBe(404);
        }
    });

    it('delivers OTP codes with the bundled template and publishes events', async () => {
        const email = new RecordingNotifier(Notifications.Channel.EMAIL, 'no-reply@acme.test');
        const sms = new RecordingNotifier(Notifications.Channel.SMS, 'Acme');
        const channel = new Events.NodeEventChannel();
        const published: string[] = [];
        channel.subscribe('otp.requested', (type) => void published.push(type));
        const seen: string[] = [];

        const app = express();
        app.use('/nine', nineAdapter({secret: SECRET, users, otp: {email, sms, vars: {brand: 'Acme'}}, channels: [channel], onEvent: (e) => void seen.push(e.id)}));
        const base = await start(app);

        const event = {id: 'evt_1', type: 'otp.requested', createdAt: '2026-11-09T10:00:00Z', data: {userId: '1', channel: 'sms', to: '+447700900000', code: '424242', purpose: 'login', expiresAt: '2026-11-09T10:05:00Z'}};
        const {res, text} = await call(base, '/nine/event', event);

        expect(res.status).toBe(204);
        expect(text).toBe('');
        expect(await verifySignature(SECRET, res.headers.get('9in-signature'), 'POST', '/nine/event#req_7', '')).toBe(true);
        expect(sms.sent).toEqual([{receiver: '+447700900000', message: '424242 is your Acme verification code.'}]);
        expect(email.sent).toEqual([]);
        expect(published).toEqual(['otp.requested']);
        expect(seen).toEqual(['evt_1']);
    });

    it('fails clearly when mounted after express.json()', async () => {
        const app = express();
        app.use(express.json());
        app.use('/nine', nineAdapter({secret: SECRET, users}));
        const errors: string[] = [];
        app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
            errors.push(error.message);
            res.status(500).end();
        });
        const base = await start(app);

        expect((await call(base, '/nine/user', {id: '1'})).res.status).toBe(500);
        expect(errors[0]).toContain('mount 9in handlers before express.json()');
    });

    it('requires a secret', () => {
        const saved = {...process.env};
        delete process.env.NINE_ADAPTER_SECRET;
        delete process.env.SSOFY_API_SECRET;
        delete process.env.SSOFY_ADAPTER_SECRET;
        try {
            expect(() => nineAdapter({users})).toThrow('adapter secret missing');
            process.env.SSOFY_API_SECRET = 'legacy';
            expect(() => nineAdapter({users})).not.toThrow();
        } finally {
            process.env = saved;
        }
    });
});
