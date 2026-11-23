import type {AdapterIdentifier} from '@9in-io/node';
import type {UserStore} from '../index';
import {caseInsensitive, identifierColumn, single, storeHelpers, type Row, type StoreOptions} from './common';

/** The part of a Prisma model delegate (`prisma.user`) the store uses. */
export interface PrismaUserDelegate {
    findFirst(args: {where: Record<string, unknown>}): Promise<any>;
    findMany(args: {where: Record<string, unknown>; take?: number}): Promise<any[]>;
}

export interface PrismaUserStoreOptions<U extends Row = Row> extends StoreOptions<U> {
    /**
     * How emails and usernames are matched without regard to case:
     * - `"insensitive"` (default): Prisma's `mode: "insensitive"` (PostgreSQL, MongoDB, CockroachDB).
     * - `"database"`: an exact `equals`, for MySQL, MariaDB and SQL Server, whose usual collations
     *   already ignore case, or a column you keep lowercased.
     * - `"lowercase"`: the value is lowercased first, for SQLite with lowercased columns.
     */
    caseMatching?: 'insensitive' | 'database' | 'lowercase';
    /** Converts 9in's id (a string) to your id type, e.g. `Number` for an integer primary key. */
    parseId?(id: string): unknown;
}

/**
 * A UserStore over a Prisma model:
 *
 *   app.use('/nine', nineAdapter({users: prismaUserStore(prisma.user, {fields: {password: 'passwordHash'}})}));
 */
export function prismaUserStore<U extends Row = Row>(model: PrismaUserDelegate, options: PrismaUserStoreOptions<U> = {}): UserStore<U> {
    const {fields, verifyPassword, toAdapterUser} = storeHelpers(options);
    const matching = options.caseMatching ?? 'insensitive';
    return {
        async findById(id) {
            let key: unknown = id;
            if (options.parseId) {
                key = options.parseId(id);
                if (key === undefined || key === null || (typeof key === 'number' && Number.isNaN(key))) return null;
            }
            return (await model.findFirst({where: {[fields.id]: key}})) ?? null;
        },
        async findByIdentifier(identifier: AdapterIdentifier) {
            const column = identifierColumn(fields, identifier);
            if (!column) return null;
            if (!caseInsensitive(identifier)) return single(await model.findMany({where: {[column]: identifier.value}, take: 2}));
            const condition =
                matching === 'insensitive' ? {equals: identifier.value, mode: 'insensitive'} : {equals: matching === 'lowercase' ? identifier.value.toLowerCase() : identifier.value};
            return single(await model.findMany({where: {[column]: condition}, take: 2}));
        },
        verifyPassword,
        toAdapterUser,
    };
}
