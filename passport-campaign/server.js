require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { init } = require('./db/schema');
const { initEmail } = require('./utils/email');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
init();
initEmail();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/locales', express.static(path.join(__dirname, 'locales')));
app.use('/api', require('./routes/public'));
app.use('/api/admin', require('./routes/admin'));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/passport', (req, res) => res.sendFile(path.join(__dirname, 'public', 'passport.html')));
app.get('/checkin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'checkin.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`  Passport Campaign System is running!`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://<your-ip>:${PORT}`);
  console.log(`  Admin:   http://localhost:${PORT}/admin`);
  console.log(`========================================\n`);
});
