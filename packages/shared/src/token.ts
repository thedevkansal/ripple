const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** 22 base62 chars ≈ 131 bits: unguessable, short enough for URLs. */
export const TOKEN_LENGTH = 22;

const TOKEN_RE = new RegExp(`^[0-9A-Za-z]{${TOKEN_LENGTH}}$`);

export function generateToken(length = TOKEN_LENGTH): string {
  let out = "";
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      // Reject bytes >= 248 (62 * 4) so every character is equally likely.
      if (b >= 248) continue;
      out += ALPHABET[b % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

export function isValidToken(value: string): boolean {
  return TOKEN_RE.test(value);
}
