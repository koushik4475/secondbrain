# SecondBrain

![SecondBrain workspace](docs/screenshots/workspace.png)

SecondBrain is a local-first personal knowledge workspace for notes, ideas, meeting notes, learning material, code snippets and bookmarks.

## V1 capabilities

- Quick capture with **Ctrl/Cmd + N** and a command palette with **Ctrl/Cmd + K**.
- Markdown editor with sanitized preview, internal `[[Note title]]` links, backlinks and IndexedDB-backed autosave.
- Six note types: note, idea, meeting, learning, code and bookmark.
- Tags with cross-note management; collections can be created, renamed, filtered and deleted without deleting their notes.
- Offline full-text search across title, body, tags, bookmark summary and URL, plus type, tag, collection, pinned and updated-date filters.
- Pin, archive, restore and trash flows; permanent deletion requires confirmation.
- CodeMirror language highlighting for JavaScript, TypeScript, Python, JSON and Bash, with a read-only preview and copy action. Saved code is never executed.
- Bookmarks with HTTP/HTTPS validation and an optional manually written summary. No automatic page scraping.
- Individual Markdown export, Markdown archive export and a versioned JSON backup.
- JSON import validates the complete file before showing a preview. Merge keeps existing data and imports ID collisions as separate copies; replace is an explicit destructive action.
- System/light/dark themes, editor text size, keyboard help and confirmed clear-all-data action.
- Installable PWA shell; application assets are precached for offline use after a successful first load.

## Storage and privacy

Notes, tags, collections and preferences are stored in this browser profile's IndexedDB. They are not encrypted, synced, uploaded or backed by an account. Clearing site data, using private browsing, or changing devices can remove access. Export backups regularly and store a copy outside the browser. Do not store passwords, OTPs, recovery codes or identity scans.

Markdown raw HTML is disabled and rendered output is sanitized. Markdown image embeds are not automatically loaded. Bookmark URLs accept only HTTP and HTTPS. The app makes no AI API, analytics or cloud-sync calls.

## Development

Requires Node.js 24+.

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run e2e
```

The CI workflow runs the same lint, type-check, unit, production build and Playwright browser tests on pushes and pull requests to `main`.

## Deployment

The public GitHub repository is connected to Cloudflare Pages. Production builds use `npm run build`, publish `dist`, and require no environment variables.

- Production: https://secondbrain-dbs.pages.dev
- Repository: https://github.com/koushik4475/secondbrain

## Backup and portability

Use Settings to export a versioned JSON backup containing notes, tags, collections and preferences. You can also export an individual note or the non-deleted workspace as Markdown. Validate and preview JSON backups before choosing Merge or Replace.
