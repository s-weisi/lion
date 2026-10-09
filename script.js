/* =========================================================
   script.js - كود متجر LiON
   بيقرا البيانات من products.js ويرسم المتجر والسلة ولوحة التحكم.
   لوحة التحكم بتفتح من: index.html?admin
   ========================================================= */
(function () {
  'use strict';

  /* ---------- أدوات صغيرة ---------- */
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  /* ---------- الحالة ---------- */
  const ADMIN = new URLSearchParams(location.search).has('admin');
  const KEY = { cart: 'lion-cart', wish: 'lion-wish', draft: 'lion-draft' };

  /* الربط مع فايربيز (تسجيل الدخول + حفظ أونلاين). لو firebase-config.js فاضي الموقع بيشتغل من products.js */
  const CFG = window.FIREBASE_CONFIG || {};
  const CLOUD = !!(CFG.apiKey && CFG.projectId && !/PASTE|YOUR/i.test(String(CFG.apiKey) + String(CFG.projectId)));
  let loading = CLOUD;
  let fb = null;

  let data = clone(window.STORE_DATA || { settings: {}, products: [] });
  let hasDraft = false;
  if (!CLOUD) {
    const d = load(KEY.draft, null);
    if (d && d.products && d.settings) { data = d; hasDraft = true; }
  }

  let cart = load(KEY.cart, []);
  let wish = load(KEY.wish, []);
  const view = { cat: 'all', q: '', sort: 'new' };
  let modal = { id: null, size: '' };
  let editingId = null;
  let formImg = '';
  let lastFocus = null;
  let toastTimer = 0;

  const NAV = [['all', 'كل التيشرتات'], ['new', 'جديد'], ['sale', 'تخفيضات']];
  const TITLES = { all: 'تيشرتات رجالي', new: 'وصل جديد', sale: 'تخفيضات', wish: 'المفضلة' };
  const SWATCHES = ['#2B2522', '#FFFFFF', '#6B4430', '#CDB79E', '#6B7A4B', '#27406B', '#B5472F', '#8E8E8E'];

  const HEART = '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>';
  const CLOSE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  /* ---------- دوال مساعدة للمنتجات ---------- */
  const byId = (id) => data.products.find((p) => p.id === id);
  /* رقم الواتساب بصيغة دولية (01012345678 ← 201012345678) */
  function whatsappNumber() {
    let d = String(data.settings.whatsapp || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.indexOf('00') === 0) d = d.slice(2); else if (d.charAt(0) === '0') d = '20' + d.slice(1);
    return d;
  }
  const fmt = (n) => Number(n).toLocaleString('en-US') + ' ' + (data.settings.currency || '');
  const discount = (p) => (p.old > p.price ? Math.round((1 - p.price / p.old) * 100) : 0);

  function shade(hex, amt) {
    const n = parseInt(String(hex).slice(1), 16);
    if (isNaN(n)) return '#000000';
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round((f - r) * p + r); g = Math.round((f - g) * p + g); b = Math.round((f - b) * p + b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /* رسمة التيشرت لما مفيش صورة */
  function tee(color) {
    const d = shade(color, -0.22);
    return '<svg viewBox="0 0 200 200" aria-hidden="true">' +
      '<path d="M62 24 L14 54 L36 92 L56 80 L56 178 L144 178 L144 80 L164 92 L186 54 L138 24 C132 38 118 46 100 46 C82 46 68 38 62 24 Z" fill="' + esc(color) + '" stroke="rgba(0,0,0,.14)" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M14 54 L36 92 L56 80 L62 24 Z M186 54 L164 92 L144 80 L138 24 Z" fill="rgba(0,0,0,.07)"/>' +
      '<path d="M62 24 C68 38 82 46 100 46 C118 46 132 38 138 24" fill="none" stroke="' + d + '" stroke-width="5" stroke-linecap="round"/></svg>';
  }
  const media = (p) => p.img ? '<img src="' + esc(p.img) + '" alt="' + esc(p.name) + '" loading="lazy">' : tee(p.color || '#2B2522');
  const priceHTML = (p, big) =>
    '<div class="price' + (big ? ' big' : '') + '"><span>' + fmt(p.price) + '</span>' +
    (p.old > p.price ? '<span class="old">' + fmt(p.old) + '</span>' : '') + '</div>';

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
  }

  /* ---------- الإعدادات: النصوص واللوجو والروابط ---------- */
  function applySettings() {
    const s = data.settings;
    document.title = s.name || 'LiON';
    $$('[data-logo]').forEach((img) => { img.src = s.logo || 'logo.png'; img.alt = s.name || ''; });
    $$('[data-text]').forEach((el) => { el.textContent = s[el.dataset.text] || ''; });
    const a = $('#announce');
    a.textContent = s.announce || ''; a.hidden = !s.announce;
    $('#copy').textContent = '© ' + new Date().getFullYear() + ' ' + (s.name || '');

    const url = (u) => (/^https?:\/\//i.test(u) ? u : 'https://' + u);
    const links = [];
    if (s.facebook) links.push('<a href="' + esc(url(s.facebook)) + '" target="_blank" rel="noopener">فيسبوك</a>');
    if (s.instagram) links.push('<a href="' + esc(url(s.instagram)) + '" target="_blank" rel="noopener">انستجرام</a>');
    $('#social').innerHTML = links.join('');

    const num = whatsappNumber();
    $('#waFloat').href = num
      ? 'https://wa.me/' + num + '?text=' + encodeURIComponent('أهلاً، عايز أستفسر عن تيشرتات ' + (s.name || ''))
      : '#';
  }

  /* ---------- المنيو والمنتجات ---------- */
  function renderNav() {
    $('#nav').innerHTML = NAV.map((n) =>
      '<button data-act="nav" data-cat="' + n[0] + '"' + (view.cat === n[0] ? ' aria-current="true"' : '') + '>' + n[1] + '</button>').join('');
  }

  function filtered() {
    const q = view.q.trim().toLowerCase();
    let list = data.products.filter((p) => {
      if (view.cat === 'sale' && !(p.old > p.price)) return false;
      if (view.cat === 'new' && !p.isNew) return false;
      if (view.cat === 'wish' && wish.indexOf(p.id) < 0) return false;
      if (q && p.name.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    if (view.sort === 'low') list = list.slice().sort((a, b) => a.price - b.price);
    if (view.sort === 'high') list = list.slice().sort((a, b) => b.price - a.price);
    return list;
  }

  function cardHTML(p, i) {
    const d = discount(p), on = wish.indexOf(p.id) >= 0;
    const tags = (p.isNew ? '<span class="tag">جديد</span>' : '') + (d ? '<span class="tag sale">-' + d + '%</span>' : '');
    return '<article class="card" style="--i:' + Math.min(i || 0, 12) + '">' +
      '<button class="heart" data-act="heart" data-id="' + p.id + '" aria-pressed="' + on + '" aria-label="المفضلة">' + HEART + '</button>' +
      '<button class="media" data-act="open" data-id="' + p.id + '" aria-label="عرض ' + esc(p.name) + '">' + media(p) + (tags ? '<span class="tags">' + tags + '</span>' : '') + '</button>' +
      '<div class="cbody">' + priceHTML(p) + '<h3 class="name">' + esc(p.name) + '</h3><p class="cat">رجالي · تيشرت</p></div></article>';
  }

  function renderGrid() {
    if (loading) {
      $('#count').textContent = '';
      $('#grid').innerHTML = '<div class="empty"><p>جاري تحميل التيشرتات...</p></div>';
      return;
    }
    const items = filtered();
    $('#shopTitle').textContent = view.q ? 'نتايج البحث' : (TITLES[view.cat] || TITLES.all);
    $('#count').textContent = items.length + ' منتج';
    const g = $('#grid');
    if (items.length) { g.innerHTML = items.map((p, i) => cardHTML(p, i)).join(''); return; }
    if (!data.products.length) {
      g.innerHTML = '<div class="empty"><h3>المتجر لسه فاضي</h3><p>التيشرتات هتظهر هنا قريب.</p>' +
        (ADMIN ? '<button class="btn sm" data-act="adminOpen">افتح لوحة التحكم</button>' : '') + '</div>';
    } else {
      g.innerHTML = '<div class="empty"><h3>مفيش نتايج</h3><p>جرب كلمة تانية أو ارجع لكل التيشرتات.</p><button class="btn sm" data-act="reset">اعرض الكل</button></div>';
    }
  }

  function renderBadges() {
    const n = cart.reduce((s, i) => s + i.qty, 0);
    $('#cartCount').textContent = n || '';
    $('#wishCount').textContent = wish.length || '';
  }

  /* ---------- البيضاوي المضيء في المنيو ---------- */
  function initNavGlow() {
    const line = $('.nav-line'), nav = $('#nav');
    const glowTo = (b) => {
      let g = nav.querySelector('.glow');
      if (!g) { g = document.createElement('span'); g.className = 'glow'; g.setAttribute('aria-hidden', 'true'); nav.prepend(g); }
      const was = g.classList.contains('on');
      if (!was) g.style.transition = 'none';          /* أول ظهور: من غير انزلاق */
      g.style.width = b.offsetWidth + 'px';
      g.style.height = b.offsetHeight + 'px';
      g.style.transform = 'translate(' + b.offsetLeft + 'px,' + b.offsetTop + 'px)';
      if (!was) { void g.offsetWidth; g.style.transition = ''; g.classList.add('on'); }
    };
    const glowOff = () => { const g = nav.querySelector('.glow'); if (g) g.classList.remove('on'); };
    line.addEventListener('mousemove', (e) => {
      let best = null, bd = Infinity;
      $$('button', nav).forEach((b) => {
        const r = b.getBoundingClientRect();
        const dx = e.clientX < r.left ? r.left - e.clientX : (e.clientX > r.right ? e.clientX - r.right : 0);
        if (dx < bd) { bd = dx; best = b; }
      });
      if (best && bd <= 70) glowTo(best); else glowOff();     /* 70px = "قرّب الماوس" */
    });
    line.addEventListener('mouseleave', glowOff);
  }

  /* ---------- مفتاح التعديل: 5 دوسات على اللوجو بتظهره، و5 تاني بتخفيه ---------- */
  function initSecretAdmin() {
    let n = 0, timer = 0;
    const tap = () => {
      n++; clearTimeout(timer);
      timer = setTimeout(() => { n = 0; }, 2500);
      if (n >= 5) {
        n = 0;
        const b = $('#adminBtn'); b.hidden = !b.hidden;
        if (b.hidden) closeLayers();
      }
    };
    $('.logo').addEventListener('click', (e) => { e.preventDefault(); tap(); });
    $('.fl').addEventListener('click', tap);
  }

  /* ---------- ظل الهيدر لما تنزل بالصفحة ---------- */
  function initScrollShadow() {
    const top = $('.top');
    const on = () => top.classList.toggle('scrolled', window.scrollY > 8);
    window.addEventListener('scroll', on, { passive: true }); on();
  }

  /* ---------- الطبقات (سلة / تفاصيل / لوحة تحكم) ---------- */
  function openLayer(id) {
    lastFocus = document.activeElement;
    const el = $('#' + id);
    if (!el) return;
    el.hidden = false;
    if (id !== 'admin') { const sc = $('#scrim'); if (sc) sc.hidden = false; }
    document.body.style.overflow = 'hidden';
    if (id !== 'admin') { const f = $('#' + id + ' button'); if (f) f.focus(); }
  }
  function closeLayers() {
    ['cart', 'modal', 'admin', 'login'].forEach((l) => { const el = $('#' + l); if (el) el.hidden = true; });
    const sc = $('#scrim'); if (sc) sc.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  /* ---------- تفاصيل المنتج ---------- */
  function renderModal() {
    const p = byId(modal.id); if (!p) return;
    const d = discount(p), on = wish.indexOf(p.id) >= 0;
    const tags = (p.isNew ? '<span class="tag">جديد</span>' : '') + (d ? '<span class="tag sale">-' + d + '%</span>' : '');
    $('#modal').innerHTML =
      '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="modalTitle">' +
        '<button class="x" data-act="closeLayers" aria-label="إغلاق">' + CLOSE + '</button>' +
        '<div class="media">' + media(p) + (tags ? '<span class="tags">' + tags + '</span>' : '') + '</div>' +
        '<div class="dlg-info">' +
          '<p class="cat">رجالي · تيشرت</p><h2 id="modalTitle">' + esc(p.name) + '</h2>' + priceHTML(p, true) +
          '<div><p class="lbl">المقاس</p><div class="sizes" id="sizes">' +
            p.sizes.map((s) => '<button class="size" data-act="size" data-s="' + esc(s) + '" aria-pressed="' + (modal.size === s) + '">' + esc(s) + '</button>').join('') +
          '</div></div>' +
          '<button class="btn" data-act="addToCart">أضف للسلة</button>' +
          '<button class="btn alt" data-act="heart" data-id="' + p.id + '">' + (on ? 'شيل من المفضلة' : 'ضيف للمفضلة') + '</button>' +
        '</div></div>';
  }
  function openProduct(id) {
    if (!byId(id)) return;
    modal = { id: id, size: '' };
    renderModal(); openLayer('modal');
  }

  /* ---------- السلة ---------- */
  function addToCart() {
    const p = byId(modal.id); if (!p) return;
    if (!modal.size) {
      const s = $('#sizes'); s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake');
      toast('اختار المقاس الأول'); return;
    }
    const hit = cart.find((i) => i.id === p.id && i.size === modal.size);
    if (hit) hit.qty++; else cart.push({ id: p.id, size: modal.size, qty: 1 });
    save(KEY.cart, cart); renderBadges(); closeLayers(); renderCart(); openLayer('cart');
  }

  function whatsappLink() {
    let d = String(data.settings.whatsapp || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.indexOf('00') === 0) d = d.slice(2); else if (d.charAt(0) === '0') d = '20' + d.slice(1);
    const lines = ['طلب جديد من ' + data.settings.name + ':'];
    let total = 0;
    cart.forEach((i) => {
      const p = byId(i.id); if (!p) return;
      total += p.price * i.qty;
      lines.push('- ' + p.name + ' (المقاس ' + i.size + ') × ' + i.qty + ' = ' + fmt(p.price * i.qty));
    });
    lines.push('الإجمالي: ' + fmt(total));
    return 'https://wa.me/' + d + '?text=' + encodeURIComponent(lines.join('\n'));
  }

  function renderCart() {
    cart = cart.filter((i) => byId(i.id));
    const total = cart.reduce((s, i) => s + byId(i.id).price * i.qty, 0);
    let body;
    if (!cart.length) {
      body = '<div class="empty" style="margin-block:20px"><h3>السلة فاضية</h3><p>اختار تيشرت ومقاس وهيظهر هنا.</p><button class="btn sm" data-act="closeLayers">كمّل تسوّق</button></div>';
    } else {
      body = cart.map((i) => {
        const p = byId(i.id), k = esc(i.id + '|' + i.size);
        return '<div class="ci"><div class="media">' + media(p) + '</div><div class="meta">' +
          '<span class="name">' + esc(p.name) + '</span><span class="cat">المقاس: ' + esc(i.size) + '</span>' + priceHTML(p) +
          '<div class="row"><div class="qty"><button data-act="dec" data-k="' + k + '" aria-label="قلل">−</button><span>' + i.qty + '</span><button data-act="inc" data-k="' + k + '" aria-label="زوّد">+</button></div>' +
          '<button class="link" data-act="remove" data-k="' + k + '">شيل</button></div></div></div>';
      }).join('');
    }
    let foot = '';
    if (cart.length) {
      const link = whatsappLink();
      foot = '<div class="df"><div class="total"><span>الإجمالي</span><span>' + fmt(total) + '</span></div>' +
        (link
          ? '<a class="btn" href="' + esc(link) + '" target="_blank" rel="noopener">ابعت الطلب على واتساب</a><p class="note">هيفتح واتساب برسالة جاهزة فيها طلبك.</p>'
          : '<button class="btn" disabled>ابعت الطلب على واتساب</button><p class="note">' + (ADMIN ? 'ضيف رقم واتساب في لوحة التحكم عشان الطلبات توصلك.' : 'صاحب المتجر لسه ما ضافش رقم واتساب.') + '</p>') +
        '</div>';
    }
    $('#cart').innerHTML =
      '<div class="dh"><h2>السلة</h2><button class="ibtn" data-act="closeLayers" aria-label="إغلاق">' + CLOSE + '</button></div>' +
      '<div class="db">' + body + '</div>' + foot;
  }

  function stepCart(key, delta) {
    const parts = key.split('|');
    const it = cart.find((i) => i.id === parts[0] && i.size === parts[1]); if (!it) return;
    if (delta === 'remove') it.qty = 0; else it.qty += delta;
    cart = cart.filter((i) => i.qty > 0);
    save(KEY.cart, cart); renderBadges(); renderCart();
  }

  /* =========================================================
     لوحة التحكم
     ========================================================= */
  function refreshAfterChange() {
    renderGrid(); renderCart(); renderAdminList(); renderSample();
  }

  function saveDraft() {
    if (!save(KEY.draft, data)) toast('مساحة التخزين مليانة. استخدم صور أصغر.');
    hasDraft = true; renderStat();
  }
  let statText = '', statDirty = false;
  function setStat(t, dirty) {
    statText = t; statDirty = !!dirty;
    const s = $('#adminStat'); s.textContent = t; s.className = 'stat' + (dirty ? ' dirty' : '');
  }
  function renderStat() {
    if (CLOUD) { setStat(statText || 'متزامن مع الموقع', statDirty); return; }
    setStat(hasDraft ? 'فيه تعديلات محفوظة على جهازك. نزّل products.js عشان تنشرها.' : 'مفيش تعديلات', hasDraft);
  }

  function exportCode() {
    return 'window.STORE_DATA = ' + JSON.stringify(data, null, 2) + ';\n';
  }
  function downloadCode() {
    const blob = new Blob([exportCode()], { type: 'text/javascript;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'products.js';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('اتنزّل products.js. استبدل بيه الملف القديم على الاستضافة.');
  }
  function copyCode() {
    const txt = exportCode();
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      ta.remove(); toast(ok ? 'اتنسخ الكود' : 'مقدرتش أنسخ. استخدم زرار التنزيل.');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(() => toast('اتنسخ الكود'), fallback);
    } else fallback();
  }

  /* ---------- الحفظ أونلاين (فايربيز) ---------- */
  const cloudOn = () => CLOUD && fb && fb.user;
  function sync(op) {
    if (!cloudOn()) { saveDraft(); return; }
    setStat('جاري الحفظ...', false);
    Promise.resolve().then(op).then(() => setStat('اتحفظ والموقع اتحدّث', false)).catch((e) => {
      setStat(e && e.code === 'permission-denied'
        ? 'مش مسموح لك تحفظ. تأكد إن إيميلك مكتوب في قواعد Firestore.'
        : 'فشل الحفظ. جرب تاني.', true);
    });
  }
  const storeCol = () => fb.db.collection('store');
  const cloudSaveProduct = (p) => storeCol().doc(p.id).set({ json: JSON.stringify(p) });
  const cloudDeleteProduct = (id) => storeCol().doc(id).delete();
  const settingsJSON = () => JSON.stringify(Object.assign({}, data.settings, { sample: !!data.sample }));
  let settingsTimer = 0;
  function cloudSaveSettings() {
    return new Promise((resolve, reject) => {
      clearTimeout(settingsTimer);
      settingsTimer = setTimeout(() => { storeCol().doc('settings').set({ json: settingsJSON() }).then(resolve, reject); }, 600);
    });
  }
  function cloudClear(ids) {
    const b = fb.db.batch();
    ids.forEach((id) => b.delete(storeCol().doc(id)));
    b.set(storeCol().doc('settings'), { json: settingsJSON() });
    return b.commit();
  }
  function fromDocs(docs) {
    let st = null; const products = [];
    docs.forEach((d) => {
      try { const o = JSON.parse(d.json); if (d.id === 'settings') st = o; else products.push(o); } catch (e) {}
    });
    if (!st && !products.length) return null;
    const sample = !!(st && st.sample);
    if (st) delete st.sample;
    products.sort((a, b) => (b.ord || 0) - (a.ord || 0));
    return { sample: sample, settings: Object.assign({}, (window.STORE_DATA || {}).settings, st || {}), products: products };
  }
  async function fetchCloud() {
    const u = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(CFG.projectId) +
      '/databases/(default)/documents/store?pageSize=300&key=' + encodeURIComponent(CFG.apiKey);
    const r = await fetch(u, { cache: 'no-store' });
    if (!r.ok) throw new Error('cloud ' + r.status);
    const jn = await r.json();
    return fromDocs((jn.documents || []).map((d) => ({
      id: d.name.split('/').pop(),
      json: (d.fields && d.fields.json && d.fields.json.stringValue) || ''
    })));
  }
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  async function initFirebase() {
    if (fb) return fb;
    const v = '10.12.2';
    for (const n of ['app', 'auth', 'firestore']) await loadScript('https://www.gstatic.com/firebasejs/' + v + '/firebase-' + n + '-compat.js');
    firebase.initializeApp(CFG);
    const o = { auth: firebase.auth(), db: firebase.firestore(), user: null };
    await new Promise((res) => {
      let first = true;
      o.auth.onAuthStateChanged((u) => { o.user = u; if (first) { first = false; res(); } });
    });
    fb = o; return fb;
  }
  async function seedCloud(src) {
    const b = fb.db.batch();
    b.set(storeCol().doc('settings'), { json: JSON.stringify(Object.assign({}, src.settings, { sample: !!src.sample })) });
    src.products.forEach((p, i) => { p.ord = Date.now() - i * 1000; b.set(storeCol().doc(p.id), { json: JSON.stringify(p) }); });
    await b.commit();
  }
  async function enterAdmin() {
    const snap = await storeCol().get();
    let d = fromDocs(snap.docs.map((x) => ({ id: x.id, json: (x.data() || {}).json || '' })));
    if (!d) { d = clone(window.STORE_DATA); await seedCloud(d); }
    data = d;
    applySettings(); renderGrid(); renderCart(); fillSettings(); renderAdminList(); renderSample();
    setStat('متزامن مع الموقع', false);
    openLayer('admin');
  }
  async function openAdminCloud() {
    try { await initFirebase(); } catch (e) { toast('مقدرتش أتصل بفايربيز. اتأكد من النت.'); return; }
    if (fb.user) {
      try { await enterAdmin(); } catch (e) { toast('الدخول نجح بس مقدرتش أقرا البيانات. اتأكد إنك عملت Firestore.'); }
    } else {
      $('#loginError').textContent = ''; openLayer('login');
    }
  }
  async function doLogin() {
    const email = $('#l-email').value.trim(), pass = $('#l-pass').value, err = $('#loginError'), btn = $('#loginBtn');
    err.textContent = '';
    if (!email || !pass) { err.textContent = 'اكتب الإيميل والباسورد.'; return; }
    btn.disabled = true;
    try {
      await fb.auth.signInWithEmailAndPassword(email, pass);
      closeLayers();
      try { await enterAdmin(); } catch (e) { toast('الدخول نجح بس مقدرتش أقرا البيانات. اتأكد إنك عملت Firestore.'); }
    } catch (e) {
      const c = (e && e.code) || '';
      err.textContent = /invalid|wrong|not-found|credential/.test(c) ? 'الإيميل أو الباسورد غلط.'
        : /too-many/.test(c) ? 'محاولات كتير. استنى شوية وجرب تاني.' : 'حصل خطأ. جرب تاني.';
    } finally { btn.disabled = false; }
  }

  function renderSwatches() {
    $('#swatches').innerHTML = SWATCHES.map((c) =>
      '<button type="button" data-act="swatch" data-c="' + c + '" style="background:' + c + '" aria-label="لون ' + c + '" aria-pressed="false"></button>').join('') +
      '<input id="f-color" type="color" value="#2B2522" aria-label="اختار لون تاني">';
  }
  function setColor(c) {
    $('#f-color').value = c;
    $$('#swatches button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c.toLowerCase() === c.toLowerCase())));
    renderPreview();
  }
  function renderPreview() {
    $('#preview').innerHTML = formImg ? '<img src="' + formImg + '" alt="">' : tee($('#f-color').value);
  }
  function renderSample() {
    $('#sampleBox').innerHTML = (data.sample && data.products.length)
      ? '<div class="banner"><span>التيشرتات الحالية أمثلة للتجربة بس. امسحها وضيف تيشرتاتك.</span><button class="btn sm danger" data-act="clearSamples">امسح الأمثلة</button></div>'
      : '';
  }
  function renderAdminList() {
    $('#adminCount').textContent = '(' + data.products.length + ')';
    $('#adminList').innerHTML = data.products.length
      ? data.products.map((p) =>
          '<div class="arow"><div class="media">' + media(p) + '</div><div class="t"><b>' + esc(p.name) + '</b><span>' + fmt(p.price) + '</span></div>' +
          '<div class="bt"><button class="btn sm alt" data-act="edit" data-id="' + p.id + '">تعديل</button><button class="btn sm alt" data-act="delete" data-id="' + p.id + '">حذف</button></div></div>').join('')
      : '<p class="note">مفيش تيشرتات لسه. ضيف أول واحد من الفورم اللي فوق.</p>';
  }
  function fillSettings() {
    const s = data.settings;
    $('#s-name').value = s.name || ''; $('#s-wa').value = s.whatsapp || ''; $('#s-cur').value = s.currency || '';
    $('#s-fb').value = s.facebook || ''; $('#s-ig').value = s.instagram || '';
    $('#s-ann').value = s.announce || ''; $('#s-h1').value = s.heroTitle || ''; $('#s-sub').value = s.heroSub || '';
  }

  function resetForm() {
    editingId = null; formImg = '';
    $('#productForm').reset();
    $('#f-sizes').value = 'S M L XL';
    $('#formTitle').textContent = 'إضافة تيشرت جديد';
    $('#formSubmit').textContent = 'إضافة للمتجر';
    $('#formCancel').hidden = true; $('#formError').textContent = '';
    setColor('#2B2522');
  }
  function fillForm(p) {
    editingId = p.id; formImg = p.img || '';
    $('#f-name').value = p.name; $('#f-price').value = p.price; $('#f-old').value = p.old || '';
    $('#f-sizes').value = p.sizes.join(' '); $('#f-new').checked = !!p.isNew;
    setColor(p.color || '#2B2522');
    $('#formTitle').textContent = 'تعديل: ' + p.name;
    $('#formSubmit').textContent = 'حفظ التعديل';
    $('#formCancel').hidden = false;
    $('#productForm').scrollIntoView({ block: 'start' });
  }

  function submitProduct() {
    const err = $('#formError');
    const name = $('#f-name').value.trim();
    const price = Number($('#f-price').value);
    const old = Number($('#f-old').value) || 0;
    if (!name) { err.textContent = 'اكتب اسم التيشرت.'; $('#f-name').focus(); return; }
    if (!(price > 0)) { err.textContent = 'اكتب السعر بالأرقام.'; $('#f-price').focus(); return; }
    let sizes = $('#f-sizes').value.split(/[\s,،]+/).filter(Boolean);
    if (!sizes.length) sizes = ['S', 'M', 'L', 'XL'];
    const p = {
      id: editingId || ('p' + Date.now().toString(36)),
      name: name, price: price, old: old > price ? old : 0,
      color: $('#f-color').value, img: formImg, sizes: sizes, isNew: $('#f-new').checked,
      ord: ((editingId && byId(editingId)) ? byId(editingId).ord : 0) || Date.now()
    };
    const wasEdit = !!editingId;
    if (wasEdit) data.products = data.products.map((x) => (x.id === editingId ? p : x));
    else data.products.unshift(p);
    resetForm(); refreshAfterChange();
    sync(() => cloudSaveProduct(p));
    toast(wasEdit ? 'اتحفظ التعديل.' : 'اتضاف التيشرت.');
  }

  /* تصغير الصورة قبل الحفظ عشان الملف ما يتقلش */
  function readImage(file, asPng) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const im = new Image();
        im.onload = () => {
          const max = asPng ? 640 : 720;
          const k = Math.min(1, max / Math.max(im.width, im.height));
          const c = document.createElement('canvas');
          c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          const x = c.getContext('2d');
          if (!asPng) { x.fillStyle = '#F3F0EC'; x.fillRect(0, 0, c.width, c.height); }
          x.drawImage(im, 0, 0, c.width, c.height);
          resolve(asPng ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.82));
        };
        im.onerror = reject; im.src = fr.result;
      };
      fr.onerror = reject; fr.readAsDataURL(file);
    });
  }

  /* =========================================================
     الأحداث
     ========================================================= */
  const actions = {
    shop() { $('#shop').scrollIntoView({ block: 'start' }); },
    nav(t) { view.cat = t.dataset.cat; view.q = ''; $('#q').value = ''; renderNav(); renderGrid(); $('#shop').scrollIntoView({ block: 'start' }); },
    reset() { view.cat = 'all'; view.q = ''; $('#q').value = ''; renderNav(); renderGrid(); },
    open(t) { openProduct(t.dataset.id); },
    heart(t) {
      const id = t.dataset.id, i = wish.indexOf(id);
      if (i < 0) wish.push(id); else wish.splice(i, 1);
      save(KEY.wish, wish); renderBadges(); renderGrid();
      const md = $('#modal'); if (md && !md.hidden) renderModal();
    },
    size(t) { modal.size = t.dataset.s; renderModal(); },
    addToCart: addToCart,
    cartOpen() { renderCart(); openLayer('cart'); },
    closeLayers: closeLayers,
    inc(t) { stepCart(t.dataset.k, 1); },
    dec(t) { stepCart(t.dataset.k, -1); },
    remove(t) { stepCart(t.dataset.k, 'remove'); },

    /* لوحة التحكم */
    adminOpen() {
      if (CLOUD) { openAdminCloud(); return; }
      fillSettings(); renderStat(); openLayer('admin');
    },
    logout() {
      if (fb && fb.auth) fb.auth.signOut();
      if (fb) fb.user = null;
      closeLayers(); toast('اتسجّل الخروج.');
    },
    adminClose: closeLayers,
    swatch(t) { setColor(t.dataset.c); },
    clearImg() { formImg = ''; $('#f-img').value = ''; renderPreview(); },
    cancelEdit: resetForm,
    edit(t) { const p = byId(t.dataset.id); if (p) fillForm(p); },
    delete(t) {
      if (t.dataset.armed !== '1') {
        t.dataset.armed = '1'; t.textContent = 'تأكيد الحذف';
        t.classList.add('danger'); t.classList.remove('alt'); return;
      }
      const delId = t.dataset.id;
      data.products = data.products.filter((p) => p.id !== delId);
      if (editingId === delId) resetForm();
      refreshAfterChange();
      sync(() => cloudDeleteProduct(delId));
    },
    clearSamples() {
      const ids = data.products.map((p) => p.id);
      data.products = []; data.sample = false; refreshAfterChange();
      sync(() => cloudClear(ids));
      toast('اتمسحت الأمثلة. ضيف تيشرتاتك.');
    },
    download: downloadCode,
    copyCode: copyCode,
    resetDraft(t) {
      if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'تأكيد الرجوع؟'; t.classList.add('danger'); t.classList.remove('alt'); return; }
      try { localStorage.removeItem(KEY.draft); } catch (e) {}
      location.reload();
    }
  };

  document.addEventListener('click', (e) => {
    const wa = e.target.closest('#waFloat');
    if (wa && !whatsappNumber()) { e.preventDefault(); toast('رقم الواتساب لسه ما اتضافش.'); return; }
    const t = e.target.closest('[data-act]');
    if (!t) { if (e.target.id === 'modal' || e.target.id === 'scrim') closeLayers(); return; }
    const fn = actions[t.dataset.act]; if (fn) fn(t, e);
  });

  document.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'productForm') submitProduct();
    if (e.target.id === 'loginForm') doLogin();
    if (e.target.id === 'searchForm') { view.q = $('#q').value; renderGrid(); $('#shop').scrollIntoView({ block: 'start' }); }
  });

  const SETTING_FIELDS = {
    's-name': 'name', 's-wa': 'whatsapp', 's-cur': 'currency', 's-fb': 'facebook',
    's-ig': 'instagram', 's-ann': 'announce', 's-h1': 'heroTitle', 's-sub': 'heroSub'
  };
  document.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'q') { view.q = e.target.value; renderGrid(); return; }
    if (id === 'f-color') { setColor(e.target.value); return; }
    if (SETTING_FIELDS[id]) {
      data.settings[SETTING_FIELDS[id]] = e.target.value;
      applySettings(); renderGrid(); renderCart(); sync(cloudSaveSettings);
    }
  });

  document.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (e.target.id === 'sort') { view.sort = e.target.value; renderGrid(); }
    if (e.target.id === 'f-img' && f) {
      readImage(f, false).then((d) => { formImg = d; renderPreview(); })
        .catch(() => { $('#formError').textContent = 'الصورة دي مش مقروءة. جرب صورة تانية.'; });
    }
    if (e.target.id === 's-logo' && f) {
      readImage(f, true).then((d) => { data.settings.logo = d; applySettings(); sync(cloudSaveSettings); })
        .catch(() => toast('اللوجو ده مش مقروء. جرب صورة تانية.'));
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ['cart', 'modal', 'admin', 'login'].some((l) => { const el = $('#' + l); return el && !el.hidden; })) closeLayers();
  });

  /* ---------- تشغيل ---------- */
  applySettings();
  renderNav();
  renderGrid();
  renderBadges();
  initNavGlow();
  initSecretAdmin();
  if (CLOUD) {
    fetchCloud().then((d) => { if (d) data = d; }).catch(() => {}).then(() => {
      loading = false; applySettings(); renderGrid(); renderCart();
      fillSettings(); renderAdminList(); renderSample();
    });
  }
  initScrollShadow();
  {
    if (ADMIN) $('#adminBtn').hidden = false;
    renderSwatches(); setColor('#2B2522');
    if (new URLSearchParams(location.search).get('admin') === 'open') setTimeout(() => actions.adminOpen(), 0);
    fillSettings(); renderAdminList(); renderSample(); renderStat();
    if (CLOUD) {
      const br = $('#btnReset'); if (br) br.hidden = true;
      const ht = $('#howText'); if (ht) ht.textContent = 'سجّل الدخول بحسابك، وأي تعديل بتعمله هنا بيتحفظ أونلاين وبيظهر للزباين فوراً. زرار "نزّل products.js" بيطلعلك نسخة احتياطية بس.';
    } else {
      const bo = $('#btnLogout'); if (bo) bo.hidden = true;
    }
  }
})();
