const express = require('express');
const http = require('http');
const path = require('path');
const { randomUUID } = require('crypto');
const WebSocket = require('ws');

const PORT = process.env.PORT || 4000;
const MAX_PLAYERS = 7;
const DEFAULT_DURATION = 10;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/status', (req, res) => res.json({ status: 'ok' }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const players = new Map();
let hostId = null;
let round = {
  inProgress: false,
  duration: DEFAULT_DURATION,
  startTime: null,
  endTime: null,
};
let roundResult = null;
let roundTimer = null;

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const player of players.values()) {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(data);
    }
  }
}

function assembleState() {
  const sortedPlayers = [...players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  return {
    type: 'state',
    players: sortedPlayers.map((player) => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      taps: player.taps,
      wins: player.wins,
      losses: player.losses,
      isHost: player.id === hostId,
    })),
    hostId,
    round,
    roundResult,
  };
}

function updateHostIfNeeded() {
  if (hostId && players.has(hostId)) {
    return;
  }
  const firstPlayer = [...players.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
  hostId = firstPlayer ? firstPlayer.id : null;
}

function resetPlayersForRound() {
  for (const player of players.values()) {
    player.taps = 0;
  }
}

function sendError(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'error', message }));
  }
}

function startRound() {
  if (round.inProgress) {
    return;
  }
  if (players.size < 2) {
    return;
  }

  resetPlayersForRound();
  round.inProgress = true;
  round.startTime = Date.now();
  round.endTime = round.startTime + round.duration * 1000;
  roundResult = null;

  if (roundTimer) {
    clearTimeout(roundTimer);
  }
  roundTimer = setTimeout(() => {
    endRound();
  }, round.duration * 1000);

  broadcast({
    type: 'round_started',
    duration: round.duration,
    startTime: round.startTime,
    endTime: round.endTime,
  });
  broadcast(assembleState());
}

function endRound() {
  if (!round.inProgress) {
    return;
  }
  round.inProgress = false;
  round.startTime = null;
  round.endTime = null;
  if (roundTimer) {
    clearTimeout(roundTimer);
    roundTimer = null;
  }

  const currentPlayers = [...players.values()];
  if (currentPlayers.length) {
    const taps = currentPlayers.map((p) => p.taps);
    const maxTaps = Math.max(...taps);
    const minTaps = Math.min(...taps);
    const winners = currentPlayers.filter((p) => p.taps === maxTaps).map((p) => p.id);
    const losers = currentPlayers.filter((p) => p.taps === minTaps).map((p) => p.id);

    for (const id of winners) {
      const player = players.get(id);
      if (player) {
        player.wins += 1;
      }
    }
    for (const id of losers) {
      const player = players.get(id);
      if (player) {
        player.losses += 1;
      }
    }

    roundResult = { winners, losers };
  } else {
    roundResult = null;
  }

  broadcast({ type: 'round_ended', result: roundResult });
  broadcast(assembleState());
}

wss.on('connection', (ws) => {
  const playerId = randomUUID();
  let joined = false;

  ws.on('message', (message) => {
    let payload;
    try {
      payload = JSON.parse(message);
    } catch (error) {
      sendError(ws, 'Invalid message format.');
      return;
    }

    switch (payload.type) {
      case 'join': {
        if (!payload.name) {
          sendError(ws, 'Name is required.');
          return;
        }
        if (players.size >= MAX_PLAYERS) {
          sendError(ws, 'Room is full.');
          return;
        }
        if (joined) {
          return;
        }

        const player = {
          id: playerId,
          name: payload.name.slice(0, 20),
          avatar: payload.avatar || '',
          ws,
          taps: 0,
          wins: 0,
          losses: 0,
          joinedAt: Date.now(),
        };
        players.set(playerId, player);
        joined = true;
        updateHostIfNeeded();
        ws.send(JSON.stringify({ type: 'welcome', playerId, hostId, duration: round.duration }));
        broadcast(assembleState());
        break;
      }
      case 'set_duration': {
        if (playerId !== hostId) {
          sendError(ws, 'Only the host can change the duration.');
          return;
        }
        if (round.inProgress) {
          sendError(ws, 'Cannot change duration during an active round.');
          return;
        }
        const duration = Number(payload.duration);
        if (!Number.isFinite(duration) || duration < 5 || duration > 60) {
          sendError(ws, 'Duration must be between 5 and 60 seconds.');
          return;
        }
        round.duration = duration;
        broadcast(assembleState());
        break;
      }
      case 'start_round': {
        if (playerId !== hostId) {
          sendError(ws, 'Only the host can start a round.');
          return;
        }
        if (round.inProgress) {
          sendError(ws, 'Round is already in progress.');
          return;
        }
        if (players.size < 2) {
          sendError(ws, 'Need at least two players to start.');
          return;
        }
        startRound();
        break;
      }
      case 'tap': {
        if (!round.inProgress) {
          return;
        }
        const player = players.get(playerId);
        if (!player) {
          sendError(ws, 'Player not registered.');
          return;
        }
        player.taps += 1;
        broadcast(assembleState());
        break;
      }
      default:
        sendError(ws, 'Unknown message type.');
    }
  });

  ws.on('close', () => {
    if (joined) {
      players.delete(playerId);
      updateHostIfNeeded();
      if (round.inProgress && players.size < 2) {
        endRound();
      }
      broadcast(assembleState());
    }
  });
});

server.listen(PORT, () => {
  console.log(`RunForYourLife server listening on http://localhost:${PORT}`);
});
