# Run For Your Life

A real-time tap race built around a dramatic theme: escape the attack by tapping faster than your friends. Each tap propels your runner along the racetrack, and the slowest tapper loses the round. Upload a silly photo or use one of the built-in avatars for your racer; the image is kept in-memory for that session only.

## Features

- Lobby for 2–7 players with a host who controls the round duration.
- WebSocket server that relays tap messages and enforces the timed round.
- Round results highlight winners and losers, plus a simple win/loss tally.
- Simple race UI: avatars, progress bars, scoreboard, and a tap button.

## Getting started

1. Install dependencies (requires Node.js and npm):
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. Open the game in your browser at `http://localhost:4000`

The first player to join becomes the host and can set the round duration (5–60 seconds) before starting the round. Tapping during the running round moves your character forward, and the slowest tapper is marked as the loser when time expires.
