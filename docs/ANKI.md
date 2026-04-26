# Anki integration

Nihongo connects to **Anki Desktop** via the [AnkiConnect](https://ankiweb.net/shared/info/2055492159) addon. Once configured, your due cards appear on the Nihongo home page as "Today's reviews" and your answers in Nihongo push back to Anki's SRS.

## One-time setup (Anki Desktop)

1. **Install AnkiConnect**
   - Open Anki → Tools → Add-ons → Get Add-ons
   - Paste the code: `2055492159`
   - Restart Anki

2. **Allow Nihongo's origin**
   - Anki → Tools → Add-ons → AnkiConnect → Config
   - Set the `webCorsOriginList` to include the URL where you run Nihongo:
     ```json
     {
       "webCorsOriginList": [
         "https://grebett.github.io",
         "http://localhost:4321"
       ]
     }
     ```
   - Save and restart Anki.

3. **Connect from Nihongo**
   - Open `/anki` in Nihongo
   - Click **Test** — should show `✓ Connected`
   - Click **Enable Anki bridge**
   - Click **Sync now** — fetches your decks and due cards

That's it. The Nihongo home page now shows an "Anki — Today's reviews" section listing your decks with their due counts.

## How it works

- **Practice a deck** → Click a deck card on the home → opens a Nihongo practice session generated from the deck's due cards (matching exercises in batches of 5).
- **Answer correctly (1st try)** → review pushed to Anki as **Good** (ease 3).
- **Answer correctly after a retry** → **Hard** (ease 2).
- **Wrong (after max attempts)** → **Again** (ease 1).
- **Reviews are queued first**, then flushed to Anki when reachable. So you can practice on **mobile** (where AnkiConnect doesn't run): your answers stack in `localStorage` and sync the next time you open Nihongo on desktop with Anki running.

## Mobile notes

AnkiConnect is **desktop-only** (no AnkiMobile/AnkiDroid support). On mobile, Nihongo falls back to the **last cached** deck snapshot from your most recent desktop sync. You can still practice and queue reviews — they get flushed on the next desktop session.

If you want **live** mobile access (real-time card state and immediate review submission), you need to expose your desktop's AnkiConnect via a tunnel:

```bash
# With ngrok
ngrok http 8765

# Or with cloudflared
cloudflared tunnel --url http://localhost:8765
```

Then set the tunnel URL (e.g. `https://abcd-ef12.ngrok.io`) as the endpoint in Nihongo's `/anki` settings on your mobile browser. Don't forget to add the tunnel hostname to AnkiConnect's `webCorsOriginList`.

## Card field mapping

Nihongo expects three semantic fields in your Anki cards (case-insensitive, common aliases supported):

| Role        | Field names accepted                                       |
| ----------- | ---------------------------------------------------------- |
| Japanese    | `expression`, `japanese`, `front`, `word`, `kanji`, `jp`   |
| Reading     | `reading`, `kana`, `furigana`, `pronunciation`             |
| Meaning     | `meaning`, `english`, `french`, `translation`, `back`      |

If your card model uses different field names, the easiest fix is to rename them in Anki (Tools → Manage Note Types → Fields). A configurable mapping UI may be added later.

## Status pill (nav)

The small pill in the top-right shows the connection state:

- **Anki live** (green) — desktop connected, AnkiConnect reachable
- **Anki cached** (gold) — using last cached deck snapshot
- **Anki offline** (grey) — no cache yet, no connection

Plus the queued review count if any are pending.

## Auto-sync

When the page loads and AnkiConnect is reachable AND the cache is older than 15 minutes (or the queue is non-empty), Nihongo syncs automatically in the background. You can also trigger a manual sync anytime from `/anki` → "Sync now".
