/**
 * Money handling for payroll.
 *
 * Every amount is an integer number of SEN (1/100 MYR). Intermediate arithmetic
 * uses BigInt, so no payroll figure ever passes through IEEE-754 floating point.
 * Decimal input arrives as a string and is parsed digit by digit rather than via
 * parseFloat, which would reintroduce the problem at the boundary.
 */

/** Largest amount any single field may hold: RM 10,000,000.00 in sen. */
export const MAX_SEN = 1_000_000_000;

/**
 * Divides two non-negative integers, rounding half away from zero.
 *
 * This is the ONLY rounding in payroll, and it happens at most once per derived
 * line. `(2n + d) / 2d` is exact in BigInt: no fractional intermediate exists.
 */
export function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new RangeError("Payroll division requires a positive denominator");
  }
  if (numerator < 0n) {
    throw new RangeError("Payroll amounts are never negative before rounding");
  }
  return (numerator * 2n + denominator) / (denominator * 2n);
}

export type MoneyParse =
  | { ok: true; sen: number }
  | { ok: false; reason: "format" | "range" };

const moneyPattern = /^(\d{1,9})(?:\.(\d{1,2}))?$/;

/**
 * Parses "3500", "3500.5" or "3500.50" into sen.
 *
 * A string is required. Accepting a JavaScript number here would mean trusting a
 * value that may already have lost precision before it arrived.
 */
export function parseMoneyToSen(value: unknown): MoneyParse {
  if (typeof value === "number") {
    // A whole number of sen is unambiguous and safe; anything else is refused.
    if (!Number.isSafeInteger(value) || value < 0) return { ok: false, reason: "format" };
    return value > MAX_SEN ? { ok: false, reason: "range" } : { ok: true, sen: value };
  }

  if (typeof value !== "string") return { ok: false, reason: "format" };

  const match = moneyPattern.exec(value.trim());
  if (!match) return { ok: false, reason: "format" };

  const whole = match[1]!;
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const sen = Number(whole) * 100 + Number(fraction);

  if (!Number.isSafeInteger(sen) || sen > MAX_SEN) return { ok: false, reason: "range" };
  return { ok: true, sen };
}

/** Renders sen as a plain decimal string, without a currency symbol or locale. */
export function formatSen(sen: number): string {
  const negative = sen < 0;
  const absolute = Math.abs(sen);
  const whole = Math.trunc(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export type QuantityParse =
  | { ok: true; scaled: number }
  | { ok: false; reason: "format" | "range" };

/**
 * Parses a decimal quantity into a scaled integer, e.g. hours to hundredths or
 * days to tenths. Keeps quantities exact for the same reason money is exact.
 */
export function parseScaledQuantity(
  value: unknown,
  decimals: 1 | 2,
  max: number,
): QuantityParse {
  const pattern = decimals === 1 ? /^(\d{1,4})(?:\.(\d))?$/ : /^(\d{1,5})(?:\.(\d{1,2}))?$/;
  const scale = decimals === 1 ? 10 : 100;

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return { ok: false, reason: "format" };
    // Scale through a fixed-decimal string so a binary fraction cannot round badly.
    return parseScaledQuantity(value.toFixed(decimals), decimals, max);
  }
  if (typeof value !== "string") return { ok: false, reason: "format" };

  const match = pattern.exec(value.trim());
  if (!match) return { ok: false, reason: "format" };

  const whole = Number(match[1]!);
  const fraction = Number((match[2] ?? "").padEnd(decimals, "0") || "0");
  const scaled = whole * scale + fraction;

  if (!Number.isSafeInteger(scaled) || scaled > max * scale) return { ok: false, reason: "range" };
  return { ok: true, scaled };
}

/** Renders a scaled integer back to a decimal string. */
export function formatScaled(scaled: number, decimals: 1 | 2): string {
  const scale = decimals === 1 ? 10 : 100;
  const whole = Math.trunc(scaled / scale);
  const fraction = String(scaled % scale).padStart(decimals, "0");
  return `${whole}.${fraction}`;
}
