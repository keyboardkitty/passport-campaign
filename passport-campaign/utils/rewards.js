const { getDb } = require('../db/schema');

/**
 * Called after every successful checkin.
 * Returns { newRewards: [...], tier: string, totalStamps: number }
 */
function processRewards(customerId) {
  const db = getDb();
  const checkins = db.prepare(`
    SELECT ck.merchant_id FROM checkins ck WHERE ck.customer_id = ? ORDER BY ck.created_at
  `).all(customerId);

  const totalStamps = checkins.length;
  const checkedMerchantIds = new Set(checkins.map(c => c.merchant_id));
  const allMerchants = db.prepare('SELECT * FROM merchants WHERE active = 1 ORDER BY sort_order').all();
  const uncheckedMerchants = allMerchants.filter(m => !checkedMerchantIds.has(m.id));

  // Get campaign end date for reward expiry
  const endDate = db.prepare("SELECT value FROM campaign_settings WHERE key = 'end_date'").get();
  const expiresAt = endDate ? endDate.value + 'T23:59:59' : null;

  // Existing reward tiers for this customer
  const existingTiers = new Set(
    db.prepare('SELECT DISTINCT tier FROM rewards WHERE customer_id = ?').all(customerId).map(r => r.tier)
  );

  const newRewards = [];
  const insert = db.prepare('INSERT INTO rewards (customer_id, tier, merchant_id, description, expires_at) VALUES (?,?,?,?,?)');
  const deleteByTierAndMerchant = db.prepare('DELETE FROM rewards WHERE customer_id = ? AND tier = ? AND merchant_id = ?');

  // 1 stamp → welcome rewards from ALL stores
  if (totalStamps >= 1 && !existingTiers.has('welcome')) {
    for (const m of allMerchants) {
      insert.run(customerId, 'welcome', m.id, m.welcome_reward, expiresAt);
      newRewards.push({ tier: 'welcome', merchant: m.name, description: m.welcome_reward });
    }
  }

  // 2 stamps → bronze coupons for unchecked stores (replaces welcome)
  if (totalStamps >= 2 && !existingTiers.has('bronze')) {
    for (const m of uncheckedMerchants) {
      deleteByTierAndMerchant.run(customerId, 'welcome', m.id);
      insert.run(customerId, 'bronze', m.id, m.bronze_coupon, expiresAt);
      newRewards.push({ tier: 'bronze', merchant: m.name, description: m.bronze_coupon });
    }
  }

  // 3 stamps → silver coupon for remaining unchecked (replaces bronze)
  if (totalStamps >= 3 && !existingTiers.has('silver')) {
    for (const m of uncheckedMerchants) {
      deleteByTierAndMerchant.run(customerId, 'bronze', m.id);
      insert.run(customerId, 'silver', m.id, m.silver_coupon, expiresAt);
      newRewards.push({ tier: 'silver', merchant: m.name, description: m.silver_coupon });
    }
  }

  let tier = null;
  if (totalStamps >= 4) tier = 'gold';
  else if (totalStamps >= 3) tier = 'silver';
  else if (totalStamps >= 2) tier = 'bronze';
  else if (totalStamps >= 1) tier = 'welcome';

  return { newRewards, tier, totalStamps };
}

/**
 * Gold draw — only for customers with 4 stamps
 */
function drawGoldWinners(count) {
  const db = getDb();
  const eligible = db.prepare(`
    SELECT c.id, c.name, c.email, c.language, COUNT(ck.id) as stamps
    FROM customers c
    JOIN checkins ck ON ck.customer_id = c.id
    WHERE c.id NOT IN (SELECT customer_id FROM winners)
    GROUP BY c.id HAVING stamps >= 4
  `).all();

  if (eligible.length === 0) return [];

  const shuffled = eligible.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  const prize = db.prepare('SELECT id FROM gold_prizes LIMIT 1').get();
  const prizeId = prize ? prize.id : null;
  const ins = db.prepare('INSERT INTO winners (customer_id, prize_id) VALUES (?,?)');
  for (const w of selected) ins.run(w.id, prizeId);

  return selected;
}

function getGoldEligible() {
  const db = getDb();
  return db.prepare(`
    SELECT c.id, c.name, c.email, c.language, COUNT(ck.id) as stamps
    FROM customers c
    JOIN checkins ck ON ck.customer_id = c.id
    WHERE c.id NOT IN (SELECT customer_id FROM winners)
    GROUP BY c.id HAVING stamps >= 4
  `).all();
}

module.exports = { processRewards, drawGoldWinners, getGoldEligible };
