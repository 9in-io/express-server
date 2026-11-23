import type {AdapterIdentifier} from '@9in-io/node';
import type {UserStore} from '../index';
import {caseInsensitive, identifierColumn, single, storeHelpers, type Row, type StoreOptions} from './common';

/** Case-insensitive matching for emails and usernames, without regular expressions. */
const IGNORE_CASE = {locale: 'en', strength: 2};

export interface MongoUserStoreOptions<U extends Row = Row> extends StoreOptions<U> {
    /**
     * Converts 9in's id (a string) to your `_id`: by default a 24-character hex string becomes
     * an ObjectId when the `mongodb` (or `bson`) package is installed; other ids stay strings.
     */
    parseId?(id: string): unknown;
}

function defaultParseId(): (id: string) => unknown {
    let ObjectId: any;
    for (const name of ['mongodb', 'bson', 'mongoose']) {
        try {
            const mod = require(name);
            ObjectId = mod.ObjectId ?? mod.Types?.ObjectId;
            if (ObjectId) break;
        } catch {
            // not installed
        }
    }
    return (id) => (ObjectId && /^[0-9a-f]{24}$/i.test(id) ? new ObjectId(id) : id);
}

/** The part of a MongoDB driver collection (`db.collection('users')`) the store uses. */
export interface MongoCollection {
    findOne(filter: Record<string, unknown>, options?: Record<string, unknown>): Promise<any>;
    find(filter: Record<string, unknown>, options?: Record<string, unknown>): {toArray(): Promise<any[]>};
}

/**
 * A UserStore over a MongoDB collection (the official `mongodb` driver):
 *
 *   app.use('/nine', nineAdapter({users: mongoUserStore(db.collection('users'))}));
 *
 * The id field defaults to `_id`. Emails and usernames match ignoring case (a collation); give
 * those fields an index with the same collation ({locale: 'en', strength: 2}) for speed.
 */
export function mongoUserStore<U extends Row = Row>(collection: MongoCollection, options: MongoUserStoreOptions<U> = {}): UserStore<U> {
    const {fields, verifyPassword, toAdapterUser} = storeHelpers({...options, fields: {id: '_id', ...options.fields}});
    const parseId = options.parseId ?? defaultParseId();
    return {
        async findById(id) {
            return (await collection.findOne({[fields.id]: parseId(id)})) ?? null;
        },
        async findByIdentifier(identifier: AdapterIdentifier) {
            const column = identifierColumn(fields, identifier);
            if (!column) return null;
            const options = caseInsensitive(identifier) ? {collation: IGNORE_CASE, limit: 2} : {limit: 2};
            return single(await collection.find({[column]: identifier.value}, options).toArray());
        },
        verifyPassword,
        toAdapterUser,
    };
}

/** The part of a Mongoose model the store uses. */
export interface MongooseModel {
    findOne(filter: Record<string, unknown>): {lean(): any};
    find(filter: Record<string, unknown>): {collation(collation: Record<string, unknown>): any; limit(n: number): any; lean(): any};
}

/**
 * A UserStore over a Mongoose model:
 *
 *   app.use('/nine', nineAdapter({users: mongooseUserStore(User, {fields: {password: 'passwordHash'}})}));
 */
export function mongooseUserStore<U extends Row = Row>(model: MongooseModel, options: MongoUserStoreOptions<U> = {}): UserStore<U> {
    const {fields, verifyPassword, toAdapterUser} = storeHelpers({...options, fields: {id: '_id', ...options.fields}});
    const parseId = options.parseId ?? defaultParseId();
    return {
        async findById(id) {
            try {
                return ((await model.findOne({[fields.id]: parseId(id)}).lean()) as U | null) ?? null;
            } catch (error) {
                // An id your schema can't cast (not an ObjectId) is not a user.
                if ((error as {name?: string})?.name === 'CastError') return null;
                throw error;
            }
        },
        async findByIdentifier(identifier: AdapterIdentifier) {
            const column = identifierColumn(fields, identifier);
            if (!column) return null;
            const query = model.find({[column]: identifier.value}).limit(2);
            return single((await (caseInsensitive(identifier) ? query.collation(IGNORE_CASE) : query).lean()) as U[]);
        },
        verifyPassword,
        toAdapterUser,
    };
}
