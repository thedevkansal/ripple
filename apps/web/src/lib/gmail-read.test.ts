import { describe, expect, test } from "bun:test";
import { bodyText, htmlToText, parseAddress, splitQuoted, toMailItem } from "./gmail-read";

const b64 = (s: string) => Buffer.from(s).toString("base64url");

describe("parseAddress", () => {
  test("named, quoted and bare addresses", () => {
    expect(parseAddress('"Priya Sharma" <Priya@X.com>')).toEqual({ email: "priya@x.com", name: "Priya Sharma" });
    expect(parseAddress("Rahul <r@y.in>")).toEqual({ email: "r@y.in", name: "Rahul" });
    expect(parseAddress("solo@z.com")).toEqual({ email: "solo@z.com", name: null });
  });
});

describe("bodyText", () => {
  test("prefers the text part inside multipart/alternative", () => {
    const part = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            { mimeType: "text/plain", body: { data: b64("Sounds good!\r\nThanks") } },
            { mimeType: "text/html", body: { data: b64("<p>Sounds good!</p>") } },
          ],
        },
        { mimeType: "application/pdf", body: { size: 10 } },
      ],
    };
    expect(bodyText(part)).toBe("Sounds good!\nThanks");
  });

  test("flattens HTML when there's no text part", () => {
    expect(bodyText({ mimeType: "text/html", body: { data: b64("<div>Hi&nbsp;there<br>Yes &amp; no</div>") } })).toBe(
      "Hi there\nYes & no",
    );
  });

  test("htmlToText drops styles and scripts", () => {
    expect(htmlToText("<style>p{}</style><p>A</p><script>x</script><p>B</p>")).toBe("A\nB");
  });
});

describe("splitQuoted", () => {
  test("Gmail-style quote on one or two lines", () => {
    expect(splitQuoted("Yes, Tuesday works.\n\nOn Mon, 12 Oct 2026 at 10:00, Dev <d@g.com> wrote:\n> Hi")).toEqual({
      main: "Yes, Tuesday works.",
      quoted: "On Mon, 12 Oct 2026 at 10:00, Dev <d@g.com> wrote:\n> Hi",
    });
    expect(splitQuoted("Sure.\nOn Mon, 12 Oct 2026 at 10:00, Dev Kansal\n<d@g.com> wrote:\n> Hi").main).toBe("Sure.");
  });

  test("Outlook-style header block", () => {
    expect(splitQuoted("Thanks!\n\nFrom: Dev <d@g.com>\nSent: Monday\nSubject: Hi").main).toBe("Thanks!");
  });

  test("a sentence starting with From: isn't a quote", () => {
    expect(splitQuoted("Hi,\nFrom: our side, yes.\nThanks").quoted).toBe("");
  });

  test("no quote leaves text alone", () => {
    expect(splitQuoted("Just this")).toEqual({ main: "Just this", quoted: "" });
  });
});

test("toMailItem reads headers and marks the account's own mail", () => {
  const item = toMailItem(
    {
      id: "m1",
      threadId: "t1",
      internalDate: "1791840000000",
      snippet: "I&#39;d love to",
      labelIds: ["INBOX"],
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "From", value: "Priya <p@x.com>" },
          { name: "Subject", value: "Re: Speak at E-Summit" },
          { name: "Message-ID", value: "<abc@x.com>" },
          { name: "References", value: "<one@g.com> <two@g.com>" },
        ],
        body: { data: b64("I'd love to") },
      },
    },
    "Dev@Gmail.com",
  );
  expect(item).toMatchObject({
    from: { email: "p@x.com", name: "Priya" },
    subject: "Re: Speak at E-Summit",
    rfcId: "<abc@x.com>",
    references: ["<one@g.com>", "<two@g.com>"],
    snippet: "I'd love to",
    text: "I'd love to",
    fromMe: false,
  });
  expect(item.date.getTime()).toBe(1791840000000);
});
