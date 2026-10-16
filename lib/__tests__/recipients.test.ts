import { describe, expect, it } from "vitest";
import { equalAmount, isSendable, parseList } from "../recipients";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";

/**
 * The input here is whatever came out of a spreadsheet, and the failure mode that matters is a
 * list that pays out quietly differently from the one on screen.
 */
describe("parseList", () => {
  it("takes the separators a spreadsheet produces", () => {
    for (const sep of [",", "\t", ";", " ", "  ,  "]) {
      const list = parseList(`${A}${sep}1.5`);
      expect(list.problems, sep).toEqual([]);
      expect(list.rows[0].amount, sep).toBe(1_500_000_000_000_000_000n);
    }
  });

  it("sums the rows", () => {
    const list = parseList(`${A},1\n${B},2.5`);
    expect(list.rows).toHaveLength(2);
    expect(list.total).toBe(3_500_000_000_000_000_000n);
  });

  it("ignores blank lines and comments", () => {
    const list = parseList(`\n# payroll\n${A},1\n\n// note\n${B},2\n`);
    expect(list.rows).toHaveLength(2);
    expect(list.problems).toEqual([]);
  });

  // The important one: a malformed row must never be silently dropped, or the payout is quietly
  // shorter than the list on screen.
  it("reports a malformed row instead of skipping it", () => {
    const list = parseList(`${A},1\nnonsense\n${B},2`);
    expect(list.rows).toHaveLength(2);
    expect(list.problems).toHaveLength(1);
    expect(list.problems[0].line).toBe(2);
    expect(isSendable(list)).toBe(false);
  });

  it("names the line and the offending value", () => {
    const list = parseList(`${A},1\n0xnotanaddress,2`);
    expect(list.problems[0].line).toBe(2);
    expect(list.problems[0].message).toMatch(/not an address/);

    const bad = parseList(`${A},abc`);
    expect(bad.problems[0].message).toMatch(/not an amount/);
  });

  it("rejects a row with too few or too many values", () => {
    expect(parseList(`${A}`).problems[0].message).toMatch(/address and an amount/);
    expect(parseList(`${A},1,extra`).problems[0].message).toMatch(/two values/);
  });

  it("rejects amounts the chain would not take", () => {
    expect(parseList(`${A},0`).problems).toHaveLength(1);
    expect(parseList(`${A},-1`).problems).toHaveLength(1);
    expect(parseList(`${A},1e18`).problems).toHaveLength(1);
  });

  it("checksums addresses so two spellings are one recipient", () => {
    const list = parseList(`${A.toUpperCase().replace("0X", "0x")},1\n${A},2`);
    expect(list.duplicates).toHaveLength(1);
    // Both rows are still paid: a duplicate is legal, just worth flagging.
    expect(list.rows).toHaveLength(2);
  });

  it("flags a list longer than the contract accepts", () => {
    const lines = Array.from({ length: 501 }, (_, i) => `0x${String(i + 1).padStart(40, "0")},1`);
    const list = parseList(lines.join("\n"));
    expect(list.problems.some((p) => /at most 500/.test(p.message))).toBe(true);
    expect(isSendable(list)).toBe(false);
  });

  it("accepts exactly the maximum", () => {
    const lines = Array.from({ length: 500 }, (_, i) => `0x${String(i + 1).padStart(40, "0")},1`);
    expect(isSendable(parseList(lines.join("\n")))).toBe(true);
  });

  it("is not sendable when empty", () => {
    expect(isSendable(parseList(""))).toBe(false);
    expect(isSendable(parseList("   \n\n"))).toBe(false);
  });
});

describe("equalAmount", () => {
  // scatterEqual takes one amount instead of an array, which is calldata the caller pays for.
  it("spots a list where every amount matches", () => {
    const list = parseList(`${A},1\n${B},1`);
    expect(equalAmount(list.rows)).toBe(1_000_000_000_000_000_000n);
  });

  it("returns null when they differ", () => {
    const list = parseList(`${A},1\n${B},2`);
    expect(equalAmount(list.rows)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(equalAmount([])).toBeNull();
  });
});
