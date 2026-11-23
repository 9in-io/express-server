import type {AdapterIdentifier, AdapterUser} from '@9in-io/node';

/** A row or document of your users table: whatever your database returns. */
export type Row = Record<string, any>;

/**
 * Where each piece of a user lives in your table or collection. Every entry is a column (or
 * attribute) name; `blocked` and `email_verified` may also be functions of the whole row.
 * Unset entries use the defaults in DEFAULT_FIELDS; set one to `null` when you don't have it.
 */
export interface UserFields {
    id?: string;
    email?: string | null;
    username?: string | null;
    /** The phone number column, matched exactly (store E.164: +447700900123). */
    phone?: string | null;
    /** The password hash: bcrypt ($2a$, $2b$, $2y$) or argon2 ($argon2…) out of the box. */
    password?: string | null;
    email_verified?: string | null | ((row: Row) => boolean);
    phone_number_verified?: string | null | ((row: Row) => boolean);
    /** A boolean column that is true for disabled accounts, or a function. */
    blocked?: string | null | ((row: Row) => boolean);
    name?: string | null;
    given_name?: string | null;
    family_name?: string | null;
    picture?: string | null;
    locale?: string | null;
    zoneinfo?: string | null;
    birthdate?: string | null;
}

export const DEFAULT_FIELDS: Required<{[K in keyof UserFields]: Exclude<UserFields[K], undefined>}> = {
    id: 'id',
    email: 'email',
    username: 'username',
    phone: 'phone_number',
    password: 'password_hash',
    email_verified: 'email_verified',
    phone_number_verified: 'phone_number_verified',
    blocked: 'blocked',
    name: 'name',
    given_name: 'given_name',
    family_name: 'family_name',
    picture: 'picture',
    locale: 'locale',
    zoneinfo: 'zoneinfo',
    birthdate: 'birthdate',
};

export type ResolvedFields = typeof DEFAULT_FIELDS;

/** Options every ready-made store takes. */
export interface StoreOptions<U extends Row = Row> {
    /** Column names, when yours differ from the defaults. */
    fields?: UserFields;
    /**
     * Check a password against the row. Default: the `password` column, as a bcrypt hash
     * (needs `bcrypt` or `bcryptjs` installed) or an argon2 hash (needs `argon2`).
     */
    verifyPassword?(user: U, password: string): boolean | Promise<boolean>;
    /** Build what 9in gets from the row. Default: the mapped fields; see `metadata` too. */
    toAdapterUser?(user: U): AdapterUser | Promise<AdapterUser>;
    /** Extra values for the user's `metadata` (custom claims), from the row. */
    metadata?(user: U): Record<string, unknown> | undefined;
}

export function resolveFields(fields: UserFields = {}): ResolvedFields {
    return {...DEFAULT_FIELDS, ...fields} as ResolvedFields;
}

/** The column an identifier is looked up in, or null when that kind isn't stored. */
export function identifierColumn(fields: ResolvedFields, identifier: AdapterIdentifier): string | null {
    const column = identifier.type === 'email' ? fields.email : identifier.type === 'username' ? fields.username : identifier.type === 'phone' ? fields.phone : null;
    return typeof column === 'string' && column ? column : null;
}

/** One match, or null: an identifier shared by two users signs nobody in. */
export function single<T>(rows: readonly T[] | null | undefined): T | null {
    return rows && rows.length === 1 ? rows[0]! : null;
}

/** Emails and usernames match case-insensitively; phone numbers exactly. */
export function caseInsensitive(identifier: AdapterIdentifier): boolean {
    return identifier.type === 'email' || identifier.type === 'username';
}

function flag(row: Row, field: string | null | ((row: Row) => boolean)): boolean | undefined {
    if (typeof field === 'function') return Boolean(field(row));
    if (!field || row[field] === undefined || row[field] === null) return undefined;
    const value = row[field];
    // SQL drivers return booleans as 0/1 or 't'/'f'.
    if (typeof value === 'string') return value === 't' || value === 'true' || value === '1';
    return Boolean(value);
}

function text(row: Row, field: string | null): string | undefined {
    if (!field) return undefined;
    const value = row[field];
    if (value === undefined || value === null || value === '') return undefined;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value);
}

/** The default mapping from a row to the user 9in gets. */
export function mapUser<R extends Row = Row>(row: R, fields: ResolvedFields, metadata?: (row: R) => Record<string, unknown> | undefined): AdapterUser {
    const id = row[fields.id];
    if (id === undefined || id === null || id === '') throw new Error(`9in: user row has no "${fields.id}" (set fields.id)`);
    const user: AdapterUser = {id: typeof id === 'object' && typeof id.toString === 'function' ? id.toString() : String(id)};
    const strings: (keyof AdapterUser & keyof ResolvedFields)[] = ['email', 'username', 'name', 'given_name', 'family_name', 'picture', 'locale', 'zoneinfo', 'birthdate'];
    for (const key of strings) {
        const value = text(row, fields[key] as string | null);
        if (value !== undefined) (user as unknown as Record<string, unknown>)[key] = value;
    }
    const phone = text(row, fields.phone);
    if (phone !== undefined) user.phone_number = phone;
    const emailVerified = flag(row, fields.email_verified);
    if (emailVerified !== undefined && user.email) user.email_verified = emailVerified;
    const phoneVerified = flag(row, fields.phone_number_verified);
    if (phoneVerified !== undefined && user.phone_number) user.phone_number_verified = phoneVerified;
    user.blocked = flag(row, fields.blocked) ?? false;
    const extra = metadata?.(row);
    if (extra && Object.keys(extra).length) user.metadata = extra;
    return user;
}

// A hash that can't match anything, checked when there is no user, so a wrong email and a
// wrong password take about as long.
export const DUMMY_BCRYPT = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8DhVnE8Uw4e5rA9mW7HqvDp5V6p1jO';

function load(name: string): any {
    try {
        return require(name);
    } catch {
        return null;
    }
}

/** Checks a bcrypt or argon2 hash with whichever library is installed. */
export async function verifyHash(password: string, hash: string | null | undefined): Promise<boolean> {
    if (!hash) {
        await verifyHash(password, DUMMY_BCRYPT).catch(() => false);
        return false;
    }
    if (/^\$2[abxy]\$/.test(hash)) {
        const bcrypt = load('bcrypt') ?? load('bcryptjs');
        if (!bcrypt) throw new Error('9in: install bcrypt or bcryptjs to check bcrypt password hashes, or pass verifyPassword');
        return Boolean(await bcrypt.compare(password, hash));
    }
    if (hash.startsWith('$argon2')) {
        const argon2 = load('argon2');
        if (!argon2) throw new Error('9in: install argon2 to check argon2 password hashes, or pass verifyPassword');
        return Boolean(await argon2.verify(hash, password));
    }
    throw new Error('9in: unrecognised password hash format (bcrypt and argon2 are built in); pass verifyPassword');
}

/** The parts every ready-made store shares: password checks and the row → user mapping. */
export function storeHelpers<U extends Row>(options: StoreOptions<U>) {
    const fields = resolveFields(options.fields);
    return {
        fields,
        async verifyPassword(user: U, password: string): Promise<boolean> {
            if (options.verifyPassword) return Boolean(await options.verifyPassword(user, password));
            return verifyHash(password, fields.password ? (user[fields.password] as string | null) : null);
        },
        toAdapterUser(user: U): AdapterUser | Promise<AdapterUser> {
            return options.toAdapterUser ? options.toAdapterUser(user) : mapUser(user, fields, options.metadata);
        },
    };
}
