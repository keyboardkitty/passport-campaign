const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'passport.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function init() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaign_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS merchants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      store_key TEXT UNIQUE NOT NULL,
      staff_code TEXT NOT NULL DEFAULT '1234',
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      welcome_reward TEXT DEFAULT 'Welcome gift — 10% off your next visit',
      bronze_coupon TEXT DEFAULT '15% off coupon',
      silver_coupon TEXT DEFAULT 'Free signature service'
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      language TEXT DEFAULT 'en',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      merchant_id INTEGER NOT NULL,
      service TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      UNIQUE(customer_id, merchant_id)
    );

    CREATE TABLE IF NOT EXISTS rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      tier TEXT NOT NULL CHECK(tier IN ('welcome','bronze','silver','gold')),
      merchant_id INTEGER,
      description TEXT NOT NULL,
      redeemed INTEGER DEFAULT 0,
      redeemed_at TEXT,
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS gold_prizes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      quantity INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS winners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      prize_id INTEGER,
      drawn_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (prize_id) REFERENCES gold_prizes(id)
    );

    CREATE TABLE IF NOT EXISTS email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      sent_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
  `);

  // Seed admin
  const adminUser = process.env.ADMIN_USER || 'evan';
  const adminPass = process.env.ADMIN_PASS || 'changeme123';
  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(adminUser);
  if (!existing) {
    const hash = bcrypt.hashSync(adminPass, 10);
    db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(adminUser, hash);
    console.log(`Admin user "${adminUser}" created.`);
  }

  // Seed campaign settings
  const defaults = {
    campaign_name: 'Passport Promotion',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    gold_draw_count: '1'
  };
  const upsert = db.prepare('INSERT OR IGNORE INTO campaign_settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaults)) upsert.run(k, v);

  // Seed merchants
  const mc = db.prepare('SELECT COUNT(*) as c FROM merchants').get().c;
  if (mc === 0) {
    const ins = db.prepare('INSERT INTO merchants (name, store_key, staff_code, sort_order, welcome_reward, bronze_coupon, silver_coupon) VALUES (?,?,?,?,?,?,?)');
    ins.run('Store A', 'store-a', '1111', 1, 'Welcome! 10% off next visit at Store A', '15% off at Store A', 'Free signature treatment at Store A');
    ins.run('Store B', 'store-b', '2222', 2, 'Welcome! Free add-on at Store B', '15% off at Store B', 'Free deluxe service at Store B');
    ins.run('Store C', 'store-c', '3333', 3, 'Welcome! Gift bag from Store C', '15% off at Store C', 'Free premium package at Store C');
    ins.run('Store D', 'store-d', '4444', 4, 'Welcome! 10% off at Store D', '15% off at Store D', 'Free VIP experience at Store D');
    console.log('Default merchants created.');
  }

  // Seed gold prize
  const pc = db.prepare('SELECT COUNT(*) as c FROM gold_prizes').get().c;
  if (pc === 0) {
    db.prepare('INSERT INTO gold_prizes (name, description, quantity) VALUES (?,?,?)').run('Grand Prize', 'Ultimate 4-store luxury package', 1);
    console.log('Default gold prize created.');
  }

  console.log('Database initialized at', DB_PATH);
  return db;
}

module.exports = { getDb, init };
