"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sqlUserStore = sqlUserStore;
const common_1 = require("./common");
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;
function quote(name, dialect) {
    if (!IDENTIFIER.test(name))
        throw new Error(`9in: "${name}" is not a plain table or column name`);
    const [open, close] = dialect === 'mysql' ? ['`', '`'] : dialect === 'mssql' ? ['[', ']'] : ['"', '"'];
    return name
        .split('.')
        .map((part) => `${open}${part}${close}`)
        .join('.');
}
function placeholder(dialect, index) {
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
function sqlUserStore(options) {
    const { fields, verifyPassword, toAdapterUser } = (0, common_1.storeHelpers)(options);
    const { dialect } = options;
    if (!['postgres', 'mysql', 'sqlite', 'mssql'].includes(dialect))
        throw new Error('9in: sqlUserStore needs dialect: "postgres", "mysql", "sqlite" or "mssql"');
    const table = quote(options.table ?? 'users', dialect);
    const select = (where, limit) => (dialect === 'mssql' ? `SELECT TOP ${limit} * FROM ${table} WHERE ${where}` : `SELECT * FROM ${table} WHERE ${where} LIMIT ${limit}`);
    const p1 = placeholder(dialect, 1);
    // Compiled once, so a bad field name fails at startup.
    const byId = select(`${quote(fields.id, dialect)} = ${p1}`, 1);
    const byColumn = new Map();
    for (const type of ['email', 'username', 'phone']) {
        const column = (0, common_1.identifierColumn)(fields, { type, value: '' });
        if (!column)
            continue;
        const quoted = quote(column, dialect);
        byColumn.set(type, select(type === 'phone' ? `${quoted} = ${p1}` : `lower(${quoted}) = lower(${p1})`, 2));
    }
    const rows = async (sql, value) => (await options.query(sql, [value]));
    return {
        async findById(id) {
            const key = options.parseId ? options.parseId(id) : id;
            if (key === undefined || key === null || (typeof key === 'number' && Number.isNaN(key)))
                return null;
            return (await rows(byId, key))[0] ?? null;
        },
        async findByIdentifier(identifier) {
            const sql = byColumn.get(identifier.type);
            if (!sql)
                return null;
            return (0, common_1.single)(await rows(sql, identifier.value));
        },
        verifyPassword,
        toAdapterUser,
    };
}
