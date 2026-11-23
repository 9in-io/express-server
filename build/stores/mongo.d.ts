import type { UserStore } from '../index';
import { type Row, type StoreOptions } from './common';
export interface MongoUserStoreOptions<U extends Row = Row> extends StoreOptions<U> {
    /**
     * Converts 9in's id (a string) to your `_id`: by default a 24-character hex string becomes
     * an ObjectId when the `mongodb` (or `bson`) package is installed; other ids stay strings.
     */
    parseId?(id: string): unknown;
}
/** The part of a MongoDB driver collection (`db.collection('users')`) the store uses. */
export interface MongoCollection {
    findOne(filter: Record<string, unknown>, options?: Record<string, unknown>): Promise<any>;
    find(filter: Record<string, unknown>, options?: Record<string, unknown>): {
        toArray(): Promise<any[]>;
    };
}
/**
 * A UserStore over a MongoDB collection (the official `mongodb` driver):
 *
 *   app.use('/nine', nineAdapter({users: mongoUserStore(db.collection('users'))}));
 *
 * The id field defaults to `_id`. Emails and usernames match ignoring case (a collation); give
 * those fields an index with the same collation ({locale: 'en', strength: 2}) for speed.
 */
export declare function mongoUserStore<U extends Row = Row>(collection: MongoCollection, options?: MongoUserStoreOptions<U>): UserStore<U>;
/** The part of a Mongoose model the store uses. */
export interface MongooseModel {
    findOne(filter: Record<string, unknown>): {
        lean(): any;
    };
    find(filter: Record<string, unknown>): {
        collation(collation: Record<string, unknown>): any;
        limit(n: number): any;
        lean(): any;
    };
}
/**
 * A UserStore over a Mongoose model:
 *
 *   app.use('/nine', nineAdapter({users: mongooseUserStore(User, {fields: {password: 'passwordHash'}})}));
 */
export declare function mongooseUserStore<U extends Row = Row>(model: MongooseModel, options?: MongoUserStoreOptions<U>): UserStore<U>;
