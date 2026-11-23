import type {AdapterIdentifier} from '@9in-io/node';
import type {UserStore} from '../index';
import {identifierColumn, single, storeHelpers, type Row, type StoreOptions} from './common';

export type SqlDialect = 'postgres' | 'mysql' | 'sqlite' | 'mssql';

export interface SqlUserStoreOptions<U extends Row = Row> extends StoreOptions<U> {
    /**
     * Runs a parameterised query and returns its rows. Placeholders follow `dialect`: `$1` for
     * postgres, `?` for mysql and sqlite, `@p1` for mssql. For example:
     *
     *   pg:              (sql, params) => pool.query(sql, params).then((r) => r.rows)
     *   mysql2/promise:  (sql, params) => pool.query(sql, params).then(([rows]) => rows)
     *   better-sqlite3:  async (sql, params) => db.prepare(sql).all(...params)
     *   Sequelize:       (sql, params) => sequelize.query(sql, {bind: params, type: QueryTypes.SELECT})
     *   Knex:            (sql, params) => knex.raw(sql, params).then((r) => r.rows ?? r[0])
     */
    query(sql: string, params: unknown[]): Promise<Row[]>;
    dialect: SqlDialect;
    /** The users table, optionally with its schema (`auth.users`). Default `users`. */
    table?: string;
    /**
     * Converts 9in's id (a string) for your id column, e.g. `(id) => /^\d+$/.test(id) ? Number(id) : undefined`
     * for an integer key, so an id the column can't hold is no user rather than a database error.
     * Return `undefined` for "no such user".
     */
    parseId?(id: string): unknown;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;

function quote(name: string, dialect: SqlDialect): string {
    if (!IDENTIFIER.test(name)) throw new Error(`9in: "${name}" is not a plain table or column name`);
    const [open, close] = dialect === 'mysql' ? ['`', '`'] : dialect === 'mssql' ? ['[', ']'] : ['"', '"'];
    return name
        .split('.')
        .map((part) => `${open}${part}${close}`)
        .join('.');
}

function placeholder(dialect: SqlDialect, index: number): string {
    return dialect === 'postgres' ? `$${index}` : dialect === 'mssql' ? `@p${index}` : '?';
}

/**
 * A UserStore over any SQL database, through a `query` function you already have:
 *
 *   const users = sqlUserStore({dialect: 'postgres', query: (sql, params) => pool.query(sql, params).then((r) => r.rows)});
 *   app.use('/nine', nineAdapter({users}));
 *
 * Emails and usernames match with `lower(column) = lower(value)`; add an index on
 * `lower(email)` (PostgreSQL, SQLite) for speed. Table and column names must be plain
 * identifiers; values are always parameters. An email or username shared by two rows signs
 * nobody in.
 */
export function sqlUserStore<U extends Row = Row>(options: SqlUserStoreOptions<U>): UserStore<U> {
    const {fields, verifyPassword, toAdapterUser} = storeHelpers(options);
    const {dialect} = options;
    if (!['postgres', 'mysql', 'sqlite', 'mssql'].includes(dialect)) throw new Error('9in: sqlUserStore needs dialect: "postgres", "mysql", "sqlite" or "mssql"');
    const table = quote(options.table ?? 'users', dialect);
    const select = (where: string, limit: number) => (dialect === 'mssql' ? `SELECT TOP ${limit} * FROM ${table} WHERE ${where}` : `SELECT * FROM ${table} WHERE ${where} LIMIT ${limit}`);
    const p1 = placeholder(dialect, 1);
    // Compiled once, so a bad field name fails at startup.
    const byId = select(`${quote(fields.id, dialect)} = ${p1}`, 1);
    const byColumn = new Map<string, string>();
    for (const type of ['email', 'username', 'phone'] as const) {
        const column = identifierColumn(fields, {type, value: ''});
        if (!column) continue;
        const quoted = quote(column, dialect);
        byColumn.set(type, select(type === 'phone' ? `${quoted} = ${p1}` : `lower(${quoted}) = lower(${p1})`, 2));
    }
    const rows = async (sql: string, value: unknown) => (await options.query(sql, [value])) as U[];
    return {
        async findById(id) {
            const key = options.parseId ? options.parseId(id) : id;
            if (key === undefined || key === null || (typeof key === 'number' && Number.isNaN(key))) return null;
            return (await rows(byId, key))[0] ?? null;
        },
        async findByIdentifier(identifier: AdapterIdentifier) {
            const sql = byColumn.get(identifier.type);
            if (!sql) return null;
            return single(await rows(sql, identifier.value));
        },
        verifyPassword,
        toAdapterUser,
    };
}
