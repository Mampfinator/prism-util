import { Collection } from "discord.js";

export function pluralize(singular: string, plural: string, count: number): string {
    return count === 1 ? singular : plural;
}

/**
 * Computes the asymmetric difference between two collections.
 *
 * @param {Collection<TKey, TValue>} before - The initial collection
 * @param {Collection<TKey, TValue>} after - The final collection to compare against
 * @return {{ removed: Collection<TKey, TValue>; added: Collection<TKey, TValue> }} The removed and added elements
 */
export function asymmetricDiff<TKey, TValue>(
    before: Collection<TKey, TValue>,
    after: Collection<TKey, TValue>,
): { removed: Collection<TKey, TValue>; added: Collection<TKey, TValue> } {
    return {
        removed: new Collection(
            [...before.keys()].filter(key => !after.has(key)).map(key => [key, before.get(key)!]),
        ),
        added: new Collection(
            [...after.keys()].filter(key => !before.has(key)).map(key => [key, after.get(key)!]),
        ),
    };
}
