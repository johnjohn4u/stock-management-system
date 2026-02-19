const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const { validatePasswordStrength } = require('../utils/password');

const router = express.Router();
router.use(requireAuth);

router.put('/profile', async (req, res) => {
  const { name, username, email } = req.body;
  if (!name || !username || !email) return res.status(400).json({ error: 'Name, username, and email are required' });
  try {
    const [[dup]] = await pool.query(
      'SELECT user_id FROM users WHERE (username = ? OR email = ?) AND user_id <> ?',
      [username, email, req.session.user.user_id]
    );
    if (dup) return res.status(409).json({ error: 'Username or email already exists.' });

    await pool.query(
      'UPDATE users SET name=?, username=?, email=?, updated_at=NOW() WHERE user_id=?',
      [name, username, email, req.session.user.user_id]
    );
    req.session.user.name = name;
    req.session.user.username = username;
    req.session.user.email = email;
    await logActivity({
      user_id: req.session.user.user_id,
      action_type: 'UPDATE_PROFILE',
      description: 'Profile updated'
    });
    res.json({ message: 'Profile updated', name, username, email });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username or email already exists.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.put('/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Missing passwords' });
  const passwordError = validatePasswordStrength(newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });
  try {
    const [[user]] = await pool.query('SELECT password_hash FROM users WHERE user_id=?', [req.session.user.user_id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password incorrect' });
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash=?, updated_at=NOW() WHERE user_id=?', [hash, req.session.user.user_id]);
    await logActivity({
      user_id: req.session.user.user_id,
      action_type: 'CHANGE_PASSWORD',
      description: 'Password changed'
    });
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

module.exports = router;
