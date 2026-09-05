const express = require('express');
const router = express.Router();
const https = require('https');
const YandexMusicApi = require('yandex-music-api');

let tracksStore = [];

const yandexSessionId = process.env.YANDEX_SESSION_ID || '';
const yandexUid = process.env.YANDEX_UID || '';

function createApi() {
  const api = new YandexMusicApi();
  
  if (yandexSessionId && yandexUid) {
    api.headers = {
      'X-Yandex-Music-Client': 'YandexMusicAPI',
      'Cookie': `Session_id=${yandexSessionId}; yandexuid=${yandexUid}`
    };
  }
  
  return api;
}

router.post('/search', async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Введи название трека или строчку' });
  }

  try {
    const api = createApi();
    const searchResult = await api.searchTracks(query);
    
    const results = (searchResult.tracks?.results || []).slice(0, 10).map(track => ({
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

router.post('/download', async (req, res) => {
  const { videoId, title, artist } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: 'Выбери трек' });
  }

  try {
    const api = createApi();
    const downloadUrl = await api.getTrackDownloadUrl(videoId);
    
    if (!downloadUrl) {
      return res.status(500).json({ error: 'Не удалось получить ссылку' });
    }

    https.get(downloadUrl, (response) => {
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
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Скачивание недоступно' });
  }
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