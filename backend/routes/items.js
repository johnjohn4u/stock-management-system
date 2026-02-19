const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const { recomputeItemStatus } = require('../utils/status');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const search = req.query.search ? `%${req.query.search}%` : '%';
  try {
    const [rows] = await pool.query(
      `SELECT i.*, b.brand_name,
              SUM(CASE WHEN p.status='AVAILABLE' AND p.is_deleted=0 THEN 1 ELSE 0 END) AS qty_available,
              SUM(CASE WHEN p.status='SOLD' AND p.is_deleted=0 THEN 1 ELSE 0 END) AS qty_sold
       FROM items i
       JOIN brands b ON i.brand_id = b.brand_id
       LEFT JOIN pairs p ON p.item_id = i.item_id AND p.is_deleted = 0
       WHERE i.is_deleted = 0 AND (
         i.item_name LIKE ? OR i.sku LIKE ? OR i.colorway LIKE ? OR b.brand_name LIKE ?
       )
       GROUP BY i.item_id
       ORDER BY i.created_at DESC`,
      [search, search, search, search]
    );

    const items = rows.map(r => {
      const qty_available = r.qty_available || 0;
      const status = qty_available <= r.target_qty * 0.25 ? 'WAITING_STOCK' : 'IN_STOCK';
      return {
        ...r,
        qty_available,
        qty_sold: r.qty_sold || 0,
        status
      };
    });

    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

router.post('/', async (req, res) => {
  const { item_name, sku, colorway, brand_id, target_qty } = req.body;
  if (!item_name || !sku || !colorway || !brand_id || !target_qty) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const [[dup]] = await pool.query('SELECT item_id FROM items WHERE sku = ?', [sku]);
    if (dup) return res.status(409).json({ error: 'Item with this SKU already exists' });

    const [result] = await pool.query(
      `INSERT INTO items (item_name, sku, colorway, brand_id, target_qty, status, last_movement_type, last_movement_at)
       VALUES (?,?,?,?,?,'WAITING_STOCK','CREATED',NOW())`,
      [item_name, sku, colorway, brand_id, target_qty]
    );
    const itemId = result.insertId;
    await logActivity({
      user_id: req.session.user.user_id,
      action_type: 'ADD_ITEM',
      item_id: itemId,
      description: `Added item ${item_name}`
    });
    res.json({ item_id: itemId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

router.put('/:itemId', async (req, res) => {
  const { itemId } = req.params;
  const { item_name, colorway, brand_id, target_qty } = req.body;
  try {
    await pool.query(
      `UPDATE items SET item_name=?, colorway=?, brand_id=?, target_qty=?, updated_at=NOW(), last_movement_type='EDITED', last_movement_at=NOW()
       WHERE item_id=? AND is_deleted=0`,
      [item_name, colorway, brand_id, target_qty, itemId]
    );
    await recomputeItemStatus(itemId);
    await logActivity({
      user_id: req.session.user.user_id,
      action_type: 'EDIT_ITEM',
      item_id: itemId,
      description: 'Edited item'
    });
    res.json({ message: 'Item updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to edit item' });
  }
});

router.delete('/:itemId', async (req, res) => {
  const { itemId } = req.params;
  try {
    await pool.query('UPDATE items SET is_deleted=1 WHERE item_id=?', [itemId]);
    await pool.query('UPDATE pairs SET is_deleted=1 WHERE item_id=?', [itemId]);
    await logActivity({
      user_id: req.session.user.user_id,
      action_type: 'DELETE_ITEM',
      item_id: itemId,
      description: 'Deleted item'
    });
    res.json({ message: 'Item deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

module.exports = router;
