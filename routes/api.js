const express = require('express');
const router = express.Router();
const https = require('https');

let tracksStore = [];

// Поиск через Jamendo (полные треки)
router.post('/search', (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Введи название трека или строчку' });
  }

  const clientId = '56d30c95';
  const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${clientId}&format=json&search=${encodeURIComponent(query)}&limit=10`;

  https.get(url, (response) => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => {
      try {
        const json = JSON.parse(data);
        const results = (json.results || []).map(item => ({
          title: item.name || 'Без названия',
          artist: item.artist_name || 'Неизвестен',
          videoId: item.audio || '',
          duration: Math.round(item.duration || 0),
          coverUrl: item.album_image || ''
        })).filter(r => r.videoId);

        res.json({ success: true, results });
      } catch (err) {
        res.status(500).json({ error: 'Ошибка поиска' });
      }
    });
  }).on('error', () => {
    res.status(500).json({ error: 'Сервер поиска недоступен' });
  });
});

router.post('/download', (req, res) => {
  const { videoId, title, artist } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: 'Выбери трек' });
  }

  const finalName = `${Date.now()}.mp3`;

  https.get(videoId, (response) => {
    if (response.statusCode === 302 || response.statusCode === 301) {
      https.get(response.headers.location, (redirectRes) => {
        pipeResponse(redirectRes, res, finalName, title, artist);
      }).on('error', () => {
        res.status(500).json({ error: 'Скачивание недоступно' });
      });
    } else {
      pipeResponse(response, res, finalName, title, artist);
    }
  }).on('error', () => {
    res.status(500).json({ error: 'Скачивание недоступно' });
  });
});

function pipeResponse(source, res, finalName, title, artist) {
  const chunks = [];
  source.on('data', chunk => chunks.push(chunk));
  source.on('end', () => {
    const buffer = Buffer.concat(chunks);

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