const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const usersFile = path.join(__dirname, '..', 'data', 'users.json');

function readUsers() {
  if (!fs.existsSync(usersFile)) {
    return [];
  }
  const data = fs.readFileSync(usersFile, 'utf8');
  return JSON.parse(data || '[]');
}

function writeUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Введи логин и пароль' });
  }

  if (username.length < 3 || password.length < 4) {
    return res.status(400).json({ error: 'Логин минимум 3 символа, пароль минимум 4' });
  }

  const users = readUsers();

  if (users.some(u => u.username === username)) {
    return res.status(400).json({ error: 'Пользователь уже существует' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = {
    id: Date.now(),
    username,
    password: hashedPassword,
    createdAt: new Date().toISOString()
  };

  users.push(user);
  writeUsers(users);

  res.json({ success: true, message: 'Регистрация успешна' });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Введи логин и пароль' });
  }

  const users = readUsers();
  const user = users.find(u => u.username === username);

  if (!user) {
    return res.status(400).json({ error: 'Пользователь не найден' });
  }

  const passwordMatch = await bcrypt.compare(password, user.password);

  if (!passwordMatch) {
    return res.status(400).json({ error: 'Неверный пароль' });
  }

  res.json({ success: true, username: user.username, message: 'Вход выполнен' });
});

module.exports = router;