const express = require('express');
const router = express.Router();
const https = require('https');
const { exec } = require('child_process');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');

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

router.post('/download', async (req, res) => {
  const { videoId, title, artist } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: 'Выбери трек' });
  }

  try {
    const streamUrl = `https://api.music.yandex.net/tracks/${videoId}/stream`;
    
    https.get(streamUrl, {
      headers: {
        'Authorization': `OAuth ${yandexToken}`,
        'X-Yandex-Music-Client': 'YandexMusicAPI'
      }
    }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        https.get(response.headers.location, (redirectRes) => {
          downloadAndConvert(redirectRes, res, title, artist);
        }).on('error', () => {
          res.status(500).json({ error: 'Скачивание недоступно' });
        });
      } else {
        downloadAndConvert(response, res, title, artist);
      }
    }).on('error', () => {
      res.status(500).json({ error: 'Скачивание недоступно' });
    });
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Скачивание недоступно' });
  }
});

function downloadAndConvert(source, res, title, artist) {
  const chunks = [];
  source.on('data', chunk => chunks.push(chunk));
  source.on('end', () => {
    const buffer = Buffer.concat(chunks);
    const tempName = `/tmp/${Date.now()}.m4a`;
    const finalName = `${Date.now()}.mp3`;
    const finalPath = `/tmp/${finalName}`;

    fs.writeFileSync(tempName, buffer);

    const command = `"${ffmpegPath}" -i ${tempName} -codec:a libmp3lame -qscale:a 2 ${finalPath}`;

    exec(command, (error) => {
      if (error) {
        console.error('ffmpeg error:', error);
        tracksStore.push({ 
          name: finalName, 
          title, 
          artist,
          buffer: buffer
        });
      } else {
        const mp3Buffer = fs.readFileSync(finalPath);
        tracksStore.push({ 
          name: finalName, 
          title, 
          artist,
          buffer: mp3Buffer
        });
        try {
          fs.unlinkSync(tempName);
          fs.unlinkSync(finalPath);
        } catch(e) {}
      }

      res.json({
        success: true,
        fileUrl: `/api/stream/${finalName}`,
        title,
        artist,
        message: `Трек "${title}" скачан`
      });
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