import type { UserStore } from '../index';
import { type Row, type StoreOptions } from './common';
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
export declare function sqlUserStore<U extends Row = Row>(options: SqlUserStoreOptions<U>): UserStore<U>;
