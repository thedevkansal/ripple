import { describe, expect, test } from "bun:test";
import { parseRecipientsCsv } from "./csv";

describe("parseRecipientsCsv", () => {
  test("maps known columns, keeps extras as fields, skips bad and duplicate rows", () => {
    const csv = [
      "Email Address,First Name,Last Name,Company,Category,Talk Topic",
      "Priya@Razorpay.com,Priya,Sharma,Razorpay,Speaker; Fintech,Payments at scale",
      "not-an-email,Bad,Row,X,,",
      "priya@razorpay.com,Dup,Row,,,",
      "arjun@zerodha.com,Arjun,,Zerodha,sponsor,",
      ",,,,,",
    ].join("\n");

    const { rows, invalid, duplicates, columns } = parseRecipientsCsv(csv);

    expect(rows).toEqual([
      {
        email: "priya@razorpay.com",
        name: "Priya Sharma",
        org: "Razorpay",
        tags: ["speaker", "fintech"],
        fields: { talk_topic: "Payments at scale" },
      },
      { email: "arjun@zerodha.com", name: "Arjun", org: "Zerodha", tags: ["sponsor"], fields: undefined },
    ]);
    expect(invalid).toEqual([{ line: 3, value: "not-an-email" }]);
    expect(duplicates).toBe(1);
    expect(columns.map((c) => c.role)).toEqual(["email", "name", "name", "org", "tags", "field"]);
  });

  test("reports no email column", () => {
    const { columns, rows } = parseRecipientsCsv("name,company\nA,B");
    expect(columns.some((c) => c.role === "email")).toBe(false);
    expect(rows).toHaveLength(0);
  });
});
