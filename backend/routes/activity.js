const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const limit = parseInt(req.query.limit || '50', 10);
  try {
    const [rows] = await pool.query(
      `SELECT al.*, i.item_name, i.colorway, p.us_size, b.brand_name
       FROM activity_log al
       LEFT JOIN items i ON al.item_id = i.item_id
       LEFT JOIN pairs p ON al.pair_id = p.pair_id
       LEFT JOIN brands b ON i.brand_id = b.brand_id
       ORDER BY al.timestamp DESC
       LIMIT ?`,
      [limit]
    );
    const activity = rows.map(r => ({
      log_id: r.log_id,
      timestamp: r.timestamp,
      action_type: r.action_type,
      item_display: r.item_name ? `${r.item_name}${r.colorway ? ' ' + r.colorway : ''}${r.us_size ? ' ' + r.us_size : ''}` : '',
      quantity: r.quantity,
      sold_price: r.sold_price,
      brand_name: r.brand_name
    }));
    res.json({ activity });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

module.exports = router;
