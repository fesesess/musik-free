const express = require('express');
const router = express.Router();
const https = require('https');

let tracksStore = [];

router.post('/search', async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Введи название трека или строчку' });
  }

  try {
    const audiusResults = await searchAudius(query);
    const itunesResults = await searchItunes(query);
    
    const allResults = [...audiusResults, ...itunesResults];
    
    res.json({ success: true, results: allResults });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

function searchAudius(query) {
  return new Promise((resolve) => {
    const url = `https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&limit=10`;

    https.get(url, {
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
            source: 'Audius',
            isFull: true
          })).filter(r => r.videoId);
          resolve(results);
        } catch (err) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

function searchItunes(query) {
  return new Promise((resolve) => {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=5`;

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
            duration: 30,
            source: 'iTunes',
            isFull: false
          })).filter(r => r.videoId);
          resolve(results);
        } catch (err) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

router.post('/download', (req, res) => {
  const { videoId, title, artist, source } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: 'Выбери трек' });
  }

  if (source === 'Audius') {
    downloadAudius(videoId, title, artist, res);
  } else {
    downloadItunes(videoId, title, artist, res);
  }
});

function downloadAudius(videoId, title, artist, res) {
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
}

function downloadItunes(videoId, title, artist, res) {
  https.get(videoId, (response) => {
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
}

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