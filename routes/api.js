const express = require('express');
const router = express.Router();
const https = require('https');

let tracksStore = [];

const yandexToken = process.env.YANDEX_SESSION_ID || '';

function yandexRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.music.yandex.net',
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `OAuth ${yandexToken}`,
        'X-Yandex-Music-Client': 'YandexMusicAPI',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

router.post('/search', async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Введи название трека или строчку' });
  }

  try {
    const searchResult = await yandexRequest(`/search?text=${encodeURIComponent(query)}&type=track&page=0&nocorrect=false`);
    
    const results = (searchResult.result?.tracks?.results || []).slice(0, 10).map(track => ({
      title: track.title || 'Без названия',
      artist: track.artists?.map(a => a.name).join(', ') || 'Неизвестен',
      videoId: track.id || '',
      duration: Math.round((track.durationMs || 0) / 1000),
      source: 'Яндекс Музыка'
    })).filter(r => r.videoId);

    res.json({ success: true, results });
  } catch (err) {
    console.error('Yandex error:', err);
    res.status(500).json({ error: 'Ошибка поиска в Яндекс Музыке' });
  }
});

// Добавляем трек в список без скачивания
router.post('/download', (req, res) => {
  const { videoId, title, artist } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: 'Выбери трек' });
  }

  const finalName = `${Date.now()}.m4a`;
  const streamUrl = `https://api.music.yandex.net/tracks/${videoId}/stream`;

  tracksStore.push({ 
    name: finalName, 
    title, 
    artist,
    streamUrl: streamUrl,
    yandexToken: yandexToken
  });

  res.json({
    success: true,
    fileUrl: `/api/stream/${finalName}`,
    title,
    artist,
    message: `Трек "${title}" добавлен`
  });
});

router.get('/tracks', (req, res) => {
  res.json(tracksStore.map(t => ({ 
    name: t.name, 
    url: `/api/stream/${t.name}`, 
    title: t.title, 
    artist: t.artist 
  })));
});

// Проксируем стрим из Яндекса
router.get('/stream/:name', (req, res) => {
  const track = tracksStore.find(t => t.name === req.params.name);
  if (!track) {
    return res.status(404).json({ error: 'Трек не найден' });
  }

  https.get(track.streamUrl, {
    headers: {
      'Authorization': `OAuth ${track.yandexToken}`,
      'X-Yandex-Music-Client': 'YandexMusicAPI'
    }
  }, (response) => {
    if (response.statusCode === 302 || response.statusCode === 301) {
      https.get(response.headers.location, (redirectRes) => {
        res.setHeader('Content-Type', redirectRes.headers['content-type'] || 'audio/mp4');
        redirectRes.pipe(res);
      }).on('error', () => {
        res.status(500).json({ error: 'Стрим недоступен' });
      });
    } else {
      res.setHeader('Content-Type', response.headers['content-type'] || 'audio/mp4');
      response.pipe(res);
    }
  }).on('error', () => {
    res.status(500).json({ error: 'Стрим недоступен' });
  });
});

router.delete('/track/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  tracksStore = tracksStore.filter(t => t.name !== name);
  res.json({ success: true, message: 'Трек удалён' });
});

module.exports = router;