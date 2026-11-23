"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mongoUserStore = mongoUserStore;
exports.mongooseUserStore = mongooseUserStore;
const common_1 = require("./common");
/** Case-insensitive matching for emails and usernames, without regular expressions. */
const IGNORE_CASE = { locale: 'en', strength: 2 };
function defaultParseId() {
    let ObjectId;
    for (const name of ['mongodb', 'bson', 'mongoose']) {
        try {
            const mod = require(name);
            ObjectId = mod.ObjectId ?? mod.Types?.ObjectId;
            if (ObjectId)
                break;
        }
        catch {
            // not installed
        }
    }
    return (id) => (ObjectId && /^[0-9a-f]{24}$/i.test(id) ? new ObjectId(id) : id);
}
/**
 * A UserStore over a MongoDB collection (the official `mongodb` driver):
 *
 *   app.use('/nine', nineAdapter({users: mongoUserStore(db.collection('users'))}));
 *
 * The id field defaults to `_id`. Emails and usernames match ignoring case (a collation); give
 * those fields an index with the same collation ({locale: 'en', strength: 2}) for speed.
 */
function mongoUserStore(collection, options = {}) {
    const { fields, verifyPassword, toAdapterUser } = (0, common_1.storeHelpers)({ ...options, fields: { id: '_id', ...options.fields } });
    const parseId = options.parseId ?? defaultParseId();
    return {
        async findById(id) {
            return (await collection.findOne({ [fields.id]: parseId(id) })) ?? null;
        },
        async findByIdentifier(identifier) {
            const column = (0, common_1.identifierColumn)(fields, identifier);
            if (!column)
                return null;
            const options = (0, common_1.caseInsensitive)(identifier) ? { collation: IGNORE_CASE, limit: 2 } : { limit: 2 };
            return (0, common_1.single)(await collection.find({ [column]: identifier.value }, options).toArray());
        },
        verifyPassword,
        toAdapterUser,
    };
}
/**
 * A UserStore over a Mongoose model:
 *
 *   app.use('/nine', nineAdapter({users: mongooseUserStore(User, {fields: {password: 'passwordHash'}})}));
 */
function mongooseUserStore(model, options = {}) {
    const { fields, verifyPassword, toAdapterUser } = (0, common_1.storeHelpers)({ ...options, fields: { id: '_id', ...options.fields } });
    const parseId = options.parseId ?? defaultParseId();
    return {
        async findById(id) {
            try {
                return (await model.findOne({ [fields.id]: parseId(id) }).lean()) ?? null;
            }
            catch (error) {
                // An id your schema can't cast (not an ObjectId) is not a user.
                if (error?.name === 'CastError')
                    return null;
                throw error;
            }
        },
        async findByIdentifier(identifier) {
            const column = (0, common_1.identifierColumn)(fields, identifier);
            if (!column)
                return null;
            const query = model.find({ [column]: identifier.value }).limit(2);
            return (0, common_1.single)((await ((0, common_1.caseInsensitive)(identifier) ? query.collation(IGNORE_CASE) : query).lean()));
        },
        verifyPassword,
        toAdapterUser,
    };
}
