const searchInput = document.getElementById('searchInput');
const downloadBtn = document.getElementById('downloadBtn');
const statusDiv = document.getElementById('status');
const trackList = document.getElementById('trackList');
const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d');

const authBtn = document.getElementById('authBtn');
const authModal = document.getElementById('authModal');
const closeAuthBtn = document.getElementById('closeAuthBtn');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const userDisplay = document.getElementById('userDisplay');
const authStatus = document.getElementById('authStatus');

let playlist = JSON.parse(localStorage.getItem('playlist') || '[]');
let trackNames = JSON.parse(localStorage.getItem('trackNames') || '{}');
let currentUser = localStorage.getItem('currentUser') || null;
let audioContext, analyser, dataArray;
let isPlaying = false;
let particles = [];
let currentAudio = null;

if (currentUser) {
  userDisplay.textContent = currentUser;
  authBtn.textContent = 'Выйти';
}

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

class Particle {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.radius = Math.random() * 2 + 1;
    this.speedX = (Math.random() - 0.5) * 0.3;
    this.speedY = (Math.random() - 0.5) * 0.3;
    this.hue = 220 + Math.random() * 60;
  }

  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
    if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${this.hue}, 40%, 50%, 0.4)`;
    ctx.fill();
  }
}

for (let i = 0; i < 50; i++) {
  particles.push(new Particle());
}

function animate() {
  requestAnimationFrame(animate);
  ctx.fillStyle = 'rgba(26, 26, 46, 0.05)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (analyser && isPlaying) {
    analyser.getByteFrequencyData(dataArray);
    const barWidth = canvas.width / dataArray.length;
    for (let i = 0; i < dataArray.length; i++) {
      const barHeight = dataArray[i] * 0.3;
      const hue = (i / dataArray.length) * 360;
      ctx.fillStyle = `hsla(${hue}, 60%, 50%, 0.3)`;
      ctx.fillRect(i * barWidth, canvas.height - barHeight, barWidth - 1, barHeight);
    }
  }

  particles.forEach(p => {
    p.update();
    p.draw();
  });
}

animate();

function initAudioAnalyser(audioElement) {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    const source = audioContext.createMediaElementSource(audioElement);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
  }
  
  audioElement.addEventListener('play', () => {
    isPlaying = true;
    if (audioContext.state === 'suspended') audioContext.resume();
  });
  
  audioElement.addEventListener('pause', () => {
    isPlaying = false;
  });
  
  audioElement.addEventListener('ended', () => {
    isPlaying = false;
  });
}

authBtn.addEventListener('click', () => {
  if (currentUser) {
    currentUser = null;
    localStorage.removeItem('currentUser');
    userDisplay.textContent = 'Не вошёл';
    authBtn.textContent = 'Войти';
  } else {
    authModal.style.display = 'flex';
  }
});

closeAuthBtn.addEventListener('click', () => {
  authModal.style.display = 'none';
});

loginBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (data.success) {
      currentUser = data.username;
      localStorage.setItem('currentUser', currentUser);
      userDisplay.textContent = currentUser;
      authBtn.textContent = 'Выйти';
      authModal.style.display = 'none';
      authStatus.textContent = '';
      usernameInput.value = '';
      passwordInput.value = '';
    } else {
      authStatus.textContent = '❌ ' + data.error;
    }
  } catch (err) {
    authStatus.textContent = '❌ Сервер недоступен';
  }
});

registerBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (data.success) {
      authStatus.textContent = '✅ Регистрация успешна. Теперь войди.';
    } else {
      authStatus.textContent = '❌ ' + data.error;
    }
  } catch (err) {
    authStatus.textContent = '❌ Сервер недоступен';
  }
});

downloadBtn.addEventListener('click', async () => {
  const query = searchInput.value.trim();
  if (!query) {
    statusDiv.textContent = 'Введи название трека или строчку!';
    return;
  }

  statusDiv.textContent = '🔍 Ищу...';
  downloadBtn.disabled = true;

  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });

    const data = await response.json();

    if (data.success && data.results.length > 0) {
      showSearchResults(data.results);
    } else {
      statusDiv.textContent = '❌ Ничего не найдено';
    }
  } catch (err) {
    statusDiv.textContent = '❌ Сервер недоступен';
  }

  downloadBtn.disabled = false;
});

function showSearchResults(results) {
  const oldResults = document.getElementById('searchResults');
  if (oldResults) oldResults.remove();

  const resultsDiv = document.createElement('div');
  resultsDiv.className = 'search-results';
  resultsDiv.id = 'searchResults';

  const title = document.createElement('h3');
  title.textContent = 'Выбери трек:';
  resultsDiv.appendChild(title);

  results.forEach((result, index) => {
    const item = document.createElement('div');
    item.className = 'search-result-item';
    item.innerHTML = `
      <span class="result-index">${index + 1}</span>
      <div class="result-info">
        <div class="result-title">${result.title}</div>
        <div class="result-artist">${result.artist}</div>
      </div>
    `;
    item.addEventListener('click', () => {
      downloadSelected(result);
      resultsDiv.remove();
    });
    resultsDiv.appendChild(item);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Отмена';
  cancelBtn.className = 'cancel-btn';
  cancelBtn.addEventListener('click', () => resultsDiv.remove());
  resultsDiv.appendChild(cancelBtn);

  statusDiv.innerHTML = '';
  statusDiv.appendChild(resultsDiv);
}

async function downloadSelected(result) {
  statusDiv.textContent = '⏳ Скачиваю...';

  try {
    const response = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: result.videoId,
        title: result.title,
        artist: result.artist
      })
    });

    const data = await response.json();

    if (data.success) {
      const fileName = data.fileUrl.split('/').pop();
      const fullName = `${data.artist} - ${data.title}`;
      trackNames[fileName] = fullName;
      localStorage.setItem('trackNames', JSON.stringify(trackNames));
      statusDiv.textContent = '✅ Готово!';
      searchInput.value = '';
      loadTracks();
    } else {
      statusDiv.textContent = '❌ Ошибка: ' + data.error;
    }
  } catch (err) {
    statusDiv.textContent = '❌ Сервер недоступен';
  }
}

function createCustomPlayer(trackUrl, cleanName) {
  const playerDiv = document.createElement('div');
  playerDiv.className = 'custom-player';

  const audio = document.createElement('audio');
  audio.src = trackUrl;
  audio.preload = 'auto';

  const playBtn = document.createElement('button');
  playBtn.className = 'play-btn';
  playBtn.textContent = '▶';

  const progressContainer = document.createElement('div');
  progressContainer.className = 'progress-container';

  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';

  const progressFill = document.createElement('div');
  progressFill.className = 'progress-fill';

  const timeDisplay = document.createElement('span');
  timeDisplay.className = 'time-display';
  timeDisplay.textContent = '0:00 / 0:00';

  progressBar.appendChild(progressFill);
  progressContainer.appendChild(progressBar);

  playerDiv.appendChild(playBtn);
  playerDiv.appendChild(progressContainer);
  playerDiv.appendChild(timeDisplay);
  playerDiv.appendChild(audio);

  playBtn.addEventListener('click', () => {
    if (audio.paused) {
      audio.play();
      playBtn.textContent = '⏸';
    } else {
      audio.pause();
      playBtn.textContent = '▶';
    }
  });

  audio.addEventListener('play', () => {
    playBtn.textContent = '⏸';
    if (currentAudio && currentAudio !== audio) {
      currentAudio.pause();
    }
    currentAudio = audio;
    initAudioAnalyser(audio);
  });

  audio.addEventListener('pause', () => {
    playBtn.textContent = '▶';
  });

  audio.addEventListener('ended', () => {
    playBtn.textContent = '▶';
    progressFill.style.width = '0%';
    timeDisplay.textContent = '0:00 / 0:00';
  });

  audio.addEventListener('timeupdate', () => {
    const percent = (audio.currentTime / audio.duration) * 100;
    progressFill.style.width = percent + '%';
    const currentMin = Math.floor(audio.currentTime / 60);
    const currentSec = Math.floor(audio.currentTime % 60).toString().padStart(2, '0');
    const totalMin = Math.floor(audio.duration / 60);
    const totalSec = Math.floor(audio.duration % 60).toString().padStart(2, '0');
    timeDisplay.textContent = `${currentMin}:${currentSec} / ${totalMin}:${totalSec}`;
  });

  progressContainer.addEventListener('click', (e) => {
    const rect = progressBar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    audio.currentTime = percent * audio.duration;
  });

  return playerDiv;
}

async function deleteTrack(name) {
  try {
    const response = await fetch(`/api/track/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      delete trackNames[name];
      localStorage.setItem('trackNames', JSON.stringify(trackNames));
      statusDiv.textContent = '🗑 Трек удалён';
      loadTracks();
    } else {
      statusDiv.textContent = '❌ Ошибка: ' + data.error;
    }

    setTimeout(() => statusDiv.textContent = '', 2000);
  } catch (err) {
    statusDiv.textContent = '❌ Сервер недоступен';
  }
}

async function loadTracks() {
  try {
    const response = await fetch('/api/tracks');
    const tracks = await response.json();

    trackList.innerHTML = '';

    if (tracks.length === 0) {
      trackList.innerHTML = '<p>Пока нет скачанных треков</p>';
      return;
    }

    tracks.forEach(track => {
      const cleanName = `${track.artist} - ${track.title}`;
      const div = document.createElement('div');
      div.className = 'track-item';

      const coverHtml = '<div class="cover no-cover">🎵</div>';

      const actionsHtml = `
        <div class="track-actions">
          <button class="add-btn" data-url="${track.url}" data-name="${cleanName}" data-cover="">＋</button>
          <a href="${track.url}" download class="dl-btn">⬇</a>
          <button class="delete-btn" data-name="${track.name}">🗑</button>
        </div>
      `;

      div.innerHTML = `
        ${coverHtml}
        <div class="track-info">
          <div class="track-name">${cleanName}</div>
        </div>
        ${actionsHtml}
      `;

      const trackInfo = div.querySelector('.track-info');
      const player = createCustomPlayer(track.url, cleanName);
      trackInfo.appendChild(player);

      trackList.appendChild(div);
    });

    document.querySelectorAll('.add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        addToPlaylist(btn.dataset.url, btn.dataset.name, btn.dataset.cover);
      });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Удалить этот трек?')) {
          deleteTrack(btn.dataset.name);
        }
      });
    });
  } catch (err) {
    trackList.innerHTML = '<p>Ошибка загрузки списка</p>';
  }
}

function addToPlaylist(url, name, cover) {
  if (!playlist.some(t => t.url === url)) {
    playlist.push({ url, name, cover });
    localStorage.setItem('playlist', JSON.stringify(playlist));
    renderPlaylist();
    statusDiv.textContent = '✅ Добавлено в плейлист';
  } else {
    statusDiv.textContent = 'Уже в плейлисте';
  }
  setTimeout(() => statusDiv.textContent = '', 2000);
}

function renderPlaylist() {
  const playlistDiv = document.getElementById('playlist');
  if (!playlistDiv) return;

  playlistDiv.innerHTML = '';
  
  if (playlist.length === 0) {
    playlistDiv.innerHTML = '<p>Плейлист пуст</p>';
    return;
  }

  playlist.forEach((track, index) => {
    const div = document.createElement('div');
    div.className = 'playlist-item';
    div.innerHTML = `
      <span>${track.name}</span>
      <button class="remove-btn" data-index="${index}">✕</button>
    `;
    playlistDiv.appendChild(div);
  });

  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      playlist.splice(btn.dataset.index, 1);
      localStorage.setItem('playlist', JSON.stringify(playlist));
      renderPlaylist();
    });
  });
}

document.getElementById('clearPlaylistBtn').addEventListener('click', () => {
  playlist = [];
  localStorage.setItem('playlist', JSON.stringify(playlist));
  renderPlaylist();
});

loadTracks();
renderPlaylist();