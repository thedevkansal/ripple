import { normalizeKey } from "@ripple/shared";
import Papa from "papaparse";

export interface RecipientRow {
  email: string;
  name?: string;
  org?: string;
  /** Other addresses of the same person, CC'd on their email. */
  cc?: string[];
  fields?: Record<string, string>;
}

export type ColumnRole = "email" | "cc" | "name" | "first" | "last" | "org" | "field";

export interface ParsedCsv {
  rows: RecipientRow[];
  invalid: { line: number; value: string }[];
  duplicates: number;
  /** How each CSV column was understood. */
  columns: { header: string; key: string; role: ColumnRole }[];
  /** Merge fields this file provides, in column order. */
  mergeFields: string[];
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLES: Record<string, Exclude<ColumnRole, "cc" | "field">> = {
  email: "email",
  e_mail: "email",
  email_address: "email",
  email_id: "email",
  mail: "email",
  name: "name",
  full_name: "name",
  fullname: "name",
  first_name: "first",
  firstname: "first",
  last_name: "last",
  lastname: "last",
  surname: "last",
  company: "org",
  org: "org",
  organization: "org",
  organisation: "org",
};

/** "Email 2", "alt email", "secondary_email", "CC"... */
const looksLikeEmailColumn = (key: string) => key === "cc" || /(^|_)e?_?mails?(_|$|\d)|^mail\d+$/.test(key);

const MERGE_FIELD: Partial<Record<ColumnRole, string>> = {
  email: "email",
  name: "name",
  first: "first_name",
  last: "last_name",
  org: "company",
};

const splitEmails = (value: string) =>
  value
    .split(/[;,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => EMAIL_RE.test(e));

function classify(headers: string[]): ParsedCsv["columns"] {
  const keyed = headers.map((header) => ({ header, key: normalizeKey(header) }));
  // The primary address: a column named like "email", else the first email-looking column.
  const primary =
    keyed.find((c) => ROLES[c.key] === "email") ?? keyed.find((c) => c.key !== "cc" && looksLikeEmailColumn(c.key));
  return keyed.map(({ header, key }) => {
    let role: ColumnRole;
    if (primary && header === primary.header) role = "email";
    else if (looksLikeEmailColumn(key)) role = "cc";
    else role = ROLES[key] ?? "field";
    return { header, key, role };
  });
}

export function parseRecipientsCsv(text: string): ParsedCsv {
  const { data, meta } = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const columns = classify(meta.fields ?? []);
  const emailHeader = columns.find((c) => c.role === "email")?.header;

  const rows: RecipientRow[] = [];
  const invalid: ParsedCsv["invalid"] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  data.forEach((record, i) => {
    const email = (emailHeader ? record[emailHeader] : "")?.trim().toLowerCase() ?? "";
    if (!EMAIL_RE.test(email)) {
      invalid.push({ line: i + 2, value: email || "(empty)" });
      return;
    }
    if (seen.has(email)) {
      duplicates++;
      return;
    }
    seen.add(email);

    let name = "";
    let first = "";
    let last = "";
    let org = "";
    const cc = new Set<string>();
    const fields: Record<string, string> = {};
    for (const { header, key, role } of columns) {
      const value = record[header]?.trim() ?? "";
      if (!value) continue;
      switch (role) {
        case "email":
          break;
        case "cc":
          for (const e of splitEmails(value)) if (e !== email) cc.add(e);
          break;
        case "name":
          name = value;
          break;
        case "first":
          first = value;
          break;
        case "last":
          last = value;
          break;
        case "org":
          org = value;
          break;
        default:
          fields[key] = value;
      }
    }
    rows.push({
      email,
      name: name || [first, last].filter(Boolean).join(" ") || undefined,
      org: org || undefined,
      cc: cc.size ? [...cc] : undefined,
      fields: Object.keys(fields).length ? fields : undefined,
    });
  });

  const mergeFields = [
    ...new Set(columns.map((c) => (c.role === "field" ? c.key : MERGE_FIELD[c.role])).filter((f): f is string => !!f)),
  ];

  return { rows, invalid, duplicates, columns, mergeFields };
}
