# Blabber 'Round

A free, fan-made web version of the Jackbox party game *Blather 'Round*. Each player uses their own phone. One player describes a secret Story, Person, Place or Thing using only fill-in-the-blank sentences and the words they're given. Everyone else races to guess it.

Built with Next.js 16, React 19 and TypeScript. It's designed to run on Vercel's free tier with a free Upstash Redis database.

## Deploy to Vercel (about 5 minutes)

1. **Put the code on GitHub.** Create a new repository and push this folder to it.
2. **Import it into Vercel.** Go to https://vercel.com/new, pick the repo and click **Deploy**. No settings need changing because Vercel detects Next.js.
3. **Add the free database.** In your Vercel project, open **Storage → Create Database → Upstash (Redis)**, choose the free plan and connect it to the project. This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you.
4. **Redeploy.** Go to **Deployments → ⋯ → Redeploy** so the new environment variables are picked up.
5. Open your `*.vercel.app` URL on your phone and tap **Host a new game**. Friends go to the same URL and enter the 4-letter code, or you can send them the invite link from the lobby.

> Why a database? Vercel runs the game server as short-lived serverless functions that don't share memory, so room state lives in Redis. Without it the app only works in local development.

If you already have an Upstash database, you can set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` instead.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Without Redis variables it uses in-memory storage, which is fine on one machine. To test with phones, open `http://<your-computer's-LAN-IP>:3000` on devices connected to the same Wi-Fi.

## How it plays

- **Lobby:** 2–8 players join with a room code and a name. The host picks 1–3 rounds and the turn length. Anyone who joins after the game starts watches as audience and can guess for fun.
- **Choosing:** the presenter gets 3 secret prompts from different categories and has 30 seconds to pick one. Round 1 is easy, round 2 medium and round 3 hard.
- **Presenting:** the presenter must open with *"It's a ___ ___."* After that they can use:
  - category-specific templates like *"It takes place in ___"*, *"They can ___"* or *"You use it to ___"*
  - templates that reference guesses, like *"It's like 'Finding Nemo', but scary."* (tap a guess to use it)

  Each blank offers about 12 words: up to 5 genuinely useful ones mixed with decoys, so the presenter has to get creative.
- **Guessing:** guesses are free text, and the whole room sees them. Matching tolerates typos, "the/a", punctuation and common alternate names. If a guess shares a word with the answer, only the guesser sees "close". At 45% of the time the letter pattern of the answer is revealed, and at 75% the first letters are revealed too.
- **Scoring:** a correct guess earns 300–1000 points depending on speed, plus 100 for being first. The presenter scores 200–700 when the first person solves it and +100 for each additional solver. After the first correct guess, everyone else has 20 seconds.
- **Extras:** there's a 🔊 narrator that reads new clues aloud (turn it on for one phone only). Your phone vibrates when it's your turn. The host can skip a turn, end the game or kick players, and a disconnected host is replaced automatically.

## Customising

- **App name / colours:** `src/lib/config.ts`
- **Prompts** (256 included): `src/lib/content.ts`. Each prompt line looks like:
  ```ts
  P("Jaws", "story", "movie", 1, "a:scary,wet|n:a shark,a boat|p:a sheriff|l:the ocean|v:swim,bite", "alt answer,another")
  ```
  `a`=adjectives, `n`=nouns/things, `p`=people, `l`=places, `v`=verbs. Any word that gives away the answer is filtered out automatically. Run `npm run check-content` after editing.
- **Sentence templates:** `src/lib/templates.ts`
- **Timings and scoring:** constants at the top of `src/lib/game.ts`

## Free-tier usage

Each phone polls the server about once a second during a turn. A 6-player, 1-hour session uses about 25–30k Redis commands. Upstash's free tier covers plenty of game nights, and Vercel's Hobby plan is free for personal, non-commercial projects.

## Legal

This is an unofficial fan project and isn't affiliated with Jackbox Games. *Blather 'Round* and *Jackbox* are trademarks of Jackbox Games, Inc. The app uses its own name ("Blabber 'Round") and original content.
