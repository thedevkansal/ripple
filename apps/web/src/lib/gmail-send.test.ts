import { describe, expect, test } from "bun:test";
import { buildMime } from "./gmail-send";

const decodePart = (mime: string, type: string) => {
  const part = mime.split(`Content-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`)[1];
  return Buffer.from(part.split("\r\n--")[0].replace(/\r\n/g, ""), "base64").toString("utf8");
};

describe("buildMime", () => {
  const mime = buildMime({
    from: { email: "dev@gmail.com", name: 'Dev "K"' },
    to: { email: "priya@x.com", name: "Priyā Sharma" },
    subject: "Speaking at E-Summit '26? 🎤\r\nBcc: evil@x.com",
    html: "<p>Hi Priyā</p>",
    text: "Hi Priyā",
  });

  test("headers are encoded and cannot be injected", () => {
    expect(mime).toContain('From: "Dev \\"K\\"" <dev@gmail.com>');
    expect(mime).toContain(`To: =?UTF-8?B?${Buffer.from("Priyā Sharma").toString("base64")}?= <priya@x.com>`);
    expect(mime).not.toMatch(/^Bcc:/m);
    const subjectLine = mime.split("\r\n").find((l) => l.startsWith("Subject: "))!;
    const encoded = subjectLine.match(/=\?UTF-8\?B\?(.+)\?=/)![1];
    expect(Buffer.from(encoded, "base64").toString()).toBe("Speaking at E-Summit '26? 🎤 Bcc: evil@x.com");
  });

  test("has text and html parts", () => {
    expect(mime).toMatch(/Content-Type: multipart\/alternative; boundary="rpl_[0-9a-f]{24}"/);
    expect(decodePart(mime, "text/plain")).toBe("Hi Priyā");
    expect(decodePart(mime, "text/html")).toBe("<p>Hi Priyā</p>");
  });
});
