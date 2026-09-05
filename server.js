const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/downloads', express.static('downloads'));

if (!fs.existsSync('./downloads')) {
  fs.mkdirSync('./downloads');
}

if (!fs.existsSync('./data')) {
  fs.mkdirSync('./data');
}

app.use('/api', require('./routes/api'));
app.use('/api/auth', require('./routes/auth'));

app.listen(PORT, () => {
  console.log(`Musik Free запущен: http://localhost:${PORT}`);
});