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

// ─── Personal lines ──────────────────────────────────────────────────

export type PersonalInput = {
  /** What the user wants each line to do; may be empty. */
  brief: string;
  subject: string;
  body: string;
  recipient: { email: string; name?: string; org?: string; fields?: Record<string, string> };
  /** Whether the model may search the web about the recipient first. */
  research: boolean;
};

export const PERSONAL_SYSTEM = `You write one personal opening line for an outreach email sent with Ripple. The same email goes to many people; your line is the only part written for this one person, and it is placed right after the greeting.

Rules:
- One or two sentences, under 40 words. No greeting, no sign-off, no quotes around it, no merge fields, no placeholders.
- Make it specific to this person: their role, company, work or something they did. Connect it to why the email is relevant to them.
- Use only facts from the recipient details or, when web search is allowed, from what you found. Never invent achievements, numbers, news or quotes. If you know little, write a sincere line about their company or role instead of guessing.
- Match the email's language and tone. Write like a person, not a marketer: no flattery, no "I hope this finds you well", no "I came across your profile".
- Reply with the line only, nothing else.`;

export function personalMessage(input: PersonalInput) {
  const details = Object.entries({
    email: input.recipient.email,
    name: input.recipient.name,
    company: input.recipient.org,
    ...input.recipient.fields,
  })
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  return [
    `<email_subject>${input.subject}</email_subject>`,
    `<email_body>\n${input.body}\n</email_body>`,
    "",
    `Recipient details:\n${details}`,
    "",
    ...(input.brief.trim() ? [`What the line should do: ${input.brief.trim()}`] : []),
    input.research
      ? "You may search the web for this person or their company first. Prefer recent, verifiable facts, and leave out anything you aren't sure is about this exact person."
      : "Don't use outside knowledge about this person; use only the details above.",
  ].join("\n");
}

/** Tidies a model's answer into a single clean line. */
export function cleanPersonalLine(text: string) {
  return text
    .replace(/\[\d+\]|【[^】]*】/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["“'‘]+|["”'’]+$/g, "")
    .trim()
    .slice(0, 600);
}

// ─── Replies ─────────────────────────────────────────────────────────

export type ReplyInput = {
  /** The user's own name, to sign as. */
  senderName: string;
  /** The conversation so far, oldest first. */
  thread: { from: string; date: string; text: string; fromMe: boolean }[];
  /** What the user wants to say; may be empty. */
  instruction: string;
  /** Text the user already typed, to improve rather than replace. */
  draft: string;
};

export const REPLY_SYSTEM = `You draft email replies for the user inside Ripple. The user sent an outreach email and the other person replied; you write the user's next message in that conversation.

- Answer what the other person actually said: their questions, dates, conditions and tone.
- Follow the user's instruction when there is one. If they already started a draft, improve it and keep their points.
- Never invent facts, dates, prices, links or commitments the user didn't give. If something needed is missing, leave a short placeholder in square brackets like [time] for the user to fill in.
- Write plain text: short paragraphs, no subject line, no markdown headings. Match the other person's formality and language.
- Start with a natural greeting using their first name when known, and end with a short sign-off and the user's first name.
- Reply with the email text only.`;

export function replyMessage(input: ReplyInput) {
  const thread = input.thread
    .map((m) => `<message from="${m.fromMe ? `${input.senderName} (the user)` : m.from}" date="${m.date}">\n${m.text}\n</message>`)
    .join("\n\n");
  return [
    `The user is ${input.senderName}.`,
    "",
    `Conversation, oldest first:\n${thread}`,
    "",
    input.instruction.trim() ? `What the user wants to say: ${input.instruction.trim()}` : "Write the most helpful next reply.",
    ...(input.draft.trim() ? ["", `The user's draft so far:\n${input.draft.trim()}`] : []),
  ].join("\n");
}
