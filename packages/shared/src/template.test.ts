import { describe, expect, test } from "bun:test";
import {
  contactVars,
  listMergeFields,
  normalizeKey,
  renderTemplate,
  textToHtml,
  textToPlain,
} from "./template";

describe("renderTemplate", () => {
  test("fills fields, applies fallbacks, reports missing", () => {
    const { output, missing } = renderTemplate("Hi {{ first_name | there }}, {{Company}} x {{role}}!", {
      company: "Zerodha",
    });
    expect(output).toBe("Hi there, Zerodha x !");
    expect(missing).toEqual(["role"]);
  });

  test("normalizes keys", () => {
    expect(normalizeKey("First Name")).toBe("first_name");
    expect(normalizeKey("firstName")).toBe("first_name");
    expect(normalizeKey("talk-topic")).toBe("talk_topic");
    expect(listMergeFields("{{a}} {{ First Name|x }} {{a}}")).toEqual(["a", "first_name"]);
  });
});

describe("contactVars", () => {
  test("derives name parts, company alias, custom fields", () => {
    const v = contactVars({
      email: "p@x.com",
      name: "Priya Sharma Rao",
      org: "Razorpay",
      fields: { "Talk Topic": "Fintech", empty: "" },
    });
    expect(v).toMatchObject({
      first_name: "Priya",
      last_name: "Sharma Rao",
      company: "Razorpay",
      talk_topic: "Fintech",
    });
    expect(v.empty).toBeUndefined();
  });
});

describe("textToHtml", () => {
  test("paragraphs, links, bold, escaping", () => {
    const html = textToHtml(
      "Hi <Priya>,\nSee [the brief](https://e.in/brief?a=1&b=2).\n\nDeck: https://e.in/deck. **Thanks**",
    );
    expect(html).toContain("Hi &lt;Priya&gt;,<br>See ");
    expect(html).toContain('<a href="https://e.in/brief?a=1&amp;b=2" style="color:#1a73e8">the brief</a>');
    expect(html).toContain('<a href="https://e.in/deck" style="color:#1a73e8">https://e.in/deck</a>.');
    expect(html).toContain("<strong>Thanks</strong>");
    expect(html.match(/<p /g)).toHaveLength(2);
  });

  test("plain text alternative", () => {
    expect(textToPlain("See [brief](https://e.in) **now**")).toBe("See brief (https://e.in) now");
  });
});
