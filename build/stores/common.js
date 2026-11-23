"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DUMMY_BCRYPT = exports.DEFAULT_FIELDS = void 0;
exports.resolveFields = resolveFields;
exports.identifierColumn = identifierColumn;
exports.single = single;
exports.caseInsensitive = caseInsensitive;
exports.mapUser = mapUser;
exports.verifyHash = verifyHash;
exports.storeHelpers = storeHelpers;
exports.DEFAULT_FIELDS = {
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
function resolveFields(fields = {}) {
    return { ...exports.DEFAULT_FIELDS, ...fields };
}
/** The column an identifier is looked up in, or null when that kind isn't stored. */
function identifierColumn(fields, identifier) {
    const column = identifier.type === 'email' ? fields.email : identifier.type === 'username' ? fields.username : identifier.type === 'phone' ? fields.phone : null;
    return typeof column === 'string' && column ? column : null;
}
/** One match, or null: an identifier shared by two users signs nobody in. */
function single(rows) {
    return rows && rows.length === 1 ? rows[0] : null;
}
/** Emails and usernames match case-insensitively; phone numbers exactly. */
function caseInsensitive(identifier) {
    return identifier.type === 'email' || identifier.type === 'username';
}
function flag(row, field) {
    if (typeof field === 'function')
        return Boolean(field(row));
    if (!field || row[field] === undefined || row[field] === null)
        return undefined;
    const value = row[field];
    // SQL drivers return booleans as 0/1 or 't'/'f'.
    if (typeof value === 'string')
        return value === 't' || value === 'true' || value === '1';
    return Boolean(value);
}
function text(row, field) {
    if (!field)
        return undefined;
    const value = row[field];
    if (value === undefined || value === null || value === '')
        return undefined;
    if (value instanceof Date)
        return value.toISOString().slice(0, 10);
    return String(value);
}
/** The default mapping from a row to the user 9in gets. */
function mapUser(row, fields, metadata) {
    const id = row[fields.id];
    if (id === undefined || id === null || id === '')
        throw new Error(`9in: user row has no "${fields.id}" (set fields.id)`);
    const user = { id: typeof id === 'object' && typeof id.toString === 'function' ? id.toString() : String(id) };
    const strings = ['email', 'username', 'name', 'given_name', 'family_name', 'picture', 'locale', 'zoneinfo', 'birthdate'];
    for (const key of strings) {
        const value = text(row, fields[key]);
        if (value !== undefined)
            user[key] = value;
    }
    const phone = text(row, fields.phone);
    if (phone !== undefined)
        user.phone_number = phone;
    const emailVerified = flag(row, fields.email_verified);
    if (emailVerified !== undefined && user.email)
        user.email_verified = emailVerified;
    const phoneVerified = flag(row, fields.phone_number_verified);
    if (phoneVerified !== undefined && user.phone_number)
        user.phone_number_verified = phoneVerified;
    user.blocked = flag(row, fields.blocked) ?? false;
    const extra = metadata?.(row);
    if (extra && Object.keys(extra).length)
        user.metadata = extra;
    return user;
}
// A hash that can't match anything, checked when there is no user, so a wrong email and a
// wrong password take about as long.
exports.DUMMY_BCRYPT = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8DhVnE8Uw4e5rA9mW7HqvDp5V6p1jO';
function load(name) {
    try {
        return require(name);
    }
    catch {
        return null;
    }
}
/** Checks a bcrypt or argon2 hash with whichever library is installed. */
async function verifyHash(password, hash) {
    if (!hash) {
        await verifyHash(password, exports.DUMMY_BCRYPT).catch(() => false);
        return false;
    }
    if (/^\$2[abxy]\$/.test(hash)) {
        const bcrypt = load('bcrypt') ?? load('bcryptjs');
        if (!bcrypt)
            throw new Error('9in: install bcrypt or bcryptjs to check bcrypt password hashes, or pass verifyPassword');
        return Boolean(await bcrypt.compare(password, hash));
    }
    if (hash.startsWith('$argon2')) {
        const argon2 = load('argon2');
        if (!argon2)
            throw new Error('9in: install argon2 to check argon2 password hashes, or pass verifyPassword');
        return Boolean(await argon2.verify(hash, password));
    }
    throw new Error('9in: unrecognised password hash format (bcrypt and argon2 are built in); pass verifyPassword');
}
/** The parts every ready-made store shares: password checks and the row → user mapping. */
function storeHelpers(options) {
    const fields = resolveFields(options.fields);
    return {
        fields,
        async verifyPassword(user, password) {
            if (options.verifyPassword)
                return Boolean(await options.verifyPassword(user, password));
            return verifyHash(password, fields.password ? user[fields.password] : null);
        },
        toAdapterUser(user) {
            return options.toAdapterUser ? options.toAdapterUser(user) : mapUser(user, fields, options.metadata);
        },
    };
}
