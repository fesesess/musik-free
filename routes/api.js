const express = require('express');
const router = express.Router();
const https = require('https');

let tracksStore = [];

const SOUNDCLOUD_CLIENT_ID = 'iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX';

// Поиск в нескольких источниках
router.post('/search', async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Введи название трека или строчку' });
  }

  try {
    const audiusResults = await searchAudius(query);
    const jamendoResults = await searchJamendo(query);
    const soundcloudResults = await searchSoundCloud(query);
    
    const allResults = [...soundcloudResults, ...audiusResults, ...jamendoResults];
    
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
            source: 'Audius'
          })).filter(r => r.videoId && r.duration > 60);
          resolve(results);
        } catch (err) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

function searchJamendo(query) {
  return new Promise((resolve) => {
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
            videoId: item.id || '',
            duration: Math.round(item.duration || 0),
            source: 'Jamendo',
            audioUrl: item.audio || ''
          })).filter(r => r.videoId && r.duration > 60);
          resolve(results);
        } catch (err) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

function searchSoundCloud(query) {
  return new Promise((resolve) => {
    const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${SOUNDCLOUD_CLIENT_ID}&limit=10`;

    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json'
      }
    }, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          const json = JSON.parse(data);
          const results = (json.collection || []).map(item => ({
            title: item.title || 'Без названия',
            artist: item.user?.username || 'Неизвестен',
            videoId: item.id || '',
            duration: Math.round((item.duration || 0) / 1000),
            source: 'SoundCloud'
          })).filter(r => r.videoId && r.duration > 60);
          resolve(results);
        } catch (err) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

// Скачивание
router.post('/download', (req, res) => {
  const { videoId, title, artist, source, audioUrl } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: 'Выбери трек' });
  }

  if (source === 'Jamendo' && audioUrl) {
    downloadFromUrl(audioUrl, res, title, artist);
  } else if (source === 'SoundCloud') {
    const streamUrl = `https://api-v2.soundcloud.com/tracks/${videoId}/stream?client_id=${SOUNDCLOUD_CLIENT_ID}`;
    downloadFromUrl(streamUrl, res, title, artist);
  } else {
    const streamUrl = `https://api.audius.co/v1/tracks/${videoId}/stream`;
    downloadFromUrl(streamUrl, res, title, artist);
  }
});

function downloadFromUrl(url, res, title, artist) {
  https.get(url, {
    headers: {
      'Accept': 'audio/mpeg',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
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
  res.setHeader('Accept-Ranges', 'bytes');
  res.send(track.buffer);
});

router.delete('/track/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  tracksStore = tracksStore.filter(t => t.name !== name);
  res.json({ success: true, message: 'Трек удалён' });
});

module.exports = router;