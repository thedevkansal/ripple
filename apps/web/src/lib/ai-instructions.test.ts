import { describe, expect, test } from "bun:test";
import { chatPrompt, parseChatAnswer } from "./ai-instructions";

describe("parseChatAnswer", () => {
  test("reads the plain shape", () => {
    expect(parseChatAnswer("SUBJECT: Hi {{first_name}}\nBODY:\nLine one\n\nLine two")).toEqual({
      subject: "Hi {{first_name}}",
      body: "Line one\n\nLine two",
    });
  });

  test("tolerates markdown bold labels, code fences and chatter around it", () => {
    const pasted = "Sure! Here it is:\n```\n**Subject:** Speak at E-Summit\n**Body:**\nHello there\n```\nHope this helps.";
    expect(parseChatAnswer(pasted)).toEqual({ subject: "Speak at E-Summit", body: "Hello there" });
  });

  test("keeps CRLF answers as LF and a body on the label line", () => {
    expect(parseChatAnswer("Subject: A\r\nBody: First line\r\nSecond")).toEqual({ subject: "A", body: "First line\nSecond" });
  });

  test("returns null when a part is missing", () => {
    expect(parseChatAnswer("Just some text")).toBeNull();
    expect(parseChatAnswer("SUBJECT: only a subject")).toBeNull();
    expect(parseChatAnswer("BODY:\nhi\nSUBJECT: late")).toBeNull();
  });
});

test("chatPrompt carries the draft, fields and answer shape", () => {
  const p = chatPrompt({ instruction: "Shorter", subject: "Hi", body: "Long", fields: ["company"] });
  expect(p).toContain("{{company}}");
  expect(p).toContain("<body>\nLong\n</body>");
  expect(p).toContain("SUBJECT: <the subject line>");
  expect(p).not.toContain("The summary is");
});
