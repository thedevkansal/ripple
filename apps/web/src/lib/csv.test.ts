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

    const { rows, invalid, duplicates, columns, mergeFields } = parseRecipientsCsv(csv);

    expect(rows).toEqual([
      {
        email: "priya@razorpay.com",
        name: "Priya Sharma",
        org: "Razorpay",
        tags: ["speaker", "fintech"],
        cc: undefined,
        fields: { talk_topic: "Payments at scale" },
      },
      { email: "arjun@zerodha.com", name: "Arjun", org: "Zerodha", tags: ["sponsor"], cc: undefined, fields: undefined },
    ]);
    expect(invalid).toEqual([{ line: 3, value: "not-an-email" }]);
    expect(duplicates).toBe(1);
    expect(columns.map((c) => c.role)).toEqual(["email", "first", "last", "org", "tags", "field"]);
    expect(mergeFields).toEqual(["email", "first_name", "last_name", "company", "talk_topic"]);
  });

  test("extra email columns become CC for that person", () => {
    const csv = [
      "Name,Email 1,Email 2,Alt Email,CC",
      "Priya,priya@x.com,priya.work@y.com,priya@x.com,pa@x.com; boss@x.com",
    ].join("\n");
    const { rows, columns, mergeFields } = parseRecipientsCsv(csv);
    expect(columns.map((c) => c.role)).toEqual(["name", "email", "cc", "cc", "cc"]);
    expect(rows[0]).toMatchObject({
      email: "priya@x.com",
      cc: ["priya.work@y.com", "pa@x.com", "boss@x.com"],
    });
    expect(mergeFields).toEqual(["name", "email"]);
  });

  test("only the columns present become merge fields", () => {
    expect(parseRecipientsCsv("email,name\na@b.co,A").mergeFields).toEqual(["email", "name"]);
  });

  test("reports no email column", () => {
    const { columns, rows } = parseRecipientsCsv("name,company\nA,B");
    expect(columns.some((c) => c.role === "email")).toBe(false);
    expect(rows).toHaveLength(0);
  });
});
