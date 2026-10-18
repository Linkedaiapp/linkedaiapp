# Link Kedai App: notes for every change

- The app is one file: `index.html`. After editing it, copy it to `404.html` (GitHub Pages uses it for store links).
- Bump the cache version `V` in `sw.js` on every release so phones pick up the update, and set `APP_VERSION` in `index.html` to the same number (Settings shows it).
- **Every update sellers can see gets a bot post.** Add an entry at the top of `APP_UPDATES` in `index.html`:
  `{ id: "u-YYYYMMDD-short-name", at: "YYYY-MM-DD", title: "...", body: "..." }`.
  The bot shows the newest unread post on the seller's store home and lists every post in News.
  Write it for sellers: say what's new and where to find it, in plain English. Keep the id unique and never reuse one.
- Never put secrets (admin key, relay secret) in this repo. It is public.
