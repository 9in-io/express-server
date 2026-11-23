import type { UserStore } from '../index';
import { type Row, type StoreOptions } from './common';
/** The part of a `DynamoDBDocumentClient` (`@aws-sdk/lib-dynamodb`) the store uses. */
export interface DynamoDocumentClient {
    send(command: any): Promise<any>;
}
export interface DynamoUserStoreOptions<U extends Row = Row> extends StoreOptions<U> {
    /** `DynamoDBDocumentClient.from(new DynamoDBClient({...}))` from `@aws-sdk/lib-dynamodb`. */
    client: DynamoDocumentClient;
    table: string;
    /**
     * Global secondary indexes, one per identifier, whose partition key is that identifier's
     * attribute (`fields.email`, `fields.username`, `fields.phone`). An identifier without an
     * index can't be used to sign in.
     */
    indexes?: {
        email?: string;
        username?: string;
        phone?: string;
    };
    /**
     * DynamoDB matches exactly, so emails and usernames are looked up lowercased (true, the
     * default): store them lowercased, or in a lowercased copy that `fields.email` /
     * `fields.username` names. `false` looks them up as typed.
     */
    lowercase?: boolean;
}
/**
 * A UserStore over a DynamoDB table (AWS SDK v3):
 *
 *   const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
 *   const users = dynamoUserStore({client, table: 'users', indexes: {email: 'email-index'}});
 *
 * The table's partition key is `fields.id` (default `id`).
 */
export declare function dynamoUserStore<U extends Row = Row>(options: DynamoUserStoreOptions<U>): UserStore<U>;
