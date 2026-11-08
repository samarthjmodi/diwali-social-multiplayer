# Diwali Social multiplayer

A single-process Node.js party room with a server-rendered static frontend, WebSocket updates, host approvals, privately delivered prompts, role-specific player and TV views, and in-memory state. The original `../Diwali Game Night.html` stays available as an offline fallback.

## Run locally

Requirements: Node.js 22 or newer.

1. Enter this folder: `multiplayer/`
2. Copy `.env.example` to `.env` and set `HOST_PASSWORD` to a unique secret with at least 12 characters. The committed example is intentionally not a working password.
3. Run `npm ci` once, then `npm run dev`.
4. Open `http://127.0.0.1:3000/host` to host. Use the guest entrance at `/` and TV view at `/display`.
5. Stop the server with Ctrl+C.

By default, Node binds to localhost for development. For a private-network rehearsal, start with `BIND_HOST=0.0.0.0` and `PORT=3000`; use the computer's local network IP on guests' devices. Some Wi-Fi networks block device-to-device access. Do not forward this unauthenticated local HTTP connection to the public internet.

The host password lives only in an environment variable. For a local rehearsal, `.env` is ignored by Git. Change the sample value and use a different secret on the hosted service.

## Deploy to Render

1. Create a **private** GitHub repository and upload the contents of this `multiplayer/` folder. Do not include `.env` or `node_modules/`.
2. In Render, use **New → Blueprint** to connect the repository and select its `render.yaml`.
3. Enter a fresh `HOST_PASSWORD` in Render's prompt. Do not reuse the local rehearsal secret. Keep the Blueprint at one paid `starter` instance and avoid automatic deployment during the party.
4. Wait for `/healthz` to pass. Visit `/host`, sign in, prepare the roster, then check `/` as a guest and `/display` on the TV device.
5. Run a short rehearsal with test names. Export and test a backup, then clear rehearsal scores and use-card state before real play.
6. Export the final scores after the party. Delete or suspend the paid Render service after you no longer need its game room.

The app uses Render's `RENDER_EXTERNAL_URL` to validate same-origin host requests and build QR links. It uses one instance because the in-memory room is not shared across instances. No database is needed.

## Room lifecycle and backup

All room content, approved players, scores, card review decisions, and the current round live in process memory. They are lost if the service restarts, is redeployed, or stops. Export a backup after roster/team setup, after reviewing cards, and between games. Store it on the host's device; backups contain roster names, scores, review decisions, and potentially a private in-progress prompt/answer. They never contain host passwords or access tokens. Restoring gives the room a new code, revokes player sessions, and pauses any unfinished timer.

Use **Test rehearsal cards** to include pending content. Every imported prompt starts **pending**; party rounds only use approved cards. Review content with the host's **Review cards** tab before the event. The question list is provisional and has not been tuned to the host's audience or party tone.

## Security and access

- Host password checks, role checks, score changes, card choices, timer deadlines, and quiz submissions are handled on the Node.js server.
- Approved guests reconnect with a short-lived token. A player name can be approved on one device at a time; the host can release it.
- Quiz answers and team submissions go only to the host until reveal. A player sees only their own team's submission state.
- The TV and public game entry never receive the card bank or host password.
- The host dashboard contains answer keys. Keep it on the host's screen; send the separate TV display to the projector.
- Backups are unencrypted JSON. Treat them as private party files and remove them when no longer useful.
- WebSocket clients reconnect automatically; the server is authoritative for clock expiry and rejects late submissions.

## Commands

- `npm ci` — install the pinned runtime dependencies
- `npm run dev` — run the local server with `.env`
- `npm start` — run with the environment set by the deployment platform
- `npm run check` — parse-check the source
- `npm test` — run the offline room/state and local integration checks

No question or prompt is approved automatically. Keep the existing standalone HTML for a no-network fallback.

### Bollywood Bidding War

The five user-selected categories are approved and ready to play. In **Run the games**, select **Bollywood Bidding War**, choose a category (or random), and prepare the round. Teams call bids aloud; the host records each increasing bid, closes bidding, and starts the fixed 60-second challenge. The highest bidder answers as a team. The host judges distinct valid answers and chooses Success (+10 × bid) or Failed (−5 × bid). Negative totals are supported. The public display and player phones show the category, highest bid, timer, and live scores. Unstarted bidding rounds can be cancelled without a score change. Old backups gain these five categories when restored if they did not already contain them.
