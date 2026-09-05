const express = require('express');
const router = express.Router();
const https = require('https');

let tracksStore = [];

const yandexToken = process.env.YANDEX_SESSION_ID || '';

// Поиск в Яндексе
router.post('/search', async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Введи название трека или строчку' });
  }

  // Ищем в Audius
  const audiusUrl = `https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&limit=15`;

  https.get(audiusUrl, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'MusikFree/1.0'
    }
  }, (response) => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => {
      try {
        const json = JSON.parse(data);
        const results = (json.data || []).map(item => ({
          title: item.title || 'Без названия',
          artist: item.user?.name || 'Неизвестен',
          videoId: item.id || '',
          duration: Math.round(item.duration || 0),
          source: 'Audius'
        })).filter(r => r.videoId && r.duration > 60);

        res.json({ success: true, results });
      } catch (err) {
        res.status(500).json({ error: 'Ошибка поиска' });
      }
    });
  }).on('error', () => {
    res.status(500).json({ error: 'Сервер поиска недоступен' });
  });
});

// Скачивание из Audius
router.post('/download', (req, res) => {
  const { videoId, title, artist } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: 'Выбери трек' });
  }

  const streamUrl = `https://api.audius.co/v1/tracks/${videoId}/stream`;

  https.get(streamUrl, {
    headers: {
      'Accept': 'audio/mpeg',
      'User-Agent': 'MusikFree/1.0'
    }
  }, (response) => {
    if (response.statusCode === 302 || response.statusCode === 301) {
      https.get(response.headers.location, (redirectRes) => {
        pipeResponse(redirectRes, res, title, artist);
      }).on('error', () => {
        res.status(500).json({ error: 'Скачивание недоступно' });
      });
    } else {
      pipeResponse(response, res, title, artist);
    }
  }).on('error', () => {
    res.status(500).json({ error: 'Скачивание недоступно' });
  });
});

function pipeResponse(source, res, title, artist) {
  const chunks = [];
  source.on('data', chunk => chunks.push(chunk));
  source.on('end', () => {
    const buffer = Buffer.concat(chunks);
    const finalName = `${Date.now()}.mp3`;

    tracksStore.push({ 
      name: finalName, 
      title, 
      artist,
      buffer: buffer
    });

    res.json({
      success: true,
      fileUrl: `/api/stream/${finalName}`,
      title,
      artist,
      message: `Трек "${title}" скачан`
    });
  });
}

router.get('/tracks', (req, res) => {
  res.json(tracksStore.map(t => ({ 
    name: t.name, 
    url: `/api/stream/${t.name}`, 
    title: t.title, 
    artist: t.artist 
  })));
});

router.get('/stream/:name', (req, res) => {
  const track = tracksStore.find(t => t.name === req.params.name);
  if (!track) {
    return res.status(404).json({ error: 'Трек не найден' });
  }

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Length', track.buffer.length);
  res.send(track.buffer);
});

router.delete('/track/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  tracksStore = tracksStore.filter(t => t.name !== name);
  res.json({ success: true, message: 'Трек удалён' });
});

module.exports = router;