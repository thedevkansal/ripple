# Ripple — Plan

Email open/click tracking for people who send outreach from Gmail. Born for E-Summit speaker/sponsor outreach, built as a general product.

## How tracking works
- **Open pixel**: each tracked email carries a unique 1x1 GIF (`/t/o/<token>.gif`). Every fetch = one open event (timestamp, IP, user agent).
- **Click redirect**: links rewritten to `/t/c/<token>/<linkId>`, logged, then 302 to the real URL.
- **Per-recipient token**: each message/recipient gets its own token, so events map to a person.

### Known limits (surfaced in UI, not hidden)
- Apple Mail Privacy Protection prefetches images: false opens. Flag as `prefetch`.
- Gmail fetches via GoogleImageProxy: open timing works, IP/device hidden. Serve pixel with `no-store` so repeat opens register.
- Outlook / corporate clients often block images: unread != not opened.
- Sender's own opens (Sent folder) must be ignored: extension suppresses, server dedupes by sender session.
- Clicks and replies are the high-confidence signals.

## Two ways to send
1. **Web app campaigns**: user connects Gmail via Google OAuth (`gmail.send`). Upload CSV, write template with `{{name}}`/`{{org}}` merge fields, schedule. App injects pixel + rewrites links, sends via Gmail API from the user's own account. Throttled (default ~25/day/account, configurable, hard cap below Gmail limits).
2. **Chrome extension (MV3)**: works inside Gmail compose. Toggle "Track" per email; on send, injects pixel + rewrites links, registers the message with the API. Shows read receipts (ticks) in the Sent list.

## Stack
- Next.js (App Router) + TypeScript, Tailwind, shadcn/ui, Motion (animations), Recharts
- Postgres on Neon (free tier) + Prisma
- Auth.js (NextAuth) with Google provider; Gmail tokens encrypted at rest
- Vercel (free tier) hosting; cron for queued sends
- Monorepo: `apps/web`, `apps/extension`, `packages/shared`

## Data model (initial)
```
User        id, email, name, image
GmailAccount id, userId, email, encrypted refresh token, dailyLimit
Workspace   id, name  (team)        Member userId, workspaceId, role
Contact     id, workspaceId, email, name, org, tags[]
Campaign    id, workspaceId, name, tag, subject, bodyHtml, status, scheduledAt
Message     id, campaignId?, senderAccountId, contactId?, toEmail, subject, token, source(web|extension), status, sentAt
Link        id, messageId, url
Event       id, messageId, type(open|click), linkId?, ts, ip, userAgent, client, device, isProxy, isPrefetch
```

## Dashboard
- Overview: sent, unique opens, total opens, open rate, click rate, by tag (speaker/sponsor/…)
- Campaign table: per-recipient opens, first/last open, time-to-first-open, clicks, engagement score
- Recipient timeline: every event with intervals ("opened 3x: +2h, +1d")
- Charts: opens over time, hour x weekday heatmap, client split, link performance
- Smart lists: not opened after N days, opened 3+ times, clicked
- Reports: CSV / PDF export per campaign + cross-campaign summary

## Phases
1. Foundation: monorepo, Next.js app, Prisma schema, tracking endpoints, event classification
2. Brand + landing page (dark, glow, animated)
3. Auth + Gmail connect + workspaces/team invites
4. Campaign sending: CSV import, templates, queue + throttle
5. Dashboard + analytics
6. Chrome extension
7. Reports, polish, deploy, launch

## Google OAuth notes
- `gmail.send` is a *sensitive* scope: app runs in "Testing" mode (up to 100 listed test users) until Google verification. Fine for the team; verification needed before public launch.
- Reply detection would need `gmail.readonly`/`gmail.metadata` (*restricted*: requires a paid security assessment). Deferred.
