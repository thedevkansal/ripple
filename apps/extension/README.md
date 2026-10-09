# Ripple Chrome extension

Tracks opens and clicks on emails you send from Gmail, and shows read status inside Gmail.

## Build

```bash
bun run build                 # for https://ripplemail.vercel.app
bun run build:dev             # for a local server on http://localhost:3000
```

Output goes to `dist/`.

## Install (unpacked)

1. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose `apps/extension/dist`.
4. The Connect page opens. Click **Connect extension**.

## How it works

- `gmail.ts` adds a Ripple switch next to Gmail's Send button. On Send it registers the email, rewrites
  links to tracked ones and inserts the pixel, then lets Gmail send. If Ripple doesn't answer within
  4 seconds the email goes out untracked.
- When you view your own sent email, it reports a self-view so your views never count as opens, and it
  draws a read badge. In the Sent folder it adds read ticks.
- `connect.ts` runs only on Ripple's Connect page and stores the token it hands over.
- All Gmail selectors live in `gmail-dom.ts`.
