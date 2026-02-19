const pool = require('../db');

async function recomputeItemStatus(itemId) {
  const [[item]] = await pool.query(
    `SELECT item_id, target_qty FROM items WHERE item_id = ? AND is_deleted = 0`,
    [itemId]
  );
  if (!item) return null;
  const [[counts]] = await pool.query(
    `SELECT 
        SUM(CASE WHEN status='AVAILABLE' AND is_deleted=0 THEN 1 ELSE 0 END) AS available_count,
        SUM(CASE WHEN status='SOLD' AND is_deleted=0 THEN 1 ELSE 0 END) AS sold_count
     FROM pairs WHERE item_id = ?`,
    [itemId]
  );
  const available = counts.available_count || 0;
  const threshold = item.target_qty * 0.25;
  const status = available <= threshold ? 'WAITING_STOCK' : 'IN_STOCK';
  await pool.query(`UPDATE items SET status = ?, updated_at = NOW() WHERE item_id = ?`, [status, itemId]);
  return { status, available, sold: counts.sold_count || 0 };
}

module.exports = { recomputeItemStatus };
