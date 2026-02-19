const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../db');
const { generateUserId } = require('../utils/userId');
const { logActivity } = require('../utils/logger');
const { validatePasswordStrength } = require('../utils/password');
const { sendResetPasswordEmail } = require('../utils/mailer');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { name, username, email, password, agree } = req.body;
  if (!agree) return res.status(400).json({ error: 'Please accept terms and conditions.' });
  if (!name || !username || !email || !password) return res.status(400).json({ error: 'All fields are required.' });
  const passwordError = validatePasswordStrength(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  try {
    const [[existingUser]] = await pool.query(
      'SELECT user_id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );
    if (existingUser) return res.status(409).json({ error: 'Username or email already exists.' });

    const user_id = await generateUserId();
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (user_id, name, username, email, password_hash) VALUES (?,?,?,?,?)',
      [user_id, name, username, email, hash]
    );
    try {
      await logActivity({ user_id, action_type: 'REGISTER', description: 'User registered' });
    } catch (logErr) {
      console.warn('Activity log failed for REGISTER:', logErr);
    }

    res.json({ message: 'Registered successfully, please log in.', user_id });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username or email already exists.' });
    }
    const msg = err.sqlMessage || err.message || 'Registration failed';
    console.error('Register error:', err);
    res.status(500).json({ error: msg });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const [[user]] = await pool.query(
      'SELECT user_id, email FROM users WHERE email = ? AND is_active = 1 LIMIT 1',
      [email]
    );

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      await pool.query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
        [user.user_id, tokenHash]
      );

      const appBase = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
      const resetLink = `${appBase}/index.html?reset_token=${token}&email=${encodeURIComponent(user.email)}`;
      await sendResetPasswordEmail({ to: user.email, resetLink });

      try {
        await logActivity({
          user_id: user.user_id,
          action_type: 'REQUEST_PASSWORD_RESET',
          description: 'Requested password reset'
        });
      } catch (logErr) {
        console.warn('Activity log failed for REQUEST_PASSWORD_RESET:', logErr);
      }
    }

    res.json({ message: 'If the email exists, a password reset link has been sent.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process forgot password request' });
  }
});

router.post('/reset-password', async (req, res) => {
  const { email, token, newPassword } = req.body;
  if (!email || !token || !newPassword) {
    return res.status(400).json({ error: 'Email, token, and new password are required.' });
  }

  const passwordError = validatePasswordStrength(newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });

  try {
    const [[user]] = await pool.query('SELECT user_id FROM users WHERE email = ? AND is_active = 1 LIMIT 1', [email]);
    if (!user) return res.status(400).json({ error: 'Invalid or expired reset link.' });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [[resetRow]] = await pool.query(
      `SELECT reset_id FROM password_resets
       WHERE user_id = ? AND token_hash = ? AND used_at IS NULL AND expires_at > NOW()
       ORDER BY reset_id DESC LIMIT 1`,
      [user.user_id, tokenHash]
    );

    if (!resetRow) return res.status(400).json({ error: 'Invalid or expired reset link.' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE user_id = ?', [newHash, user.user_id]);
    await pool.query('UPDATE password_resets SET used_at = NOW() WHERE reset_id = ?', [resetRow.reset_id]);

    await logActivity({
      user_id: user.user_id,
      action_type: 'RESET_PASSWORD',
      description: 'Password reset completed'
    });

    res.json({ message: 'Password reset successful. You can now log in.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) return res.status(400).json({ error: 'Missing credentials' });
  try {
    const [[user]] = await pool.query(
      'SELECT * FROM users WHERE (username = ? OR email = ?) AND is_active = 1 LIMIT 1',
      [identifier, identifier]
    );
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.user = {
      user_id: user.user_id,
      name: user.name,
      username: user.username,
      email: user.email
    };
    await logActivity({ user_id: user.user_id, action_type: 'LOGIN', description: 'User logged in' });
    res.json({ user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', async (req, res) => {
  const user = req.session.user;
  req.session.destroy(async () => {
    if (user) await logActivity({ user_id: user.user_id, action_type: 'LOGOUT', description: 'User logged out' });
    res.json({ message: 'Logged out' });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ user: req.session.user });
});

module.exports = router;
