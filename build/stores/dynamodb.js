"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dynamoUserStore = dynamoUserStore;
const common_1 = require("./common");
function commands() {
    try {
        return require('@aws-sdk/lib-dynamodb');
    }
    catch {
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
function dynamoUserStore(options) {
    const { GetCommand, QueryCommand } = commands();
    const { fields, verifyPassword, toAdapterUser } = (0, common_1.storeHelpers)(options);
    const lowercase = options.lowercase ?? true;
    return {
        async findById(id) {
            const result = await options.client.send(new GetCommand({ TableName: options.table, Key: { [fields.id]: id }, ConsistentRead: true }));
            return result?.Item ?? null;
        },
        async findByIdentifier(identifier) {
            const column = (0, common_1.identifierColumn)(fields, identifier);
            const index = options.indexes?.[identifier.type];
            if (!column || !index)
                return null;
            const value = lowercase && (0, common_1.caseInsensitive)(identifier) ? identifier.value.toLowerCase() : identifier.value;
            const result = await options.client.send(new QueryCommand({
                TableName: options.table,
                IndexName: index,
                KeyConditionExpression: '#k = :v',
                ExpressionAttributeNames: { '#k': column },
                ExpressionAttributeValues: { ':v': value },
                Limit: 2,
            }));
            return (0, common_1.single)((result?.Items ?? []));
        },
        verifyPassword,
        toAdapterUser,
    };
}
