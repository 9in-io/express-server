import type {AdapterIdentifier} from '@9in-io/node';
import type {UserStore} from '../index';
import {caseInsensitive, identifierColumn, single, storeHelpers, type Row, type StoreOptions} from './common';

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
    indexes?: {email?: string; username?: string; phone?: string};
    /**
     * DynamoDB matches exactly, so emails and usernames are looked up lowercased (true, the
     * default): store them lowercased, or in a lowercased copy that `fields.email` /
     * `fields.username` names. `false` looks them up as typed.
     */
    lowercase?: boolean;
}

function commands(): {GetCommand: any; QueryCommand: any} {
    try {
        return require('@aws-sdk/lib-dynamodb');
    } catch {
        throw new Error('9in: dynamoUserStore needs @aws-sdk/lib-dynamodb (npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb)');
    }
}

/**
 * A UserStore over a DynamoDB table (AWS SDK v3):
 *
 *   const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
 *   const users = dynamoUserStore({client, table: 'users', indexes: {email: 'email-index'}});
 *
 * The table's partition key is `fields.id` (default `id`).
 */
export function dynamoUserStore<U extends Row = Row>(options: DynamoUserStoreOptions<U>): UserStore<U> {
    const {GetCommand, QueryCommand} = commands();
    const {fields, verifyPassword, toAdapterUser} = storeHelpers(options);
    const lowercase = options.lowercase ?? true;
    return {
        async findById(id) {
            const result = await options.client.send(new GetCommand({TableName: options.table, Key: {[fields.id]: id}, ConsistentRead: true}));
            return (result?.Item as U | undefined) ?? null;
        },
        async findByIdentifier(identifier: AdapterIdentifier) {
            const column = identifierColumn(fields, identifier);
            const index = options.indexes?.[identifier.type];
            if (!column || !index) return null;
            const value = lowercase && caseInsensitive(identifier) ? identifier.value.toLowerCase() : identifier.value;
            const result = await options.client.send(
                new QueryCommand({
                    TableName: options.table,
                    IndexName: index,
                    KeyConditionExpression: '#k = :v',
                    ExpressionAttributeNames: {'#k': column},
                    ExpressionAttributeValues: {':v': value},
                    Limit: 2,
                }),
            );
            return single((result?.Items ?? []) as U[]);
        },
        verifyPassword,
        toAdapterUser,
    };
}
