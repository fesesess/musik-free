const express = require('express');
const router = express.Router();
const path = require('path');
const { exec } = require('child_process');

let tracksStore = [];

router.post('/search', (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Введи название трека или строчку' });
  }

  const ytdlpPath = path.join(__dirname, '..', 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp.exe');
  const command = `"${ytdlpPath}" --flat-playlist --print "%(title)s|%(uploader)s|%(id)s|%(duration)s" "ytsearch10:${query} audio"`;

  exec(command, { timeout: 30000, encoding: 'utf8' }, (error, stdout, stderr) => {
    if (error) {
      console.error('yt-dlp error:', stderr || error);
      return res.status(500).json({ error: 'Поиск недоступен' });
    }

    const results = stdout
      .split('\n')
      .filter(line => line.includes('|'))
      .map(line => {
        const parts = line.split('|');
        return {
          title: parts[0] || 'Без названия',
          artist: parts[1] || 'Неизвестен',
          videoId: parts[2] || '',
          duration: parseInt(parts[3]) || 0
        };
      })
      .filter(r => r.videoId)
      .filter(r => r.duration > 60 && r.duration < 600)
      .filter(r => r.title.length < 80)
      .slice(0, 5);

    res.json({ success: true, results });
  });
});

router.post('/download', (req, res) => {
  const { videoId, title, artist } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: 'Выбери трек' });
  }

  const finalName = `${Date.now()}.mp3`;
  const finalPath = path.join('/tmp', finalName);
  const ytdlpPath = path.join(__dirname, '..', 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp.exe');

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const command = `"${ytdlpPath}" -x --audio-format mp3 -o "${finalPath}" "${url}"`;

  exec(command, { timeout: 120000, encoding: 'utf8' }, (error, stdout, stderr) => {
    if (error) {
      console.error('download error:', stderr || error);
      return res.status(500).json({ error: 'Скачивание недоступно' });
    }

    const fileUrl = `/downloads/${finalName}`;
    tracksStore.push({ name: finalName, url: fileUrl, title, artist });

    res.json({
      success: true,
      fileUrl,
      title,
      artist,
      message: `Трек "${title}" скачан`
    });
  });
});

router.get('/tracks', (req, res) => {
  res.json(tracksStore);
});

router.delete('/track/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  tracksStore = tracksStore.filter(t => t.name !== name);
  res.json({ success: true, message: 'Трек удалён' });
});

module.exports = router;