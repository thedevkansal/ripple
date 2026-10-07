import { normalizeKey } from "@ripple/shared";
import Papa from "papaparse";

export interface RecipientRow {
  email: string;
  name?: string;
  org?: string;
  tags?: string[];
  fields?: Record<string, string>;
}

export interface ParsedCsv {
  rows: RecipientRow[];
  invalid: { line: number; value: string }[];
  duplicates: number;
  /** How each CSV column was understood. */
  columns: { header: string; key: string; role: "email" | "name" | "org" | "tags" | "field" }[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLES: Record<string, "email" | "name" | "first" | "last" | "org" | "tags"> = {
  email: "email",
  e_mail: "email",
  email_address: "email",
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
  tags: "tags",
  tag: "tags",
  category: "tags",
  type: "tags",
};

export function parseRecipientsCsv(text: string): ParsedCsv {
  const { data, meta } = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const headers = meta.fields ?? [];
  const roleOf = (h: string) => ROLES[normalizeKey(h)];
  const emailHeader = headers.find((h) => roleOf(h) === "email");

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
    const tags: string[] = [];
    const fields: Record<string, string> = {};
    for (const h of headers) {
      const value = record[h]?.trim() ?? "";
      if (!value) continue;
      switch (roleOf(h)) {
        case "email":
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
        case "tags":
          tags.push(...value.split(/[;,|]/).map((t) => t.trim().toLowerCase()).filter(Boolean));
          break;
        default:
          fields[normalizeKey(h)] = value;
      }
    }
    rows.push({
      email,
      name: name || [first, last].filter(Boolean).join(" ") || undefined,
      org: org || undefined,
      tags: tags.length ? [...new Set(tags)] : undefined,
      fields: Object.keys(fields).length ? fields : undefined,
    });
  });

  const columns = headers.map((header) => {
    const role = roleOf(header);
    return {
      header,
      key: normalizeKey(header),
      role:
        role === "first" || role === "last"
          ? ("name" as const)
          : role === "email" || role === "name" || role === "org" || role === "tags"
            ? role
            : ("field" as const),
    };
  });

  return { rows, invalid, duplicates, columns };
}
