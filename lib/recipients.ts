import { getAddress, isAddress, type Address } from "viem";
import { parseNativeAmount } from "@/lib/botchain/amount";

/**
 * Turning a pasted list into a transaction.
 *
 * This is the part of Scatter most likely to go wrong, because the input is whatever came out of
 * a spreadsheet. Every problem is reported against the line it came from: a transaction that
 * fails on row 42 with no line number is a list a user has to re-check by hand.
 *
 * Nothing is silently dropped or corrected. A blank line is ignored because it carries no intent,
 * but a malformed one is an error — the alternative is paying out a list that is quietly shorter
 * than the one on screen.
 */

export const MAX_RECIPIENTS = 500;

export type Row = { line: number; address: Address; amount: bigint; raw: string };

export type RowProblem = { line: number; raw: string; message: string };

export type ParsedList = {
  rows: Row[];
  problems: RowProblem[];
  total: bigint;
  /** Addresses appearing more than once, which is legal but worth pointing out. */
  duplicates: Address[];
};

/**
 * Accepts the shapes a spreadsheet actually produces: comma, tab, semicolon or whitespace
 * separated, with or without a trailing comment.
 */
const SEPARATOR = /[,;\t ]+/;

export function parseList(input: string): ParsedList {
  const rows: Row[] = [];
  const problems: RowProblem[] = [];
  const seen = new Map<string, number>();

  const lines = input.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = i + 1;
    const raw = lines[i].trim();

    // A blank line carries no intent. A malformed one does, and dropping it would pay out a list
    // shorter than the one on screen.
    if (raw === "") continue;
    if (raw.startsWith("#") || raw.startsWith("//")) continue;

    const parts = raw.split(SEPARATOR).filter(Boolean);
    if (parts.length < 2) {
      problems.push({ line, raw, message: "Needs an address and an amount." });
      continue;
    }
    if (parts.length > 2) {
      problems.push({ line, raw, message: "Expected two values — an address and an amount." });
      continue;
    }

    const [addressPart, amountPart] = parts;

    if (!isAddress(addressPart)) {
      problems.push({ line, raw, message: `"${addressPart}" is not an address.` });
      continue;
    }

    const amount = parseNativeAmount(amountPart);
    if (amount === null) {
      problems.push({ line, raw, message: `"${amountPart}" is not an amount this app will send.` });
      continue;
    }

    // Checksummed, so two spellings of the same address are recognised as one.
    const address = getAddress(addressPart);
    const previous = seen.get(address.toLowerCase());
    seen.set(address.toLowerCase(), (previous ?? 0) + 1);

    rows.push({ line, address, amount, raw });
  }

  if (rows.length > MAX_RECIPIENTS) {
    problems.push({
      line: rows[MAX_RECIPIENTS]?.line ?? 0,
      raw: "",
      message: `The contract takes at most ${MAX_RECIPIENTS} recipients; this list has ${rows.length}.`,
    });
  }

  const duplicates = [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([lower]) => rows.find((r) => r.address.toLowerCase() === lower)!.address);

  return {
    rows,
    problems,
    total: rows.reduce((sum, row) => sum + row.amount, 0n),
    duplicates,
  };
}

/** A list is sendable when it has rows and nothing wrong with any of them. */
export function isSendable(list: ParsedList): boolean {
  return list.rows.length > 0 && list.problems.length === 0;
}

/**
 * Every amount in the list, or null if they are not all the same.
 *
 * `scatterEqual` takes one amount instead of an array, which is calldata the caller pays for at
 * 16 gas a byte. Spotting the case automatically means a user never has to know the cheaper
 * function exists.
 */
export function equalAmount(rows: Row[]): bigint | null {
  if (rows.length === 0) return null;
  const first = rows[0].amount;
  return rows.every((row) => row.amount === first) ? first : null;
}
