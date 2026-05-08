const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/schema');
const { drawGoldWinners, getGoldEligible } = require('../utils/rewards');
const { sendEmail } = require('../utils/email');

const tokens = new Set();

function auth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!token || !tokens.has(token)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

router.post('/login', (req, res) => {
  const db = getDb();
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
  const token = crypto.randomBytes(32).toString('hex');
  tokens.add(token);
  res.json({ token, username: admin.username });
});

router.post('/logout', (req, res) => {
  tokens.delete(req.headers['x-admin-token']);
  res.json({ ok: true });
});

router.use(auth);

// Dashboard
router.get('/stats', (req, res) => {
  const db = getDb();
  const totalCustomers = db.prepare('SELECT COUNT(*) as c FROM customers').get().c;
  const totalCheckins = db.prepare('SELECT COUNT(*) as c FROM checkins').get().c;
  const totalWinners = db.prepare('SELECT COUNT(*) as c FROM winners').get().c;
  const goldEligible = getGoldEligible().length;
  const stampDist = db.prepare(`
    SELECT stamps, COUNT(*) as count FROM (
      SELECT customer_id, COUNT(*) as stamps FROM checkins GROUP BY customer_id
    ) GROUP BY stamps ORDER BY stamps
  `).all();
  const rewardStats = db.prepare(`
    SELECT tier, COUNT(*) as count FROM rewards GROUP BY tier
  `).all();
  res.json({ totalCustomers, totalCheckins, totalWinners, goldEligible, stampDist, rewardStats });
});

// Settings
router.get('/settings', (req, res) => {
  const db = getDb();
  const settings = {};
  db.prepare('SELECT key, value FROM campaign_settings').all().forEach(r => settings[r.key] = r.value);
  res.json(settings);
});

router.post('/settings', (req, res) => {
  const db = getDb();
  const upsert = db.prepare('INSERT INTO campaign_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = ?');
  for (const [k, v] of Object.entries(req.body)) upsert.run(k, String(v), String(v));
  res.json({ ok: true });
});

// Merchants
router.get('/merchants', (req, res) => {
  res.json(getDb().prepare('SELECT * FROM merchants ORDER BY sort_order').all());
});

router.put('/merchants/:id', (req, res) => {
  const { name, store_key, staff_code, sort_order, active, welcome_reward, bronze_coupon, silver_coupon } = req.body;
  getDb().prepare('UPDATE merchants SET name=?, store_key=?, staff_code=?, sort_order=?, active=?, welcome_reward=?, bronze_coupon=?, silver_coupon=? WHERE id=?')
    .run(name, store_key, staff_code, sort_order || 0, active !== undefined ? active : 1, welcome_reward || '', bronze_coupon || '', silver_coupon || '', req.params.id);
  res.json({ ok: true });
});

router.post('/merchants', (req, res) => {
  const { name, store_key, staff_code, welcome_reward, bronze_coupon, silver_coupon } = req.body;
  if (!name || !store_key) return res.status(400).json({ error: 'Name and store_key required' });
  try {
    getDb().prepare('INSERT INTO merchants (name, store_key, staff_code, welcome_reward, bronze_coupon, silver_coupon) VALUES (?,?,?,?,?,?)')
      .run(name, store_key, staff_code || '1234', welcome_reward || '', bronze_coupon || '', silver_coupon || '');
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Gold prizes
router.get('/gold-prizes', (req, res) => {
  res.json(getDb().prepare('SELECT * FROM gold_prizes').all());
});

router.post('/gold-prizes', (req, res) => {
  const { name, description, quantity } = req.body;
  getDb().prepare('INSERT INTO gold_prizes (name, description, quantity) VALUES (?,?,?)').run(name, description || '', quantity || 1);
  res.json({ ok: true });
});

router.put('/gold-prizes/:id', (req, res) => {
  const { name, description, quantity } = req.body;
  getDb().prepare('UPDATE gold_prizes SET name=?, description=?, quantity=? WHERE id=?').run(name, description || '', quantity || 1, req.params.id);
  res.json({ ok: true });
});

router.delete('/gold-prizes/:id', (req, res) => {
  getDb().prepare('DELETE FROM gold_prizes WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Customers
router.get('/customers', (req, res) => {
  res.json(getDb().prepare(`
    SELECT c.*, COUNT(ck.id) as stamps FROM customers c
    LEFT JOIN checkins ck ON ck.customer_id = c.id GROUP BY c.id ORDER BY c.created_at DESC
  `).all());
});

// Checkins
router.get('/checkins', (req, res) => {
  res.json(getDb().prepare(`
    SELECT ck.*, c.name as customer_name, c.email as customer_email, m.name as merchant_name
    FROM checkins ck JOIN customers c ON c.id = ck.customer_id JOIN merchants m ON m.id = ck.merchant_id
    ORDER BY ck.created_at DESC
  `).all());
});

// Rewards
router.get('/rewards', (req, res) => {
  res.json(getDb().prepare(`
    SELECT r.*, c.name as customer_name, c.email as customer_email, m.name as merchant_name
    FROM rewards r JOIN customers c ON c.id = r.customer_id LEFT JOIN merchants m ON m.id = r.merchant_id
    ORDER BY r.created_at DESC
  `).all());
});

// Gold draw
router.get('/gold-eligible', (req, res) => { res.json(getGoldEligible()); });

router.post('/draw', (req, res) => {
  const count = parseInt(req.body.count) || 1;
  const winners = drawGoldWinners(count);
  res.json({ winners, count: winners.length });
});

// Winners
router.get('/winners', (req, res) => {
  res.json(getDb().prepare(`
    SELECT w.*, c.name as customer_name, c.email as customer_email, c.language,
           gp.name as prize_name, gp.description as prize_desc
    FROM winners w JOIN customers c ON c.id = w.customer_id
    LEFT JOIN gold_prizes gp ON gp.id = w.prize_id ORDER BY w.drawn_at DESC
  `).all());
});

router.delete('/winners/:id', (req, res) => {
  getDb().prepare('DELETE FROM winners WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Notify winner
router.post('/notify/:winnerId', async (req, res) => {
  const db = getDb();
  const w = db.prepare(`
    SELECT w.*, c.name, c.email, c.language, gp.name as prize_name
    FROM winners w JOIN customers c ON c.id = w.customer_id LEFT JOIN gold_prizes gp ON gp.id = w.prize_id WHERE w.id = ?
  `).get(req.params.winnerId);
  if (!w) return res.status(404).json({ error: 'Not found' });

  const msgs = {
    en: { s: 'You won the Grand Prize!', b: `<h2>Congratulations, ${w.name}!</h2><p>You won: <strong>${w.prize_name || 'Grand Prize'}</strong></p><p>Please contact us for details.</p>` },
    zh: { s: '恭喜您赢得金奖！', b: `<h2>恭喜 ${w.name}！</h2><p>您获得了：<strong>${w.prize_name || '金奖大奖'}</strong></p><p>请联系我们领取。</p>` },
    es: { s: '¡Ganaste el Gran Premio!', b: `<h2>¡Felicidades, ${w.name}!</h2><p>Ganaste: <strong>${w.prize_name || 'Gran Premio'}</strong></p><p>Contáctanos.</p>` }
  };
  const m = msgs[w.language] || msgs.en;
  const r = await sendEmail(w.email, m.s, m.b, w.customer_id);
  res.json(r);
});

router.post('/notify-all', async (req, res) => {
  const db = getDb();
  const winners = db.prepare(`
    SELECT w.*, c.name, c.email, c.language, gp.name as prize_name
    FROM winners w JOIN customers c ON c.id = w.customer_id LEFT JOIN gold_prizes gp ON gp.id = w.prize_id
    WHERE w.id NOT IN (SELECT DISTINCT w2.id FROM winners w2 JOIN email_logs el ON el.customer_id = w2.customer_id WHERE el.status IN ('sent','simulated'))
  `).all();
  const results = [];
  for (const w of winners) {
    const msgs = { en: { s: 'You won!', b: `<h2>Congrats ${w.name}!</h2><p>Prize: ${w.prize_name}</p>` }, zh: { s: '恭喜中奖！', b: `<h2>恭喜 ${w.name}！</h2><p>奖品：${w.prize_name}</p>` }, es: { s: '¡Ganaste!', b: `<h2>¡Felicidades ${w.name}!</h2><p>Premio: ${w.prize_name}</p>` } };
    const m = msgs[w.language] || msgs.en;
    const r = await sendEmail(w.email, m.s, m.b, w.customer_id);
    results.push({ email: w.email, ...r });
  }
  res.json({ sent: results.length, results });
});

// Email logs
router.get('/emails', (req, res) => {
  res.json(getDb().prepare('SELECT el.*, c.name as customer_name FROM email_logs el LEFT JOIN customers c ON c.id = el.customer_id ORDER BY el.sent_at DESC').all());
});

// CSV export
router.get('/export/:type', (req, res) => {
  const db = getDb();
  let rows, filename;
  switch (req.params.type) {
    case 'customers': rows = db.prepare('SELECT c.*, COUNT(ck.id) as stamps FROM customers c LEFT JOIN checkins ck ON ck.customer_id = c.id GROUP BY c.id').all(); filename = 'customers.csv'; break;
    case 'checkins': rows = db.prepare('SELECT ck.*, c.name as customer_name, c.email, m.name as merchant_name FROM checkins ck JOIN customers c ON c.id=ck.customer_id JOIN merchants m ON m.id=ck.merchant_id').all(); filename = 'checkins.csv'; break;
    case 'rewards': rows = db.prepare('SELECT r.*, c.name, c.email, m.name as merchant_name FROM rewards r JOIN customers c ON c.id=r.customer_id LEFT JOIN merchants m ON m.id=r.merchant_id').all(); filename = 'rewards.csv'; break;
    case 'winners': rows = db.prepare('SELECT w.*, c.name, c.email, gp.name as prize FROM winners w JOIN customers c ON c.id=w.customer_id LEFT JOIN gold_prizes gp ON gp.id=w.prize_id').all(); filename = 'winners.csv'; break;
    default: return res.status(400).json({ error: 'Invalid type' });
  }
  if (!rows.length) return res.status(200).send('No data');
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${String(r[h]||'').replace(/"/g,'""')}"`).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.send(csv);
});

// Archive
router.post('/archive', (req, res) => {
  const db = getDb();
  const dbPath = path.join(__dirname, '..', 'data', 'passport.db');
  const archiveDir = path.join(__dirname, '..', 'data', 'archive');
  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
  const name = `campaign-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
  fs.copyFileSync(dbPath, path.join(archiveDir, name));
  db.exec('DELETE FROM checkins; DELETE FROM customers; DELETE FROM rewards; DELETE FROM winners; DELETE FROM email_logs;');
  res.json({ ok: true, archive: name });
});

// Backup
router.get('/backup', (req, res) => {
  res.download(path.join(__dirname, '..', 'data', 'passport.db'), `passport-backup-${new Date().toISOString().split('T')[0]}.db`);
});

module.exports = router;
