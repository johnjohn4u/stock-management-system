USE db_1800soles_stock_management;

DELETE FROM activity_log;
DELETE FROM pairs;
DELETE FROM items;
DELETE FROM users;

INSERT INTO users (user_id, name, username, email, password_hash)
--VALUES
--('20260002', 'Cruz, Giane Marc A.', 'giane.marc', 'g@gmail.com', '$2b$10$nvmJQkBbkrKmFe4a/BQfnecvKSBgLfQssi908TWnUjJIBdLbM8Z2W');

-- Helper: brand ids
SET @nike := (SELECT brand_id FROM brands WHERE brand_name='Nike');
SET @adidas := (SELECT brand_id FROM brands WHERE brand_name='Adidas');
SET @puma := (SELECT brand_id FROM brands WHERE brand_name='Puma');
SET @nb := (SELECT brand_id FROM brands WHERE brand_name='New Balance');
SET @others := (SELECT brand_id FROM brands WHERE brand_name='Others');

INSERT INTO items (item_name, sku, colorway, brand_id, target_qty, item_condition, status, last_movement_type, last_movement_at)
VALUES
('Nike Dunk Low', 'DD1391-100', 'Orange Paisley', @nike, 10, 'Brand New', 'IN_STOCK', 'STOCK_IN', '2020-02-11 10:00:00'),
('Jordan 4', 'DC7770-160', 'Fire Red', @nike, 8, 'Brand New', 'WAITING_STOCK', 'SOLD', '2024-12-15 10:30:00'),
('Nike Vomero 5', 'FB1309-001', 'Platinum Tint', @nike, 8, 'Brand New', 'WAITING_STOCK', 'STOCK_IN', '2020-03-02 09:00:00'),
('Nmd R1', 'FV8727', 'Og White', @adidas, 6, 'Brand New', 'WAITING_STOCK', 'STOCK_OUT', '2021-11-11 15:00:00');

-- capture ids
SET @item1 := LAST_INSERT_ID(); -- actually this gets last only; need each id using SELECT
SET @item1 := (SELECT item_id FROM items WHERE sku='DD1391-100');
SET @item2 := (SELECT item_id FROM items WHERE sku='DC7770-160');
SET @item3 := (SELECT item_id FROM items WHERE sku='FB1309-001');
SET @item4 := (SELECT item_id FROM items WHERE sku='FV8727');

INSERT INTO pairs (pair_code, item_id, us_size, pair_condition, cost_price, selling_price, status, sold_at, sold_price)
VALUES
('P-001', @item1, '7M', 'New', 2000.00, 2500.00, 'AVAILABLE', NULL, NULL),
('P-002', @item1, '8M', 'New', 2200.00, 2700.00, 'AVAILABLE', NULL, NULL),
('P-005', @item1, '8M', 'New', 2200.00, 2700.00, 'AVAILABLE', NULL, NULL),
('P-006', @item1, '8M', 'New', 2200.00, 2700.00, 'AVAILABLE', NULL, NULL),

('P-010', @item2, '7M', 'New', 3000.00, 8000.00, 'SOLD', '2024-12-15 10:30:00', 8000.00),

('P-020', @item3, '7M', 'New', 2300.00, 2900.00, 'AVAILABLE', NULL, NULL),

('P-030', @item4, '9M', 'New', 2400.00, 3100.00, 'AVAILABLE', NULL, NULL);

INSERT INTO activity_log (user_id, action_type, item_id, pair_id, quantity, sold_price, description, timestamp)
VALUES
('20260002', 'STOCK_IN', @item1, (SELECT pair_id FROM pairs WHERE pair_code='P-001'), 1, NULL, 'Stocked in pair P-001', '2020-02-11 10:00:00'),
('20260002', 'STOCK_IN', @item1, (SELECT pair_id FROM pairs WHERE pair_code='P-002'), 1, NULL, 'Stocked in pair P-002', '2020-02-11 10:05:00'),
('20260002', 'STOCK_IN', @item1, (SELECT pair_id FROM pairs WHERE pair_code='P-005'), 1, NULL, 'Stocked in pair P-005', '2020-02-11 10:10:00'),
('20260002', 'STOCK_IN', @item1, (SELECT pair_id FROM pairs WHERE pair_code='P-006'), 1, NULL, 'Stocked in pair P-006', '2020-02-11 10:15:00'),

('20260002', 'SOLD', @item2, (SELECT pair_id FROM pairs WHERE pair_code='P-010'), 1, 8000.00, 'Pair sold', '2024-12-15 10:30:00'),

('20260002', 'STOCK_IN', @item3, (SELECT pair_id FROM pairs WHERE pair_code='P-020'), 1, NULL, 'Stocked in pair P-020', '2020-03-02 09:00:00'),

('20260002', 'STOCK_IN', @item4, (SELECT pair_id FROM pairs WHERE pair_code='P-030'), 1, NULL, 'Stocked in pair P-030', '2021-11-11 15:00:00');
