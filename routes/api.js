const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const iconv = require('iconv-lite');

// Поиск только музыки
router.post('/search', (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Введи название трека или строчку' });
  }

  const command = `yt-dlp --flat-playlist --print "%(title)s|%(uploader)s|%(id)s|%(duration)s" "ytsearch20:${query} audio"`;

  exec(command, { timeout: 30000, encoding: 'buffer' }, (error, stdout, stderr) => {
    if (error) {
      console.error(stderr ? stderr.toString() : error);
      return res.status(500).json({ error: 'Ошибка поиска' });
    }

    const output = iconv.decode(stdout, 'win1251');

    const results = output
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
      .filter(r => r.duration > 60 && r.duration < 600) // Только треки 1-10 минут
      .filter(r => r.title.length < 80) // Убираем длинные названия
      .slice(0, 5); // Только 5 результатов

    res.json({ success: true, results });
  });
});

router.post('/download', (req, res) => {
  const { videoId, title, artist } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: 'Выбери трек' });
  }

  const finalName = `${Date.now()}.mp3`;
  const finalPath = path.join(__dirname, '..', 'downloads', finalName);

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const command = `yt-dlp -x --audio-format mp3 --ffmpeg-location "${ffmpegPath}" --write-thumbnail --convert-thumbnails jpg -o "${finalPath}" "${url}"`;

  exec(command, { timeout: 120000, encoding: 'buffer' }, (error, stdout, stderr) => {
    if (error) {
      console.error(stderr ? stderr.toString() : error);
      return res.status(500).json({ error: 'Не удалось скачать трек' });
    }

    res.json({
      success: true,
      fileUrl: `/downloads/${finalName}`,
      coverUrl: fs.existsSync(finalPath + '.jpg') 
        ? `/downloads/${finalName}.jpg` 
        : null,
      title: title,
      artist: artist,
      message: `Трек "${title}" скачан`
    });
  });
});

router.get('/tracks', (req, res) => {
  const dir = path.join(__dirname, '..', 'downloads');
  fs.readdir(dir, (err, files) => {
    if (err) return res.json([]);
    const tracks = files
      .filter(f => f.endsWith('.mp3') && !f.endsWith('.mp3.jpg'))
      .map(f => {
        const base = f.replace('.mp3', '');
        const cover = files.includes(base + '.mp3.jpg') 
          ? `/downloads/${encodeURIComponent(base + '.mp3.jpg')}` 
          : null;
        return {
          name: base,
          url: `/downloads/${encodeURIComponent(f)}`,
          coverUrl: cover
        };
      });
    res.json(tracks);
  });
});

router.delete('/track/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const dir = path.join(__dirname, '..', 'downloads');

  fs.readdir(dir, (err, files) => {
    if (err) return res.status(500).json({ error: 'Ошибка чтения папки' });

    const mp3File = files.find(f => f === name + '.mp3');
    const jpgFile = files.find(f => f === name + '.mp3.jpg');

    if (!mp3File) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    fs.unlink(path.join(dir, mp3File), (err) => {
      if (err) return res.status(500).json({ error: 'Не удалось удалить трек' });

      if (jpgFile) {
        fs.unlink(path.join(dir, jpgFile), () => {});
      }

      res.json({ success: true, message: 'Трек удалён' });
    });
  });
});

module.exports = router;