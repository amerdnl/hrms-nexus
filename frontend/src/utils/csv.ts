/**
 * CSV cells built in the browser.
 *
 * The one file this app writes client-side is the credentials CSV at the end of
 * an import, and it deserves the same treatment as every server export: its
 * names and employee numbers come straight from an uploaded file, so they are
 * attacker-controllable, and the same row holds a temporary password.
 *
 * The rule below MIRRORS backend/src/utils/csv.ts exactly - same leaders, same
 * number exemption, same apostrophe - so a file generated here and a file
 * exported by the server cannot disagree about what counts as dangerous. If
 * one changes, change both.
 */

/**
 * Leading characters a spreadsheet treats as the start of a formula. Tab and
 * carriage return are included because they can be used to slip a formula past
 * a naive first-character check.
 */
const formulaLeaders = new Set(["=", "+", "-", "@", "\t", "\r"]);

/** A value we are willing to leave alone even though it may start with "-". */
const plainNumber = /^-?\d+(?:\.\d+)?$/;

/** Makes one piece of text safe to place in a spreadsheet cell, without quoting. */
export function neutralizeFormula(text: string): string {
  const firstMeaningful = text.trimStart().charAt(0);
  if (formulaLeaders.has(firstMeaningful) && !plainNumber.test(text)) {
    // A leading apostrophe is the spreadsheet convention for "this is text".
    return `'${text}`;
  }
  return text;
}

/**
 * One CSV field: neutralised FIRST, then RFC 4180 quoted. Quoting alone does
 * not make a cell safe - spreadsheets evaluate a quoted "=..." once the quotes
 * are stripped - so neutralisation happens before quoting, not instead of it.
 */
export function csvField(value: string): string {
  const safe = neutralizeFormula(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
