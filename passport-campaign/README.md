# 🛂 Passport Campaign System

Multi-merchant stamp collection & lottery web app.  
Customers scan a QR code, collect stamps at partner stores, and win prizes.

---

## Quick Start (Mac mini)

### 1. Install Node.js

Download and install from: https://nodejs.org (choose LTS version, 18+)

Or with Homebrew:
```bash
brew install node
```

Verify:
```bash
node --version   # Should show v18+ or v20+
npm --version
```

### 2. Download Project

Copy the `passport-campaign` folder to your Mac mini, e.g. `~/passport-campaign`

### 3. Install Dependencies

```bash
cd ~/passport-campaign
npm install
```

### 4. Configure

Copy and edit the environment file:
```bash
cp .env.example .env
nano .env   # or open with TextEdit
```

Key settings:
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `ADMIN_USER` | `evan` | Admin username |
| `ADMIN_PASS` | `changeme123` | Admin password (change this!) |
| `SMTP_HOST` | _(empty)_ | SMTP server for real emails |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | _(empty)_ | SMTP username |
| `SMTP_PASS` | _(empty)_ | SMTP password |
| `SMTP_FROM` | _(empty)_ | Sender email address |

> **Note:** If SMTP is not configured, emails are simulated and logged in the admin panel.

### 5. Start

```bash
node server.js
```

You'll see:
```
========================================
  Passport Campaign System is running!
  Local:   http://localhost:3000
  Network: http://<your-ip>:3000
  Admin:   http://localhost:3000/admin
========================================
```

### 6. First Login

1. Open `http://localhost:3000/admin`
2. Login with `evan` / `changeme123`
3. **Change the password** in `.env` and restart

---

## Admin Setup Checklist

After first login, go through these tabs:

1. **Settings** — Set campaign name, start/end dates
2. **Merchants** — Edit store names, store keys, and staff codes
3. **Prizes** — Configure prizes for each tier (bronze/silver/gold)

### Merchant Configuration

Each merchant has:
- **Name**: Display name (e.g., "Lily's Nail Salon")
- **Store Key**: URL identifier (e.g., `lilys-nails`) — used in QR code URLs
- **Staff Code**: Secret code staff gives to customers to verify check-in
- **Sort Order**: Display order (1, 2, 3, 4)

---

## QR Code Setup

Each store gets a unique URL:

```
http://<your-ip>:3000/?store=store-a
http://<your-ip>:3000/?store=store-b
http://<your-ip>:3000/?store=store-c
http://<your-ip>:3000/?store=store-d
```

Replace `store-a` etc. with your actual store keys from the admin panel.

### Generate QR Codes

**Option 1: Online** (easiest)
- Go to https://www.qr-code-generator.com/
- Paste each store URL
- Download and print

**Option 2: Command line**
```bash
npm install -g qrcode
qrcode "http://YOUR-IP:3000/?store=store-a" -o store-a-qr.png
```

### Print & Display
- Print QR codes on card stock
- Place at each store's checkout counter
- Include brief instructions: "Scan to collect your stamp!"

---

## Network Access

### Same Wi-Fi (Local Network)

Find your Mac mini's IP:
```bash
ipconfig getifaddr en0
```

Customers on the same Wi-Fi can access: `http://192.168.x.x:3000`

### Public Internet Access

**Option 1: ngrok (easiest for testing)**
```bash
brew install ngrok
ngrok http 3000
```
This gives you a public URL like `https://abc123.ngrok.io`

**Option 2: Cloudflare Tunnel (free, permanent)**
```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:3000
```

**Option 3: Port forwarding**
- Open port 3000 on your router
- Point it to your Mac mini's local IP
- Use your public IP or a dynamic DNS service

---

## Long-term Running

### Using pm2 (recommended)

```bash
# Install pm2
npm install -g pm2

# Start the app
cd ~/passport-campaign
pm2 start server.js --name passport

# Auto-start on boot
pm2 startup
pm2 save

# Useful commands
pm2 status          # Check status
pm2 logs passport   # View logs
pm2 restart passport # Restart
pm2 stop passport   # Stop
```

### Using launchd (macOS native)

Create `~/Library/LaunchAgents/com.passport.campaign.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.passport.campaign</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/YOUR_USER/passport-campaign/server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USER/passport-campaign</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

Then:
```bash
launchctl load ~/Library/LaunchAgents/com.passport.campaign.plist
```

---

## Data Backup

### Manual Backup

The database is a single file: `data/passport.db`

```bash
cp data/passport.db data/backup-$(date +%Y%m%d).db
```

### Admin Panel Backup

Go to Admin → Dashboard → Click "Download DB Backup"

### Automated Backup (cron)

```bash
crontab -e
```

Add:
```
0 2 * * * cp ~/passport-campaign/data/passport.db ~/passport-campaign/data/backup-$(date +\%Y\%m\%d).db
```

This backs up daily at 2 AM.

---

## Campaign Lifecycle

### Starting a New Campaign

1. Go to Admin → Dashboard → "Archive & Reset"
2. This saves current data to `data/archive/` and clears customers/check-ins/winners
3. Update Settings with new dates and prizes
4. Generate new QR codes if store keys changed

### Archived Data

Previous campaigns are saved in `data/archive/` as `.db` files.
You can open them with any SQLite browser (e.g., DB Browser for SQLite).

---

## SMTP Configuration Examples

### Gmail
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
```
> You need an "App Password" — not your regular Gmail password.  
> Go to: Google Account → Security → 2-Step Verification → App Passwords

### Outlook / Hotmail
```
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
SMTP_FROM=your-email@outlook.com
```

### Custom SMTP
```
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=465
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-password
SMTP_FROM=noreply@yourdomain.com
```

---

## Project Structure

```
passport-campaign/
├── server.js              # Main entry point
├── package.json           # Dependencies
├── .env                   # Configuration (DO NOT SHARE)
├── .env.example           # Template
├── data/                  # SQLite database (auto-created)
│   ├── passport.db        # Main database
│   └── archive/           # Archived campaigns
├── db/
│   └── schema.js          # Database init & schema
├── routes/
│   ├── public.js          # Customer API
│   └── admin.js           # Admin API
├── utils/
│   ├── email.js           # Email service
│   └── lottery.js         # Draw logic
├── locales/
│   ├── en.json            # English
│   ├── zh.json            # 中文
│   └── es.json            # Español
└── public/
    ├── index.html          # Landing page
    ├── passport.html       # Stamp progress
    ├── checkin.html        # Check-in form
    ├── admin.html          # Admin panel
    ├── css/style.css       # Styles
    └── js/app.js           # Client JS
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `node: command not found` | Install Node.js from nodejs.org |
| Port 3000 already in use | Change `PORT` in `.env` or kill the other process: `lsof -i :3000` |
| Database locked error | Make sure only one instance is running |
| Emails not sending | Check SMTP config in `.env`; check Email Logs in admin |
| Can't access from phone | Make sure phone is on the same Wi-Fi; check firewall |
| Forgot admin password | Edit `.env`, delete `data/passport.db`, restart (re-creates admin) |

---

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express
- **Database**: SQLite (via better-sqlite3)
- **Email**: Nodemailer
- **Frontend**: Vanilla HTML/CSS/JS (no build step)
- **Dependencies**: 5 packages total
