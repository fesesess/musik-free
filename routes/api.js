const express = require('express');
const router = express.Router();
const https = require('https');

let tracksStore = [];

// Поиск через iTunes API (бесплатно, без блокировок)
router.post('/search', (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Введи название трека или строчку' });
  }

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=10`;

  https.get(url, (response) => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => {
      try {
        const json = JSON.parse(data);
        const results = json.results.map(item => ({
          title: item.trackName || 'Без названия',
          artist: item.artistName || 'Неизвестен',
          videoId: item.previewUrl || '',
          duration: Math.round((item.trackTimeMillis || 0) / 1000),
          coverUrl: item.artworkUrl100 || ''
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

// Скачивание превью из iTunes
router.post('/download', (req, res) => {
  const { videoId, title, artist } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: 'Выбери трек' });
  }

  const finalName = `${Date.now()}.m4a`;

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
    const fileUrl = `/downloads/${finalName}`;
    tracksStore.push({ 
      name: finalName, 
      url: fileUrl, 
      title, 
      artist,
      buffer: buffer.toString('base64')
    });

    res.json({
      success: true,
      fileUrl,
      title,
      artist,
      message: `Трек "${title}" скачан`
    });
  });
}

router.get('/tracks', (req, res) => {
  res.json(tracksStore.map(t => ({ name: t.name, url: t.url, title: t.title, artist: t.artist })));
});

router.get('/stream/:name', (req, res) => {
  const track = tracksStore.find(t => t.name === req.params.name);
  if (!track) {
    return res.status(404).json({ error: 'Трек не найден' });
  }

  const buffer = Buffer.from(track.buffer, 'base64');
  res.setHeader('Content-Type', 'audio/mp4');
  res.send(buffer);
});

router.delete('/track/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  tracksStore = tracksStore.filter(t => t.name !== name);
  res.json({ success: true, message: 'Трек удалён' });
});

module.exports = router;