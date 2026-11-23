import {afterAll, beforeAll, describe, expect, it} from '@jest/globals';
import {createServer} from 'node:net';
import bcrypt from 'bcryptjs';
import argon2 from 'argon2';
import Database from 'better-sqlite3';
import {Pool} from 'pg';
import mysql from 'mysql2/promise';
import {MongoClient} from 'mongodb';
import mongoose from 'mongoose';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {CreateTableCommand, DescribeTableCommand, DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {BatchWriteCommand, DynamoDBDocumentClient} from '@aws-sdk/lib-dynamodb';
import {
    dynamoUserStore,
    mapUser,
    mongoUserStore,
    mongooseUserStore,
    prismaUserStore,
    sqlUserStore,
    verifyHash,
    DEFAULT_FIELDS,
    type UserStore,
} from '../index';

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PG_URL = process.env.NINE_TEST_PG_URL ?? 'postgres://localhost/nine_test';
const MYSQL_URL = process.env.NINE_TEST_MYSQL_URL ?? 'mysql://nine:nine@127.0.0.1:3307/nine_test';

interface Seed {
    id: string;
    email: string | null;
    username: string | null;
    phone_number: string | null;
    password_hash: string | null;
    email_verified: boolean;
    blocked: boolean;
    name: string | null;
}

let SEED: Seed[] = [];

beforeAll(async () => {
    SEED = [
        {id: '1', email: 'Alice@Acme.test', username: 'alice', phone_number: '+447700900001', password_hash: bcrypt.hashSync('right', 4), email_verified: true, blocked: false, name: 'Alice A'},
        {id: '2', email: 'bob@acme.test', username: 'bob', phone_number: null, password_hash: await argon2.hash('right'), email_verified: false, blocked: true, name: null},
        {id: '3', email: 'carol@acme.test', username: null, phone_number: null, password_hash: null, email_verified: true, blocked: false, name: 'Carol'},
        {id: '4', email: 'dup@acme.test', username: 'dup1', phone_number: null, password_hash: bcrypt.hashSync('right', 4), email_verified: true, blocked: false, name: null},
        {id: '5', email: 'DUP@acme.test', username: 'dup2', phone_number: null, password_hash: bcrypt.hashSync('right', 4), email_verified: true, blocked: false, name: null},
    ];
});

const idOf = (row: Record<string, any> | null) => (row ? String(row.id ?? row._id ?? row.legacy_id) : null);

/** What every ready-made store must do with the seed users. */
function contract(name: string, store: () => UserStore<any>) {
    describe(`${name}`, () => {
        it('finds users by id', async () => {
            expect(idOf(await store().findById('1'))).toBe('1');
            expect(await store().findById('999')).toBeNull();
        });

        it('matches emails and usernames ignoring case, phone numbers exactly', async () => {
            const s = store();
            expect(idOf(await s.findByIdentifier({type: 'email', value: 'alice@acme.test'}))).toBe('1');
            expect(idOf(await s.findByIdentifier({type: 'email', value: 'ALICE@ACME.TEST'}))).toBe('1');
            expect(idOf(await s.findByIdentifier({type: 'username', value: 'ALICE'}))).toBe('1');
            expect(idOf(await s.findByIdentifier({type: 'phone', value: '+447700900001'}))).toBe('1');
            expect(await s.findByIdentifier({type: 'phone', value: '+447700900009'})).toBeNull();
            expect(await s.findByIdentifier({type: 'email', value: 'nobody@acme.test'})).toBeNull();
            expect(await s.findByIdentifier({type: 'email', value: "x' OR '1'='1"})).toBeNull();
        });

        it('refuses an identifier two users share', async () => {
            expect(await store().findByIdentifier({type: 'email', value: 'dup@acme.test'})).toBeNull();
        });

        it('checks bcrypt and argon2 hashes, and never matches a user without one', async () => {
            const s = store();
            const alice = (await s.findById('1'))!;
            const bob = (await s.findById('2'))!;
            const carol = (await s.findById('3'))!;
            expect(await s.verifyPassword(alice, 'right')).toBe(true);
            expect(await s.verifyPassword(alice, 'wrong')).toBe(false);
            expect(await s.verifyPassword(bob, 'right')).toBe(true);
            expect(await s.verifyPassword(carol, '')).toBe(false);
        });

        it("maps rows to 9in's user", async () => {
            const s = store();
            expect(await s.toAdapterUser((await s.findById('1'))!)).toEqual({
                id: '1',
                email: 'Alice@Acme.test',
                email_verified: true,
                username: 'alice',
                phone_number: '+447700900001',
                name: 'Alice A',
                blocked: false,
            });
            expect(await s.toAdapterUser((await s.findById('2'))!)).toMatchObject({id: '2', email: 'bob@acme.test', email_verified: false, blocked: true});
        });
    });
}

// ---------------------------------------------------------------------------
// SQL

const SQL_COLUMNS = ['id', 'email', 'username', 'phone_number', 'password_hash', 'email_verified', 'blocked', 'name'] as const;

describe('sqlUserStore', () => {
    describe('SQLite (better-sqlite3)', () => {
        const db = new Database(':memory:');
        beforeAll(() => {
            db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, username TEXT, phone_number TEXT, password_hash TEXT, email_verified INTEGER, blocked INTEGER, name TEXT)');
            const insert = db.prepare(`INSERT INTO users (${SQL_COLUMNS.join(', ')}) VALUES (${SQL_COLUMNS.map(() => '?').join(', ')})`);
            for (const u of SEED) insert.run(Number(u.id), u.email, u.username, u.phone_number, u.password_hash, u.email_verified ? 1 : 0, u.blocked ? 1 : 0, u.name);
        });
        contract('better-sqlite3', () => sqlUserStore({dialect: 'sqlite', query: async (sql, params) => db.prepare(sql).all(...params) as any[]}));

        it('maps your own column names, functions and metadata', async () => {
            db.exec('CREATE TABLE accounts (uid TEXT PRIMARY KEY, mail TEXT, pw TEXT, disabled_at TEXT, plan TEXT)');
            db.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?, ?)').run('u_1', 'Jane@Acme.test', bcrypt.hashSync('pw', 4), null, 'pro');
            db.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?, ?)').run('u_2', 'gone@acme.test', bcrypt.hashSync('pw', 4), '2026-01-01', 'free');
            const store = sqlUserStore({
                dialect: 'sqlite',
                table: 'accounts',
                query: async (sql, params) => db.prepare(sql).all(...params) as any[],
                fields: {id: 'uid', email: 'mail', password: 'pw', username: null, phone: null, blocked: (row) => row.disabled_at !== null, email_verified: () => true},
                metadata: (row) => ({plan: row.plan}),
            });
            const jane = (await store.findByIdentifier({type: 'email', value: 'jane@acme.test'}))!;
            expect(await store.verifyPassword(jane, 'pw')).toBe(true);
            expect(await store.toAdapterUser(jane)).toEqual({id: 'u_1', email: 'Jane@Acme.test', email_verified: true, blocked: false, metadata: {plan: 'pro'}});
            expect((await store.toAdapterUser((await store.findById('u_2'))!)).blocked).toBe(true);
            expect(await store.findByIdentifier({type: 'username', value: 'jane'})).toBeNull(); // no username column
        });

        it('refuses table or column names that are not plain identifiers', () => {
            const query = async () => [];
            expect(() => sqlUserStore({dialect: 'sqlite', query, table: 'users; DROP TABLE users'})).toThrow(/plain table or column name/);
            expect(() => sqlUserStore({dialect: 'sqlite', query, fields: {email: 'email") OR 1=1 --'}})).toThrow(/plain table or column name/);
            expect(() => sqlUserStore({dialect: 'oracle' as never, query})).toThrow(/dialect/);
        });

        it('writes queries in each dialect', async () => {
            const seen: string[] = [];
            const query = async (sql: string) => {
                seen.push(sql);
                return [];
            };
            for (const dialect of ['postgres', 'mysql', 'mssql'] as const) {
                const store = sqlUserStore({dialect, query, table: 'auth.users'});
                await store.findById('1');
                await store.findByIdentifier({type: 'email', value: 'a@b.c'});
            }
            expect(seen).toEqual([
                'SELECT * FROM "auth"."users" WHERE "id" = $1 LIMIT 1',
                'SELECT * FROM "auth"."users" WHERE lower("email") = lower($1) LIMIT 2',
                'SELECT * FROM `auth`.`users` WHERE `id` = ? LIMIT 1',
                'SELECT * FROM `auth`.`users` WHERE lower(`email`) = lower(?) LIMIT 2',
                'SELECT TOP 1 * FROM [auth].[users] WHERE [id] = @p1',
                'SELECT TOP 2 * FROM [auth].[users] WHERE lower([email]) = lower(@p1)',
            ]);
        });
    });

    describe('PostgreSQL (pg)', () => {
        const table = `users_${RUN}`;
        let pool: Pool | null = null;
        beforeAll(async () => {
            const candidate = new Pool({connectionString: PG_URL, connectionTimeoutMillis: 2000});
            try {
                await candidate.query(`CREATE TABLE ${table} (id SERIAL PRIMARY KEY, email TEXT, username TEXT, phone_number TEXT, password_hash TEXT, email_verified BOOLEAN, blocked BOOLEAN, name TEXT)`);
                for (const u of SEED) {
                    await candidate.query(`INSERT INTO ${table} (${SQL_COLUMNS.join(', ')}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [Number(u.id), u.email, u.username, u.phone_number, u.password_hash, u.email_verified, u.blocked, u.name]);
                }
                pool = candidate;
            } catch (error) {
                await candidate.end();
                if (process.env.CI) throw error;
                console.warn(`PostgreSQL tests skipped (${PG_URL}): ${(error as Error).message}`);
            }
        });
        afterAll(async () => {
            if (!pool) return;
            await pool.query(`DROP TABLE IF EXISTS ${table}`);
            await pool.end();
        });
        const store = () => {
            if (!pool) throw new Error('no PostgreSQL');
            return sqlUserStore({dialect: 'postgres', table, query: (sql, params) => pool!.query(sql, params).then((r) => r.rows)});
        };
        contract('pg', store);
        it('treats an id the column type refuses as no user', async () => {
            if (!pool) return;
            await expect(store().findById('not-a-number')).rejects.toThrow(); // pg refuses; see parseId below
            const typed = sqlUserStore({dialect: 'postgres', table, query: (sql, params) => pool!.query(sql, params).then((r) => r.rows), parseId: (id) => (/^\d+$/.test(id) ? Number(id) : undefined)});
            expect(await typed.findById('not-a-number')).toBeNull();
            expect(idOf(await typed.findById('1'))).toBe('1');
        });
    });

    describe('MariaDB / MySQL (mysql2)', () => {
        const table = `users_${RUN}`;
        let pool: mysql.Pool | null = null;
        beforeAll(async () => {
            const candidate = mysql.createPool({uri: MYSQL_URL, connectTimeout: 2000});
            try {
                await candidate.query(`CREATE TABLE ${table} (id INT PRIMARY KEY, email VARCHAR(255), username VARCHAR(255), phone_number VARCHAR(32), password_hash VARCHAR(255), email_verified BOOLEAN, blocked BOOLEAN, name VARCHAR(255))`);
                for (const u of SEED) {
                    await candidate.query(`INSERT INTO ${table} (${SQL_COLUMNS.join(', ')}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [Number(u.id), u.email, u.username, u.phone_number, u.password_hash, u.email_verified, u.blocked, u.name]);
                }
                pool = candidate;
            } catch (error) {
                await candidate.end();
                if (process.env.CI) throw error;
                console.warn(`MySQL tests skipped (${MYSQL_URL}): ${(error as Error).message}`);
            }
        });
        afterAll(async () => {
            if (!pool) return;
            await pool.query(`DROP TABLE IF EXISTS ${table}`);
            await pool.end();
        });
        contract('mysql2', () => {
            if (!pool) throw new Error('no MySQL');
            return sqlUserStore({dialect: 'mysql', table, query: (sql, params) => pool!.query(sql, params).then(([rows]) => rows as any[])});
        });
    });
});

// ---------------------------------------------------------------------------
// MongoDB

describe('MongoDB', () => {
    let server: MongoMemoryServer;
    let client: MongoClient;
    let UserModel: mongoose.Model<any>;
    let conn: mongoose.Connection;

    beforeAll(async () => {
        server = await MongoMemoryServer.create();
        client = await new MongoClient(server.getUri()).connect();
        const users = client.db('nine').collection('users');
        await users.insertMany(SEED.map((u) => ({...u, _id: u.id as any, id: undefined})));
        conn = await mongoose.createConnection(server.getUri(), {dbName: 'nine'}).asPromise();
        UserModel = conn.model('User', new mongoose.Schema({_id: String}, {strict: false}), 'users');
    }, 120_000);

    afterAll(async () => {
        await conn?.close();
        await client?.close();
        await server?.stop();
    });

    contract('mongodb driver', () => mongoUserStore(client.db('nine').collection('users')));
    contract('mongoose', () => mongooseUserStore(UserModel));

    it('turns 24-hex ids into ObjectIds, and ids Mongoose cannot cast into no user', async () => {
        const col = client.db('nine').collection('oid_users');
        const {insertedId} = await col.insertOne({email: 'oid@acme.test'});
        expect(idOf(await mongoUserStore(col).findById(insertedId.toHexString()))).toBe(insertedId.toHexString());
        const Oid = conn.model('Oid', new mongoose.Schema({email: String}), 'oid_users');
        const store = mongooseUserStore(Oid);
        expect(idOf(await store.findById(insertedId.toHexString()))).toBe(insertedId.toHexString());
        expect(await store.findById('not-an-object-id')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// DynamoDB (dynalite)

describe('dynamoUserStore', () => {
    let server: {listen(port: number, cb: (err?: unknown) => void): void; close(cb: () => void): void};
    let client: DynamoDBDocumentClient;

    beforeAll(async () => {
        const dynalite = require('dynalite');
        server = dynalite({createTableMs: 0});
        const port = await new Promise<number>((resolve) => {
            const probe = createServer().listen(0, () => {
                const {port} = probe.address() as {port: number};
                probe.close(() => resolve(port));
            });
        });
        await new Promise<void>((resolve, reject) => server.listen(port, (err) => (err ? reject(err) : resolve())));
        client = DynamoDBDocumentClient.from(new DynamoDBClient({endpoint: `http://127.0.0.1:${port}`, region: 'local', credentials: {accessKeyId: 'x', secretAccessKey: 'x'}}));
        const gsi = (name: string, attribute: string) => ({IndexName: name, KeySchema: [{AttributeName: attribute, KeyType: 'HASH' as const}], Projection: {ProjectionType: 'ALL' as const}});
        await client.send(
            new CreateTableCommand({
                TableName: 'users',
                KeySchema: [{AttributeName: 'id', KeyType: 'HASH'}],
                AttributeDefinitions: ['id', 'email_lower', 'username_lower', 'phone_number'].map((name) => ({AttributeName: name, AttributeType: 'S' as const})),
                GlobalSecondaryIndexes: [gsi('email-index', 'email_lower'), gsi('username-index', 'username_lower'), gsi('phone-index', 'phone_number')],
                BillingMode: 'PAY_PER_REQUEST',
            }),
        );
        for (let i = 0; i < 50; i++) {
            const {Table} = await client.send(new DescribeTableCommand({TableName: 'users'}));
            if (Table?.TableStatus === 'ACTIVE' && Table.GlobalSecondaryIndexes?.every((g) => g.IndexStatus === 'ACTIVE')) break;
            await new Promise((r) => setTimeout(r, 20));
        }
        const items = SEED.map((u) => {
            const item: Record<string, unknown> = {...u, email_lower: u.email?.toLowerCase(), username_lower: u.username?.toLowerCase()};
            for (const [k, v] of Object.entries(item)) if (v === null || v === undefined) delete item[k];
            return {PutRequest: {Item: item}};
        });
        await client.send(new BatchWriteCommand({RequestItems: {users: items}}));
    });

    afterAll(async () => {
        client?.destroy();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    contract('dynalite', () =>
        dynamoUserStore({
            client,
            table: 'users',
            indexes: {email: 'email-index', username: 'username-index', phone: 'phone-index'},
            // look up the lowercased copies, report the address as the user typed it
            fields: {email: 'email_lower', username: 'username_lower'},
            toAdapterUser: (row) => mapUser({...row, email: row.email, username: row.username}, {...DEFAULT_FIELDS}),
        }),
    );

    it('cannot sign in with an identifier that has no index', async () => {
        const store = dynamoUserStore({client, table: 'users', indexes: {email: 'email-index'}, fields: {email: 'email_lower'}});
        expect(await store.findByIdentifier({type: 'username', value: 'alice'})).toBeNull();
        expect(idOf(await store.findByIdentifier({type: 'email', value: 'ALICE@acme.test'}))).toBe('1');
    });
});

// ---------------------------------------------------------------------------
// Prisma: the queries it sends (a real Prisma client is exercised separately)

describe('prismaUserStore', () => {
    function fakeDelegate(rows: Record<string, any>[]) {
        const calls: unknown[] = [];
        const matches = (row: Record<string, any>, where: Record<string, any>) =>
            Object.entries(where).every(([key, cond]) => {
                if (cond && typeof cond === 'object') {
                    const value = String(row[key] ?? '');
                    return cond.mode === 'insensitive' ? value.toLowerCase() === String(cond.equals).toLowerCase() : value === cond.equals;
                }
                return row[key] === cond;
            });
        return {
            calls,
            delegate: {
                async findFirst(args: {where: Record<string, unknown>}) {
                    calls.push({findFirst: args});
                    return rows.find((r) => matches(r, args.where)) ?? null;
                },
                async findMany(args: {where: Record<string, unknown>; take?: number}) {
                    calls.push({findMany: args});
                    return rows.filter((r) => matches(r, args.where)).slice(0, args.take);
                },
            },
        };
    }

    contract('fake delegate', () => prismaUserStore(fakeDelegate(SEED.map((u) => ({...u, id: Number(u.id)}))).delegate, {parseId: Number}));

    it('asks Prisma for case-insensitive matches and two rows at most', async () => {
        const {delegate, calls} = fakeDelegate([]);
        await prismaUserStore(delegate).findByIdentifier({type: 'email', value: 'A@B.c'});
        await prismaUserStore(delegate, {caseMatching: 'lowercase'}).findByIdentifier({type: 'username', value: 'Jane'});
        await prismaUserStore(delegate, {caseMatching: 'database'}).findByIdentifier({type: 'email', value: 'A@B.c'});
        await prismaUserStore(delegate).findByIdentifier({type: 'phone', value: '+1'});
        expect(calls).toEqual([
            {findMany: {where: {email: {equals: 'A@B.c', mode: 'insensitive'}}, take: 2}},
            {findMany: {where: {username: {equals: 'jane'}}, take: 2}},
            {findMany: {where: {email: {equals: 'A@B.c'}}, take: 2}},
            {findMany: {where: {phone_number: '+1'}, take: 2}},
        ]);
        expect(await prismaUserStore(delegate, {parseId: Number}).findById('abc')).toBeNull();
    });
});

describe('verifyHash', () => {
    it('refuses formats it does not know, so nothing passes by accident', async () => {
        await expect(verifyHash('x', 'plain-text-password')).rejects.toThrow(/unrecognised password hash/);
        await expect(verifyHash('x', null)).resolves.toBe(false);
    });
});
