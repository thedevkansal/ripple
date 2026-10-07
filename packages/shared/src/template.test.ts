import { describe, expect, test } from "bun:test";
import {
  contactVars,
  listMergeFields,
  normalizeKey,
  renderTemplate,
  textToHtml,
  textToPlain,
} from "./template";
import { instrumentHtml } from "./instrument";

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

describe("file cards", () => {
  const files = [{ name: "Sponsor deck <2026>.pdf", size: 2_400_000, url: "https://x.blob.vercel-storage.com/a.pdf?v=1&d=1" }];

  test("html cards link each file and escape names", () => {
    const html = textToHtml("Hi", { files });
    expect(html).toContain("Sponsor deck &lt;2026&gt;.pdf");
    expect(html).toContain("2.3 MB");
    expect(html.match(/href="https:\/\/x\.blob\.vercel-storage\.com\/a\.pdf\?v=1&amp;d=1"/g)).toHaveLength(2);
  });

  test("plain text lists files", () => {
    expect(textToPlain("Hi", { files })).toBe(
      "Hi\n\nSponsor deck <2026>.pdf (2.3 MB): https://x.blob.vercel-storage.com/a.pdf?v=1&d=1",
    );
  });

  test("cards' links get click tracking", () => {
    const { links } = instrumentHtml(textToHtml("Hi", { files }), { baseUrl: "https://r.app", token: "T" });
    expect(links).toEqual([{ index: 0, url: files[0].url }]);
  });
});

describe("auto-linking", () => {
  const links = (text: string) => [...textToHtml(text).matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

  test("links bare domains and www. so Gmail can't bypass tracking", () => {
    expect(links("Visit esummit.in\nor www.iitr.ac.in/events.\nhttps://x.com/home")).toEqual([
      "https://esummit.in",
      "https://www.iitr.ac.in/events",
      "https://x.com/home",
    ]);
  });

  test("leaves emails, abbreviations, file names and times alone", () => {
    expect(
      links("Mail devkansal24024@gmail.com. B.Tech. CSE, 1993. See brochure.pdf, e.g. at 6:00 PM. Thomso'26."),
    ).toEqual([]);
  });

  test("does not double-link markdown links", () => {
    expect(links("[site](https://esummit.in) and esummit.in")).toEqual(["https://esummit.in", "https://esummit.in"]);
  });
});
