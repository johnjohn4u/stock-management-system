const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const { recomputeItemStatus } = require('../utils/status');

const router = express.Router();

router.use(requireAuth);

async function nextPairCode() {
  const [[row]] = await pool.query(`SELECT pair_code FROM pairs ORDER BY pair_id DESC LIMIT 1`);
  if (!row || !row.pair_code) return 'P-001';
  const num = parseInt(row.pair_code.replace(/\D/g, ''), 10) + 1;
  return `P-${String(num).padStart(3, '0')}`;
}

router.get('/item/:itemId', async (req, res) => {
  const { itemId } = req.params;
  try {
    const [pairs] = await pool.query(
      `SELECT pair_id, pair_code, us_size, pair_condition, cost_price, selling_price, status, sold_at, sold_price
       FROM pairs WHERE item_id=? AND is_deleted=0`,
      [itemId]
    );
    res.json({ pairs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch pairs' });
  }
});

router.post('/item/:itemId', async (req, res) => {
  const { itemId } = req.params;
  const { us_size, pair_condition, cost_price, selling_price } = req.body;
  if (!us_size || !pair_condition || !cost_price || !selling_price) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const code = await nextPairCode();
    const [result] = await pool.query(
      `INSERT INTO pairs (pair_code, item_id, us_size, pair_condition, cost_price, selling_price)
       VALUES (?,?,?,?,?,?)`,
      [code, itemId, us_size, pair_condition, cost_price, selling_price]
    );
    await pool.query(
      `UPDATE items SET last_movement_type='STOCK_IN', last_movement_at=NOW() WHERE item_id=?`,
      [itemId]
    );
    const statusInfo = await recomputeItemStatus(itemId);
    await logActivity({
      user_id: req.session.user.user_id,
      action_type: 'STOCK_IN',
      item_id: itemId,
      pair_id: result.insertId,
      quantity: 1,
      description: 'Stocked in new pair'
    });
    res.json({ pair_id: result.insertId, pair_code: code, status: statusInfo?.status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add pair' });
  }
});

router.put('/:pairId', async (req, res) => {
  const { pairId } = req.params;
  const { us_size, pair_condition, cost_price, selling_price } = req.body;
  try {
    await pool.query(
      `UPDATE pairs SET us_size=?, pair_condition=?, cost_price=?, selling_price=?, updated_at=NOW()
       WHERE pair_id=? AND is_deleted=0`,
      [us_size, pair_condition, cost_price, selling_price, pairId]
    );
    const [[pair]] = await pool.query('SELECT item_id FROM pairs WHERE pair_id=?', [pairId]);
    if (pair) {
      await pool.query(
        `UPDATE items SET last_movement_type='EDITED', last_movement_at=NOW() WHERE item_id=?`,
        [pair.item_id]
      );
      await recomputeItemStatus(pair.item_id);
    }
    await logActivity({
      user_id: req.session.user.user_id,
      action_type: 'EDIT_PAIR',
      pair_id: pairId,
      item_id: pair ? pair.item_id : null,
      description: 'Edited pair details'
    });
    res.json({ message: 'Pair updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to edit pair' });
  }
});

router.post('/:pairId/mark-sold', async (req, res) => {
  const { pairId } = req.params;
  const { sold_price } = req.body;
  try {
    const [[pair]] = await pool.query(
      `SELECT p.*, i.item_id, i.target_qty FROM pairs p JOIN items i ON p.item_id=i.item_id WHERE p.pair_id=?`,
      [pairId]
    );
    if (!pair) return res.status(404).json({ error: 'Pair not found' });
    const priceToUse = sold_price || pair.selling_price;
    await pool.query(
      `UPDATE pairs SET status='SOLD', sold_at=NOW(), sold_price=? WHERE pair_id=?`,
      [priceToUse, pairId]
    );
    await pool.query(
      `UPDATE items SET last_movement_type='SOLD', last_movement_at=NOW() WHERE item_id=?`,
      [pair.item_id]
    );
    await recomputeItemStatus(pair.item_id);
    await logActivity({
      user_id: req.session.user.user_id,
      action_type: 'MARK_SOLD',
      item_id: pair.item_id,
      pair_id: pairId,
      quantity: 1,
      sold_price: priceToUse,
      description: 'Pair marked sold'
    });
    res.json({ message: 'Pair marked as sold' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark sold' });
  }
});

router.delete('/:pairId', async (req, res) => {
  const { pairId } = req.params;
  try {
    await pool.query('UPDATE pairs SET is_deleted=1 WHERE pair_id=?', [pairId]);
    const [[pair]] = await pool.query('SELECT item_id FROM pairs WHERE pair_id=?', [pairId]);
    if (pair) {
      await recomputeItemStatus(pair.item_id);
    }
    await logActivity({
      user_id: req.session.user.user_id,
      action_type: 'DELETE_PAIR',
      pair_id: pairId,
      item_id: pair ? pair.item_id : null,
      description: 'Deleted pair'
    });
    res.json({ message: 'Pair deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete pair' });
  }
});

module.exports = router;
