"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prismaUserStore = prismaUserStore;
const common_1 = require("./common");
/**
 * A UserStore over a Prisma model:
 *
 *   app.use('/nine', nineAdapter({users: prismaUserStore(prisma.user, {fields: {password: 'passwordHash'}})}));
 */
function prismaUserStore(model, options = {}) {
    const { fields, verifyPassword, toAdapterUser } = (0, common_1.storeHelpers)(options);
    const matching = options.caseMatching ?? 'insensitive';
    return {
        async findById(id) {
            let key = id;
            if (options.parseId) {
                key = options.parseId(id);
                if (key === undefined || key === null || (typeof key === 'number' && Number.isNaN(key)))
                    return null;
            }
            return (await model.findFirst({ where: { [fields.id]: key } })) ?? null;
        },
        async findByIdentifier(identifier) {
            const column = (0, common_1.identifierColumn)(fields, identifier);
            if (!column)
                return null;
            if (!(0, common_1.caseInsensitive)(identifier))
                return (0, common_1.single)(await model.findMany({ where: { [column]: identifier.value }, take: 2 }));
            const condition = matching === 'insensitive' ? { equals: identifier.value, mode: 'insensitive' } : { equals: matching === 'lowercase' ? identifier.value.toLowerCase() : identifier.value };
            return (0, common_1.single)(await model.findMany({ where: { [column]: condition }, take: 2 }));
        },
        verifyPassword,
        toAdapterUser,
    };
}
