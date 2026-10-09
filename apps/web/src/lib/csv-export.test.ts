import { describe, expect, test } from "bun:test";
import { toCsv } from "./csv-export";

describe("toCsv", () => {
  test("quotes commas, quotes and newlines; neutralises formulas", () => {
    expect(
      toCsv([
        ["name", "note"],
        ["Sharma, Priya", 'said "yes"'],
        ["=HYPERLINK(\"x\")", "line1\nline2"],
        [null, 3],
      ]),
    ).toBe('name,note\r\n"Sharma, Priya","said ""yes"""\r\n"\'=HYPERLINK(""x"")","line1\nline2"\r\n,3\r\n');
  });
});
