const nodemailer = require('nodemailer');
const { getDb } = require('../db/schema');

let transporter = null;
let isSimulated = true;

function initEmail() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST, port: parseInt(SMTP_PORT) || 587,
      secure: parseInt(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
    isSimulated = false;
    console.log('SMTP configured:', SMTP_HOST);
  } else {
    console.log('SMTP not configured — using simulated email.');
  }
}

async function sendEmail(to, subject, html, customerId = null) {
  const db = getDb();
  const from = process.env.SMTP_FROM || 'noreply@passport.local';
  if (!isSimulated && transporter) {
    try {
      await transporter.sendMail({ from, to, subject, html });
      db.prepare('INSERT INTO email_logs (customer_id, recipient, subject, body, status) VALUES (?,?,?,?,?)').run(customerId, to, subject, html, 'sent');
      return { success: true, simulated: false };
    } catch (err) {
      db.prepare('INSERT INTO email_logs (customer_id, recipient, subject, body, status) VALUES (?,?,?,?,?)').run(customerId, to, subject, html, 'failed: ' + err.message);
      return { success: false, error: err.message };
    }
  } else {
    db.prepare('INSERT INTO email_logs (customer_id, recipient, subject, body, status) VALUES (?,?,?,?,?)').run(customerId, to, subject, html, 'simulated');
    return { success: true, simulated: true };
  }
}

module.exports = { initEmail, sendEmail };
