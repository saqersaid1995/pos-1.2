/**
 * Format a number as OMR currency with 3 decimal places (fixed).
 * Example: formatOMR(1.5) → "OMR 1.500"
 */
export function formatOMR(amount: number): string {
  return `OMR ${Math.abs(amount).toFixed(3)}`;
}

/**
 * Compact OMR format — drops trailing zeros and decimal point when not needed.
 * Examples:
 *   formatOMRCompact(150) → "OMR 150"
 *   formatOMRCompact(10.5) → "OMR 10.500"  (kept exact, trims only trailing zeros after meaningful digits)
 *   formatOMRCompact(10.5, true) → "OMR 10.5"
 */
export function formatOMRCompact(amount: number): string {
  const abs = Math.abs(amount);
  const fixed = abs.toFixed(3);
  // Remove trailing zeros and dangling dot
  const trimmed = fixed.replace(/\.?0+$/, "");
  return `OMR ${trimmed}`;
}

/**
 * Format with sign for negative values
 */
export function formatOMRSigned(amount: number): string {
  const prefix = amount < 0 ? "-" : amount > 0 ? "+" : "";
  return `${prefix}OMR ${Math.abs(amount).toFixed(3)}`;
}

export const CURRENCY_SYMBOL = "OMR";
export const CURRENCY_DECIMALS = 3;
