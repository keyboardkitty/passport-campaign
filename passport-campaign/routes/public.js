const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { processRewards } = require('../utils/rewards');

// Campaign info
router.get('/campaign', (req, res) => {
  const db = getDb();
  const settings = {};
  db.prepare('SELECT key, value FROM campaign_settings').all().forEach(r => settings[r.key] = r.value);
  const merchants = db.prepare('SELECT id, name, store_key, sort_order FROM merchants WHERE active = 1 ORDER BY sort_order').all();
  res.json({ settings, merchants });
});

// Enter / register
router.post('/customer/enter', (req, res) => {
  const db = getDb();
  const { name, email, language } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'missing_fields' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'invalid_email' });
  const lang = ['en','zh','es'].includes(language) ? language : 'en';
  let customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(email.toLowerCase().trim());
  if (customer) {
    db.prepare('UPDATE customers SET name = ?, language = ? WHERE id = ?').run(name.trim(), lang, customer.id);
    customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer.id);
  } else {
    const r = db.prepare('INSERT INTO customers (name, email, language) VALUES (?,?,?)').run(name.trim(), email.toLowerCase().trim(), lang);
    customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(r.lastInsertRowid);
  }
  res.json({ customer });
});

// Passport status
router.get('/passport/:email', (req, res) => {
  const db = getDb();
  const customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(req.params.email.toLowerCase().trim());
  if (!customer) return res.status(404).json({ error: 'not_found' });

  const checkins = db.prepare(`
    SELECT ck.*, m.name as merchant_name, m.store_key
    FROM checkins ck JOIN merchants m ON m.id = ck.merchant_id
    WHERE ck.customer_id = ? ORDER BY ck.created_at
  `).all(customer.id);

  const merchants = db.prepare('SELECT id, name, store_key, sort_order FROM merchants WHERE active = 1 ORDER BY sort_order').all();
  const stamps = checkins.length;

  let tier = null;
  if (stamps >= 4) tier = 'gold';
  else if (stamps >= 3) tier = 'silver';
  else if (stamps >= 2) tier = 'bronze';
  else if (stamps >= 1) tier = 'welcome';

  const rewards = db.prepare(`
    SELECT r.*, m.name as merchant_name
    FROM rewards r LEFT JOIN merchants m ON m.id = r.merchant_id
    WHERE r.customer_id = ? AND r.redeemed = 0
    AND (r.expires_at IS NULL OR r.expires_at >= datetime('now'))
    ORDER BY r.created_at
  `).all(customer.id);

  const winner = db.prepare(`
    SELECT w.*, gp.name as prize_name, gp.description as prize_desc
    FROM winners w LEFT JOIN gold_prizes gp ON gp.id = w.prize_id
    WHERE w.customer_id = ?
  `).get(customer.id);

  const settings = {};
  db.prepare('SELECT key, value FROM campaign_settings').all().forEach(r => settings[r.key] = r.value);

  res.json({ customer, checkins, merchants, stamps, tier, rewards, winner, settings });
});

// Redeem a reward
router.post('/reward/redeem/:id', (req, res) => {
  const db = getDb();
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'missing_fields' });

  const customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(email.toLowerCase().trim());
  if (!customer) return res.status(404).json({ error: 'not_found' });

  const reward = db.prepare('SELECT * FROM rewards WHERE id = ? AND customer_id = ?').get(req.params.id, customer.id);
  if (!reward) return res.status(404).json({ error: 'not_found' });
  if (reward.redeemed) return res.status(400).json({ error: 'already_redeemed' });

  // Check expiry
  if (reward.expires_at && new Date(reward.expires_at) < new Date()) {
    return res.status(400).json({ error: 'reward_expired' });
  }

  db.prepare("UPDATE rewards SET redeemed = 1, redeemed_at = datetime('now') WHERE id = ?").run(reward.id);
  res.json({ success: true });
});

// Checkin
router.post('/checkin', (req, res) => {
  const db = getDb();
  const { email, merchant_id, service, staff_code } = req.body;
  if (!email || !merchant_id || !staff_code) return res.status(400).json({ error: 'missing_fields' });

  // Campaign dates
  const settings = {};
  db.prepare('SELECT key, value FROM campaign_settings').all().forEach(r => settings[r.key] = r.value);
  const now = new Date();
  const start = new Date(settings.start_date + 'T00:00:00');
  const end = new Date(settings.end_date + 'T23:59:59');
  if (now < start || now > end) return res.status(400).json({ error: 'checkin_expired' });

  const customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(email.toLowerCase().trim());
  if (!customer) return res.status(404).json({ error: 'not_found' });

  const merchant = db.prepare('SELECT * FROM merchants WHERE id = ? AND active = 1').get(merchant_id);
  if (!merchant) return res.status(404).json({ error: 'not_found' });
  if (merchant.staff_code !== staff_code.trim()) return res.status(400).json({ error: 'invalid_code' });

  const dup = db.prepare('SELECT id FROM checkins WHERE customer_id = ? AND merchant_id = ?').get(customer.id, merchant.id);
  if (dup) return res.status(400).json({ error: 'checkin_duplicate' });

  db.prepare('INSERT INTO checkins (customer_id, merchant_id, service) VALUES (?,?,?)').run(customer.id, merchant.id, service || '');

  // Process rewards
  const result = processRewards(customer.id);

  res.json({ success: true, ...result, merchant_name: merchant.name });
});

module.exports = router;
