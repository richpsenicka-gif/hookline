# Hookline

An AI script hook & retention grader for faceless YouTube creators. Paste a script,
get a Retention Score, a graded breakdown of the hook/pacing/originality, and
rewrite suggestions.

This app has two parts:

- `index.html` — the whole website (no build step, no framework).
- `api/grade.js` — a small serverless function that calls Google's Gemini API
  (free tier) to do the actual grading, keeping your API key private.

## Deploying (free)

1. Get a free API key from https://aistudio.google.com/apikey
2. Import this repository into Vercel (https://vercel.com).
3. Add an environment variable named `GEMINI_API_KEY` with that key.
4. Deploy.

That's it — no server to manage, no database, $0 to run at low volume.

## Changing the free-grades-per-day limit

Open `index.html`, find this line near the top of the `<script>` section:

```js
const DAILY_LIMIT = 3;
```

Change `3` to whatever you want, save, and commit — Vercel redeploys automatically.

## Notes

- The free-grade counter is stored in the visitor's browser (`localStorage`),
  not on a server, so it's a soft limit for the MVP stage — good enough to
  control costs while you validate demand, not bulletproof abuse protection.
- No user data is stored anywhere. Each grade is a single stateless request.
- To swap in a different AI provider later (e.g. OpenAI, Anthropic, Groq),
  everything you'd change lives in `api/grade.js`.
