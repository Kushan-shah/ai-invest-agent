/**
 * Shared Formatting Utility Functions
 */

/**
 * Formats a number with its proper English ordinal suffix (e.g. 1 -> 1st, 22 -> 22nd, 15 -> 15th)
 */
export function ordinal(n) {
  if (n === null || n === undefined || isNaN(n)) return 'N/A';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
