CREATE DATABASE IF NOT EXISTS db_1800soles_stock_management;
USE db_1800soles_stock_management;

CREATE TABLE IF NOT EXISTS users (
  user_id CHAR(8) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  is_active TINYINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS brands (
  brand_id INT AUTO_INCREMENT PRIMARY KEY,
  brand_name VARCHAR(50) NOT NULL UNIQUE
);

INSERT IGNORE INTO brands (brand_name) VALUES
('Nike'), ('Adidas'), ('Puma'), ('New Balance'), ('Others');

CREATE TABLE IF NOT EXISTS items (
  item_id INT AUTO_INCREMENT PRIMARY KEY,
  item_name VARCHAR(120) NOT NULL,
  sku VARCHAR(60) NOT NULL UNIQUE,
  colorway VARCHAR(80) NOT NULL,
  brand_id INT NOT NULL,
  target_qty INT NOT NULL DEFAULT 1,
  item_condition VARCHAR(30) NOT NULL DEFAULT 'Brand New',
  status ENUM('IN_STOCK','WAITING_STOCK') NOT NULL DEFAULT 'WAITING_STOCK',
  last_movement_type ENUM('STOCK_IN','SOLD','STOCK_OUT','EDITED','CREATED') NULL,
  last_movement_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  CONSTRAINT fk_items_brand FOREIGN KEY (brand_id) REFERENCES brands(brand_id)
);

CREATE TABLE IF NOT EXISTS pairs (
  pair_id INT AUTO_INCREMENT PRIMARY KEY,
  pair_code VARCHAR(20) NOT NULL UNIQUE,
  item_id INT NOT NULL,
  us_size VARCHAR(10) NOT NULL,
  pair_condition VARCHAR(30) NOT NULL DEFAULT 'New',
  cost_price DECIMAL(10,2) NOT NULL,
  selling_price DECIMAL(10,2) NOT NULL,
  status ENUM('AVAILABLE','SOLD') NOT NULL DEFAULT 'AVAILABLE',
  sold_at DATETIME NULL,
  sold_price DECIMAL(10,2) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  CONSTRAINT fk_pairs_item FOREIGN KEY (item_id) REFERENCES items(item_id)
);

CREATE TABLE IF NOT EXISTS activity_log (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id CHAR(8) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  item_id INT NULL,
  pair_id INT NULL,
  quantity INT NULL,
  sold_price DECIMAL(10,2) NULL,
  description VARCHAR(255) NULL,
  CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_log_item FOREIGN KEY (item_id) REFERENCES items(item_id),
  CONSTRAINT fk_log_pair FOREIGN KEY (pair_id) REFERENCES pairs(pair_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) PRIMARY KEY,
  expires BIGINT NOT NULL,
  data MEDIUMTEXT
);

CREATE TABLE IF NOT EXISTS password_resets (
  reset_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(8) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(user_id)
);
