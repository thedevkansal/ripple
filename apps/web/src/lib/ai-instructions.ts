/**
 * What Ripple tells an AI about its email format. Shared by the API calls and the "use ChatGPT or
 * Claude" flow, so it must stay safe to import in the browser.
 */

export type EditInput = { instruction: string; subject: string; body: string; fields: string[] };

/** How Ripple's plain-text email format works, for any prompt that writes email text. */
export const FORMAT_RULES = `The body is plain text that Ripple turns into HTML:
- A blank line starts a new paragraph. A single line break stays a line break.
- [text](https://example.com) makes a link. Bare URLs also become links.
- **text** makes bold. No other markdown, HTML, headings or bullet symbols other than "- ".
- Merge fields look like {{field}} or {{field|fallback}} and are filled per recipient. Use only the fields listed as available. Give a fallback when a field may be empty in a greeting, as in {{first_name|there}}. Never invent field names or put placeholders like [Name] in square brackets.`;

const EDIT_RULES = `You edit outreach emails inside Ripple, an email tool. The user is writing one email that is sent to many recipients, and gives you an instruction about it.

Return the complete revised subject and body, not a diff. If the draft is empty, write a new email from the instruction.

${FORMAT_RULES}

Keep every link and merge field the user already has unless the instruction says to change them. Keep the user's facts, names, numbers and dates; never make up new ones. If a fact is missing, write around it instead of guessing.
Write like a person, not a marketing template: short sentences, a clear ask, no filler openers like "I hope this email finds you well".
Only change what the instruction asks for. If it asks for one thing, leave the rest as it was.`;

export const EDIT_SYSTEM = `${EDIT_RULES}

The summary is one plain sentence, under 20 words, addressed to the user.`;

export function editMessage(input: EditInput) {
  const fields = input.fields.length
    ? input.fields.map((f) => `{{${f}}}`).join(", ")
    : "none yet (no recipient list). Only {{first_name|there}} is safe to use.";
  return [
    `Available merge fields: ${fields}`,
    "",
    `<subject>${input.subject}</subject>`,
    `<body>\n${input.body}\n</body>`,
    "",
    `Instruction: ${input.instruction}`,
  ].join("\n");
}

/** One message to paste into ChatGPT or Claude, asking for an answer Ripple can read back. */
export function chatPrompt(input: EditInput) {
  return [
    EDIT_RULES,
    "",
    editMessage(input),
    "",
    "Reply with only the email, in exactly this shape and nothing before or after it:",
    "SUBJECT: <the subject line>",
    "BODY:",
    "<the body>",
  ].join("\n");
}

/** Reads "SUBJECT: … BODY: …" back out of a pasted chat answer. */
export function parseChatAnswer(text: string): { subject: string; body: string } | null {
  const normalized = text.replace(/\r\n/g, "\n");
  // Chat apps often wrap the answer in a code block with chatter around it; keep only the block.
  const fenced = /```[a-z]*\n([\s\S]*?)\n?```/i.exec(normalized);
  const clean = (fenced ? fenced[1] : normalized).replace(/\*\*(subject|body)\s*:?\s*\*\*\s*:?/gi, "$1:").trim();
  const subject = /^[ \t]*subject[ \t]*:[ \t]*(.+)$/im.exec(clean);
  const bodyStart = /^[ \t]*body[ \t]*:[ \t]*/im.exec(clean);
  if (!subject || !bodyStart || bodyStart.index < subject.index) return null;
  const body = clean.slice(bodyStart.index + bodyStart[0].length).trim();
  if (!body) return null;
  return { subject: subject[1].trim(), body };
}
