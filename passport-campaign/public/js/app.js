const App = {
  lang: localStorage.getItem('passport_lang') || 'en',
  translations: {},
  email: localStorage.getItem('passport_email') || '',
  name: localStorage.getItem('passport_name') || '',

  async loadTranslations() {
    const res = await fetch(`/locales/${this.lang}.json`);
    this.translations = await res.json();
  },
  t(key) { return this.translations[key] || key; },
  setLang(lang) {
    this.lang = lang;
    localStorage.setItem('passport_lang', lang);
    this.loadTranslations().then(() => { if (typeof pageInit === 'function') pageInit(); });
  },
  async loadCampaign() {
    const res = await fetch('/api/campaign');
    return res.json();
  },
  async enter(name, email) {
    const res = await fetch('/api/customer/enter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, language: this.lang })
    });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
    const data = await res.json();
    this.email = email.toLowerCase().trim();
    this.name = name.trim();
    localStorage.setItem('passport_email', this.email);
    localStorage.setItem('passport_name', this.name);
    return data;
  },
  async getPassport() {
    if (!this.email) return null;
    const res = await fetch(`/api/passport/${encodeURIComponent(this.email)}`);
    if (!res.ok) return null;
    return res.json();
  },
  async checkin(merchantId, service, staffCode) {
    const res = await fetch('/api/checkin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, merchant_id: merchantId, service, staff_code: staffCode })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  },
  async redeemReward(rewardId) {
    const res = await fetch(`/api/reward/redeem/${rewardId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  },
  logout() {
    this.email = ''; this.name = '';
    localStorage.removeItem('passport_email');
    localStorage.removeItem('passport_name');
    window.location.href = '/';
  }
};

function showToast(msg, type = 'success') {
  const old = document.querySelector('.toast'); if (old) old.remove();
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}

function renderLangSwitcher(el) {
  el.innerHTML = '';
  ['en','zh','es'].forEach(l => {
    const b = document.createElement('button');
    b.className = `lang-btn ${App.lang === l ? 'active' : ''}`;
    b.textContent = l === 'en' ? 'EN' : l === 'zh' ? '中文' : 'ES';
    b.onclick = () => App.setLang(l);
    el.appendChild(b);
  });
}

function getUrlParam(n) { return new URLSearchParams(window.location.search).get(n); }
