const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');

// Храним пользователей в памяти
let users = [];

router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Введи логин и пароль' });
  }

  if (username.length < 3 || password.length < 4) {
    return res.status(400).json({ error: 'Логин минимум 3 символа, пароль минимум 4' });
  }

  if (users.some(u => u.username === username)) {
    return res.status(400).json({ error: 'Пользователь уже существует' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  users.push({
    username,
    password: hashedPassword,
    createdAt: new Date().toISOString()
  });

  res.json({ success: true, message: 'Регистрация успешна' });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Введи логин и пароль' });
  }

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