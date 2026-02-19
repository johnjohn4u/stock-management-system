const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/summary', async (_req, res) => {
  try {
    const [[sales]] = await pool.query(`SELECT SUM(sold_price) AS total_sales,
      SUM(sold_price - cost_price) AS total_profit,
      COUNT(*) AS sold_pairs
      FROM pairs WHERE status='SOLD' AND is_deleted=0`);

    const [[inventory]] = await pool.query(`SELECT SUM(cost_price) AS inventory_value, COUNT(*) AS available_pairs
      FROM pairs WHERE status='AVAILABLE' AND is_deleted=0`);

    const [[itemsCount]] = await pool.query(`SELECT 
      COUNT(*) AS total_items,
      SUM(CASE WHEN status='IN_STOCK' THEN 1 ELSE 0 END) AS in_stock,
      SUM(CASE WHEN status='WAITING_STOCK' THEN 1 ELSE 0 END) AS waiting_stock
      FROM items WHERE is_deleted=0`);

    const totalPairs = (sales.sold_pairs || 0) + (inventory.available_pairs || 0);
    const sell_through_rate = totalPairs === 0 ? 0 : ((sales.sold_pairs || 0) / totalPairs) * 100;

    res.json({
      total_sales: sales.total_sales || 0,
      total_profit: sales.total_profit || 0,
      inventory_value: inventory.inventory_value || 0,
      sell_through_rate,
      total_items: itemsCount.total_items || 0,
      in_stock: itemsCount.in_stock || 0,
      waiting_stock: itemsCount.waiting_stock || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load summary' });
  }
});

router.get('/charts', async (_req, res) => {
  try {
    const [movement] = await pool.query(
      `SELECT DATE(timestamp) as date, 
        SUM(CASE WHEN action_type='MARK_SOLD' OR action_type='SOLD' THEN 1 ELSE 0 END) AS sold,
        SUM(CASE WHEN action_type='STOCK_IN' THEN 1 ELSE 0 END) AS stock_in
       FROM activity_log
       GROUP BY DATE(timestamp)
       ORDER BY DATE(timestamp) ASC`
    );

    const [sizes] = await pool.query(
      `SELECT us_size, COUNT(*) as count
       FROM pairs WHERE status='AVAILABLE' AND is_deleted=0
       GROUP BY us_size`
    );

    const [brands] = await pool.query(
      `SELECT b.brand_name, COUNT(*) as count
       FROM pairs p
       JOIN items i ON p.item_id = i.item_id
       JOIN brands b ON i.brand_id = b.brand_id
       WHERE p.status='AVAILABLE' AND p.is_deleted=0 AND i.is_deleted=0
       GROUP BY b.brand_name`
    );

    const [ages] = await pool.query(
      `SELECT
          SUM(CASE WHEN DATEDIFF(NOW(), created_at) BETWEEN 0 AND 30 THEN 1 ELSE 0 END) AS days_0_30,
          SUM(CASE WHEN DATEDIFF(NOW(), created_at) BETWEEN 31 AND 60 THEN 1 ELSE 0 END) AS days_31_60,
          SUM(CASE WHEN DATEDIFF(NOW(), created_at) BETWEEN 61 AND 90 THEN 1 ELSE 0 END) AS days_61_90,
          SUM(CASE WHEN DATEDIFF(NOW(), created_at) > 90 THEN 1 ELSE 0 END) AS days_90_plus
       FROM pairs
       WHERE status='AVAILABLE' AND is_deleted=0`
    );

    res.json({ movement, sizes, brands, ages: ages[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load charts' });
  }
});

module.exports = router;
