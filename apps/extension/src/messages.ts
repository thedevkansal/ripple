/** Requests content scripts and the popup send to the background worker. */
export type Request =
  | { type: "connect"; token: string }
  | { type: "disconnect" }
  | { type: "me" }
  | { type: "register"; to: string[]; cc: string[]; subject: string; links: string[] }
  | { type: "selfView"; tokens: string[] }
  | { type: "status"; tokens: string[]; recent?: boolean };

export interface Registered {
  token: string;
  pixelUrl: string;
  links: { url: string; trackedUrl: string }[];
}

export interface Status {
  token: string;
  to: string[];
  subject: string;
  sentAt: string;
  opens: number;
  clicks: number;
  lastOpenAt: string | null;
  maybe: boolean;
}

export type Response<T> = { ok: true; data: T } | { ok: false; error: string; unauthorized?: boolean };

export function send<T>(req: Request): Promise<Response<T>> {
  return chrome.runtime.sendMessage(req);
}

/** Set at build time from RIPPLE_URL. */
declare const __RIPPLE_URL__: string;
export const RIPPLE_URL: string = __RIPPLE_URL__;

export const SETTINGS = { trackByDefault: "trackByDefault" } as const;
