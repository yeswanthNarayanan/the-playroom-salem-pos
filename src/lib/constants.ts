// ─── Games Category Constants ────────────────────────────────────────────────
// The "Games" category is a special POS category. Items in this category:
//   • ARE billed normally (appear in orders, order_items, sales, stats)
//   • ARE NOT shown in the Kitchen Display (Chef view)
//   • ARE NOT printed on KOT receipts
//   • Have their own dedicated stats cards on the Dashboard

export const GAMES_CATEGORY = 'Games';

/**
 * Check whether a menu-item category (string) is the games category.
 * Case-insensitive to avoid data-entry mismatches.
 */
export function isGameCategory(category: string): boolean {
    const norm = category.trim().toLowerCase();
    return norm === 'games' || norm === 'game';
}

/**
 * Check whether an item (with a `category` or matched by name lookup) is a game.
 * Works with MenuItem objects that have a `.category` field.
 */
export function isGameItem(item: { category?: string }): boolean {
    return !!item.category && isGameCategory(item.category);
}
