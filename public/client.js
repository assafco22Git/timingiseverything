const defaultSocketUrl = ((window.location.protocol === 'https:') ? 'wss://' : 'ws://') + window.location.host;
const socket = new WebSocket(window.RUN_FOR_YOUR_LIFE_WS_URL || defaultSocketUrl);

const lobby = document.getElementById('lobby');
const joinForm = document.getElementById('joinForm');
const playerNameInput = document.getElementById('playerName');
const avatarOptions = document.getElementById('avatarOptions');
const avatarUpload = document.getElementById('avatarUpload');
const avatarPreview = document.getElementById('avatarPreview');
const joinStatus = document.getElementById('joinStatus');
const durationInput = document.getElementById('durationInput');
const startRoundButton = document.getElementById('startRoundButton');
const roundStatus = document.getElementById('roundStatus');
const timerDisplay = document.getElementById('timerDisplay');
const trackBoard = document.getElementById('trackBoard');
const scoreBoard = document.getElementById('scoreBoard');
const resultCard = document.getElementById('resultCard');
const resultBody = document.getElementById('resultBody');
const resultTitle = document.getElementById('resultTitle');
const resultDismiss = document.getElementById('resultDismiss');
const tapButton = document.getElementById('tapButton');

function buildEmojiAvatar(emoji, bg, fill) {
  const payload = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <rect width="128" height="128" rx="20" fill="${bg}" />
      <text x="64" y="86" text-anchor="middle" font-size="64" font-family="Segoe UI" fill="${fill}">${emoji}</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;utf8,${encodeURIComponent(payload)}`;
}

const sampleAvatars = [
  {
    label: 'Runner',
    emoji: '🏃',
    src: buildEmojiAvatar('🏃', '#03081c', '#ffbe0b'),
  },
  {
    label: 'Wild eyes',
    emoji: '🤪',
    src: buildEmojiAvatar('🤪', '#031d2a', '#f26b38'),
  },
  {
    label: 'Hero',
    emoji: '🦸',
    src: buildEmojiAvatar('🦸', '#000d16', '#91e5f6'),
  },
];

let selectedAvatar = sampleAvatars[0].src;
let playerId = null;
let hostId = null;
let roundState = null;
let roundResult = null;
let countdownTimer = null;
let resultTimeout = null;

avatarPreview.src = selectedAvatar;

function renderAvatarOptions() {
  avatarOptions.innerHTML = '';
  sampleAvatars.forEach((avatar) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = avatar.label;
    btn.innerHTML = `<span class="emoji-icon">${avatar.emoji}</span>`;
    if (selectedAvatar === avatar.src) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      selectedAvatar = avatar.src;
      avatarPreview.src = avatar.src;
      avatarOptions.querySelectorAll('button').forEach((button) => button.classList.remove('active'));
      btn.classList.add('active');
      avatarUpload.value = '';
    });
    avatarOptions.appendChild(btn);
  });
}

renderAvatarOptions();

avatarUpload.addEventListener('change', () => {
  const file = avatarUpload.files?.[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    selectedAvatar = reader.result;
    avatarPreview.src = selectedAvatar;
    avatarOptions.querySelectorAll('button').forEach((button) => button.classList.remove('active'));
  };
  reader.readAsDataURL(file);
});

function send(payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = playerNameInput.value.trim();
  if (!name) {
    joinStatus.textContent = 'Give us a name to race with.';
    return;
  }
  if (socket.readyState !== WebSocket.OPEN) {
    joinStatus.textContent = 'Still connecting...';
    return;
  }
  send({ type: 'join', name, avatar: selectedAvatar });
  joinStatus.textContent = 'Joining the lobby...';
});

function clearCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function startCountdown() {
  clearCountdown();
  countdownTimer = setInterval(() => {
    updateTimerDisplay();
  }, 250);
}

function updateTimerDisplay() {
  if (roundState?.inProgress && roundState.endTime) {
    const remainingMs = Math.max(0, roundState.endTime - Date.now());
    const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
    timerDisplay.textContent = `${seconds}s left`;
    if (seconds === 0) {
      clearCountdown();
    }
  } else {
    timerDisplay.textContent = 'Waiting for round...';
    clearCountdown();
  }
}

function hideResultCard() {
  if (resultTimeout) {
    clearTimeout(resultTimeout);
    resultTimeout = null;
  }
  resultCard?.classList.add('hidden');
}

function renderRoundResult(result, players) {
  if (!result || !players.length) {
    hideResultCard();
    return;
  }
  const findName = (id) => players.find((p) => p.id === id)?.name || 'Unknown';
  const winners = result.winners.map(findName).join(', ') || '—';
  const losers = result.losers.map(findName).join(', ') || '—';
  resultTitle.textContent = `Winners: ${winners} • Losers: ${losers}`;
  resultBody.innerHTML = players
    .map((player) => {
      const badges = [];
      if (result.winners.includes(player.id)) badges.push('Winner');
      if (result.losers.includes(player.id)) badges.push('Loser');
      const badgeText = badges.length ? ` (${badges.join(' • ')})` : '';
      return `<span>${player.name}${badgeText} — ${player.taps} taps • ${player.wins}W • ${player.losses}L</span>`;
    })
    .join('');
  resultCard?.classList.remove('hidden');
  if (resultTimeout) {
    clearTimeout(resultTimeout);
  }
  resultTimeout = setTimeout(hideResultCard, 6000);
}

function updateUI(state) {
  hostId = state.hostId;
  roundState = state.round;
  roundResult = state.roundResult;

  const primaryPlayer = state.players.find((player) => player.id === playerId);

  if (playerId && lobby && !lobby.classList.contains('hidden')) {
    lobby.classList.add('hidden');
  }

  durationInput.value = state.round.duration;
  durationInput.disabled = playerId !== hostId || (state.round.inProgress ?? false);
  startRoundButton.disabled = playerId !== hostId || state.round.inProgress;
  tapButton.disabled = !state.round.inProgress || !playerId;
  roundStatus.textContent = state.round.inProgress ? 'Round running' : 'Lobby';
  if (state.round.inProgress) {
    startCountdown();
  } else {
    updateTimerDisplay();
  }

  const maxTaps = Math.max(...state.players.map((player) => player.taps), 1);
  trackBoard.innerHTML = '';
  state.players.forEach((player) => {
    const lane = document.createElement('div');
    lane.className = 'player-lane';
    const laneBadges = [];
    if (roundResult?.winners?.includes(player.id)) {
      laneBadges.push('<span class="status-chip">Winner</span>');
    }
    if (roundResult?.losers?.includes(player.id)) {
      laneBadges.push('<span class="status-chip">Loser</span>');
    }
    if (player.id === playerId) {
      laneBadges.push('<span class="status-chip">You</span>');
    }
    lane.innerHTML = `
      <div class="player-meta">
        <img src="${player.avatar}" alt="${player.name}" />
        <div>
          <div class="name">
            ${player.name}${player.id === hostId ? ' (host)' : ''}
          </div>
          <div class="badges">
            ${laneBadges.join(' ')}
          </div>
        </div>
      </div>
      <div class="player-progress">
        <div class="runner" style="width: ${Math.min(100, (player.taps / maxTaps) * 100)}%"></div>
      </div>
      <div class="badges">${player.taps} taps • Wins ${player.wins} • Losses ${player.losses}</div>
    `;
    trackBoard.appendChild(lane);
  });

  scoreBoard.innerHTML = '';
  state.players.forEach((player) => {
    const card = document.createElement('div');
    card.className = 'score-card';
    const badges = [];
    if (roundResult?.winners?.includes(player.id)) {
      badges.push('Winner');
    }
    if (roundResult?.losers?.includes(player.id)) {
      badges.push('Loser');
    }
    card.innerHTML = `
      <strong>${player.name}${player.id === playerId ? ' (you)' : ''}</strong>
      <span>${badges.join(' • ') || 'Racer'}</span>
      <small>${player.wins} wins • ${player.losses} losses • ${player.taps} taps</small>
    `;
    scoreBoard.appendChild(card);
  });

  renderRoundResult(roundResult, state.players);

  if (primaryPlayer) {
    tapButton.textContent = roundState.inProgress ? 'Tap! Run!' : 'Waiting for round...';
  }
}

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  switch (message.type) {
    case 'welcome': {
      playerId = message.playerId;
      hostId = message.hostId;
      durationInput.value = message.duration;
      lobby.classList.add('hidden');
      joinStatus.textContent = '';
      break;
    }
    case 'state': {
      updateUI(message);
      break;
    }
    case 'round_started': {
      roundState = {
        ...(roundState ?? {}),
        inProgress: true,
        duration: message.duration,
        startTime: message.startTime,
        endTime: message.endTime,
      };
      updateTimerDisplay();
      break;
    }
    case 'round_ended': {
      roundResult = message.result;
      roundState = {
        ...(roundState ?? {}),
        inProgress: false,
      };
      updateTimerDisplay();
      break;
    }
    case 'error': {
      joinStatus.textContent = message.message;
      break;
    }
    default:
      console.warn('Unknown message from server', message);
  }
});

socket.addEventListener('open', () => {
  joinStatus.textContent = 'Server connected. Fill name and jump in.';
});

socket.addEventListener('close', () => {
  joinStatus.textContent = 'Connection lost. Refresh to rejoin.';
  tapButton.disabled = true;
  startRoundButton.disabled = true;
});

startRoundButton.addEventListener('click', () => {
  send({ type: 'start_round' });
});

durationInput.addEventListener('change', () => {
  const value = Number(durationInput.value);
  if (Number.isFinite(value)) {
    send({ type: 'set_duration', duration: value });
  }
});

tapButton.addEventListener('click', () => {
  send({ type: 'tap' });
});

resultDismiss?.addEventListener('click', hideResultCard);
