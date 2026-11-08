# Diwali Social — one-screen game night

Open `public/diwali-party.html` directly in your browser and screen-share it to the TV. No login, guest devices, database, internet, or server is required. Use the same browser/file location to resume saved progress. Download a backup before switching devices or browsers.

## Flow
1. Enter player names, choose 2–10 teams, and shuffle. Edit team names and membership, then save.
2. Pick one of the four games. Host controls reveal, timer, next prompt, and scoring.
3. Scores shows standings and each manual award. Undo reverses the most recent award.

| Game | Timer | Suggested scoring |
| --- | --- | --- |
| Bollywood Bidding War | 60 seconds after bidding | +10 × bid for success; −5 × bid for failure |
| Reverse Charades | 90 seconds per prompt | +10 correct |
| Forbidden Words | 90 seconds per prompt | +10 correct; −5 forbidden word |
| Epic in 15 | 15 minutes preparation, 3 minutes per performance | 0–150 per team: creativity, teamwork, laughs, each out of 50 |

For charades, the guesser faces away from the screen before the host reveals the acting prompt. For Forbidden Words, the guessing teammates face away while the cluegiver sees the target and banned words. The timer does not reveal anything or score automatically. Bidding has open-ended responses judged by the host, rather than a fixed answer key. Epic in 15 shows all five scenarios and suggested roles; assign scenarios with the team dropdowns.

State saves in browser localStorage; backups are JSON downloads. Old multiplayer backups use a different format and are not imported. Rosters can be pasted into team setup. Existing multiplayer code remains available in Git history.

## Hosting (optional)
`npm start` serves the static game on port 3000 (or PORT). `/`, `/host`, and `/display` all open the same game. Each browser has independent state; project only the host browser. No password is required. `/healthz` is retained for Render. Existing Render service can deploy this commit using Manual Deploy → Deploy latest commit. No paid hosting is necessary for local HTML use; the existing Render service continues billing until you stop/remove its paid resource.

## Development
`npm run build` bundles public HTML/CSS/scripts into the offline HTML file. Run it after edits. `npm run check` checks JavaScript syntax. `npm test` checks team balancing, scoring/undo, backups, and offline packaging.
