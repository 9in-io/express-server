import type { AdapterIdentifier, AdapterUser } from '@9in-io/node';
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
export declare const DEFAULT_FIELDS: Required<{
    [K in keyof UserFields]: Exclude<UserFields[K], undefined>;
}>;
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
export declare function resolveFields(fields?: UserFields): ResolvedFields;
/** The column an identifier is looked up in, or null when that kind isn't stored. */
export declare function identifierColumn(fields: ResolvedFields, identifier: AdapterIdentifier): string | null;
/** One match, or null: an identifier shared by two users signs nobody in. */
export declare function single<T>(rows: readonly T[] | null | undefined): T | null;
/** Emails and usernames match case-insensitively; phone numbers exactly. */
export declare function caseInsensitive(identifier: AdapterIdentifier): boolean;
/** The default mapping from a row to the user 9in gets. */
export declare function mapUser<R extends Row = Row>(row: R, fields: ResolvedFields, metadata?: (row: R) => Record<string, unknown> | undefined): AdapterUser;
export declare const DUMMY_BCRYPT = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8DhVnE8Uw4e5rA9mW7HqvDp5V6p1jO";
/** Checks a bcrypt or argon2 hash with whichever library is installed. */
export declare function verifyHash(password: string, hash: string | null | undefined): Promise<boolean>;
/** The parts every ready-made store shares: password checks and the row → user mapping. */
export declare function storeHelpers<U extends Row>(options: StoreOptions<U>): {
    fields: Required<{
        id?: string | undefined;
        email?: string | null | undefined;
        username?: string | null | undefined;
        phone?: string | null | undefined;
        password?: string | null | undefined;
        email_verified?: string | null | ((row: Row) => boolean) | undefined;
        phone_number_verified?: string | null | ((row: Row) => boolean) | undefined;
        blocked?: string | null | ((row: Row) => boolean) | undefined;
        name?: string | null | undefined;
        given_name?: string | null | undefined;
        family_name?: string | null | undefined;
        picture?: string | null | undefined;
        locale?: string | null | undefined;
        zoneinfo?: string | null | undefined;
        birthdate?: string | null | undefined;
    }>;
    verifyPassword(user: U, password: string): Promise<boolean>;
    toAdapterUser(user: U): AdapterUser | Promise<AdapterUser>;
};
