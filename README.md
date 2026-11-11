# SecondBrain

A calm, local-first personal knowledge workspace for notes, ideas, meeting notes, learning material, code snippets and bookmarks.

## Features
- Fast capture with `Ctrl/Cmd + N`; focus search with `Ctrl/Cmd + K`
- Markdown editor with safe preview, tags and autosave
- Six note types, pin/archive/trash and restore
- Local full-text filtering across title, body, tags and URL
- JSON backup export and validated merge import
- Dark/light/system appearance; installable offline app shell
- IndexedDB storage through Dexie; no account, cloud sync, analytics or AI API

## Privacy and storage
All content is stored in this browser profile's IndexedDB. It is not encrypted, synced, or uploaded. Clearing browser data or switching devices can remove access. Export backups regularly. Do not store passwords, OTPs, recovery codes or identity scans.

Markdown preview disables raw HTML and sanitizes rendered output. External source URLs are restricted to HTTP/HTTPS. Saved code is never executed.

## Development
Requires Node.js 20+.

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

## Deployment
Deploys to Cloudflare Pages from `main` with build command `npm run build` and output directory `dist`. No environment variables are required. The Pages project is named `secondbrain` and uses `secondbrain-dbs.pages.dev`.

## Import/export
Use Settings to export a versioned JSON backup or merge a validated backup. Keep a separate copy of backups outside this browser.

## Limitations
V1 does not include cloud sync, accounts, collaboration, semantic search, automatic bookmark extraction, native mobile apps, or encrypted-vault guarantees.
