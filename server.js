/**
 * Bhorsha (ভরসা) - Professional Backend Server
 * Node.js + Express + JWT Authentication + SQLite (sql.js)
 * Features: Auth, Admin Panel, 25+ Crop Benchmark, Live Search,
 *           Middleman Calculator, Escrow, Notifications & Analytics
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { initDB, queryAll, queryOne, runSQL, resetDB } = require('./database');

const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Strict Production JWT_SECRET Enforcement:
// In production, startup MUST FAIL immediately if JWT_SECRET is missing.
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (IS_PROD) {
    console.error('\n' + '='.repeat(64));
    console.error('❌ [FATAL DEPLOYMENT ERROR] JWT_SECRET is missing in production!');
    console.error('Production startup aborted. You must configure JWT_SECRET in your environment or Render dashboard.');
    console.error('='.repeat(64) + '\n');
    process.exit(1);
  } else {
    JWT_SECRET = 'bhorsha_dev_jwt_secret_key_2026';
    console.warn('⚠️ WARNING: Using development fallback JWT_SECRET. Set JWT_SECRET in production.');
  }
}

// ─── Security & Reverse Proxy (Render / Cloud Deployment) ───────────────────
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Authentication Middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'অনুগ্রহ করে লগইন করুন' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'সেশন মেয়াদোত্তীর্ণ বা অবৈধ টোকেন' });
  }
}

// Optional Auth (for public routes that can personalize if user is logged in)
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      // Ignore invalid token on optional routes
    }
  }
  next();
}

// Admin-only Guard
function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'শুধুমাত্র অ্যাডমিন এক্সেস অনুমোদিত' });
  }
  next();
}

// ─── Health Check ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Bhorsha (ভরসা) v2.0 Pro',
    message: 'সার্ভার ও ডেটাবেস সফলভাবে চলছে 🌾',
    timestamp: new Date().toISOString()
  });
});

// ─── Authentication Routes ──────────────────────────────────────────────────

// Register
app.post('/api/auth/register', (req, res) => {
  try {
    const { name, phone, password, role, location } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ success: false, error: 'নাম, মোবাইল নম্বর ও পাসওয়ার্ড আবশ্যক' });
    }

    const cleanPhone = phone.trim();
    const existing = queryOne('SELECT id FROM users WHERE phone = ?', [cleanPhone]);
    if (existing) {
      return res.status(400).json({ success: false, error: 'এই মোবাইল নম্বরে ইতোমধ্যে অ্যাকাউন্ট রয়েছে' });
    }

    const userId = 'usr_' + uuidv4().substr(0, 10);
    const hash = bcrypt.hashSync(password, 8);
    const userRole = role === 'admin' ? 'farmer' : (role || 'farmer'); // Prevent self-register as admin
    const avatar = userRole === 'farmer' ? '👨‍🌾' : '🏪';

    runSQL(
      `INSERT INTO users (id, name, phone, password_hash, role, location, avatar, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [userId, name.trim(), cleanPhone, hash, userRole, location || 'বাংলাদেশ', avatar]
    );

    const token = jwt.sign({ id: userId, name: name.trim(), phone: cleanPhone, role: userRole }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: 'রেজিস্ট্রেশন সফল হয়েছে!',
      token,
      user: { id: userId, name: name.trim(), phone: cleanPhone, role: userRole, avatar }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, error: 'সার্ভার ত্রুটি: ' + err.message });
  }
});

// Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ success: false, error: 'মোবাইল নম্বর ও পাসওয়ার্ড দিন' });
    }

    const cleanPhone = phone.trim();
    const user = queryOne('SELECT * FROM users WHERE phone = ?', [cleanPhone]);
    if (!user) {
      return res.status(401).json({ success: false, error: 'মোবাইল নম্বর বা পাসওয়ার্ড সঠিক নয়' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'মোবাইল নম্বর বা পাসওয়ার্ড সঠিক নয়' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, phone: user.phone, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'লগইন সফল হয়েছে!',
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        reputation: user.reputation_score,
        location: user.location
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'সার্ভার ত্রুটি' });
  }
});

// Quick Demo Login (for judging / hassle-free evaluation)
app.post('/api/auth/demo-login', (req, res) => {
  try {
    const role = req.body.role || 'farmer';
    let phone = '01800000000';
    if (role === 'admin') phone = '01700000000';
    if (role === 'buyer') phone = '01900000000';

    const user = queryOne('SELECT * FROM users WHERE phone = ?', [phone]);
    if (!user) return res.status(404).json({ success: false, error: 'ডেমো অ্যাকাউন্ট তৈরি হয়নি' });

    const token = jwt.sign(
      { id: user.id, name: user.name, phone: user.phone, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        reputation: user.reputation_score,
        location: user.location
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Current User Profile
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = queryOne('SELECT id, name, phone, role, reputation_score, total_deals, location, avatar, created_at FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ success: false, error: 'ইউজার পাওয়া যায়নি' });
  res.json({ success: true, user });
});

// ─── Crops & DAM Price Database ─────────────────────────────────────────────

// Get all available crops
app.get('/api/crops', (req, res) => {
  const crops = queryAll('SELECT * FROM crops ORDER BY name_bn ASC');
  res.json({ success: true, data: crops });
});

// Live Price Ticker (Wholesale & Retail for header marquee)
app.get('/api/prices/ticker', (req, res) => {
  const items = queryAll(`
    SELECT c.name_bn, c.icon, c.unit, p.wholesale, p.retail, p.trend, p.market
    FROM crops c
    JOIN dam_prices p ON c.id = p.crop_id
    GROUP BY c.id
    ORDER BY p.id DESC
    LIMIT 15
  `);
  res.json({ success: true, data: items });
});

// Get prices with filter & detailed breakdown
app.get('/api/prices', (req, res) => {
  const cropFilter = req.query.crop;
  let sql = `
    SELECT c.id as crop_id, c.name_bn, c.name_en, c.category, c.icon, c.is_perishable, c.unit,
           p.id as price_id, p.wholesale, p.retail, p.date_bn, p.market, p.trend, p.source
    FROM crops c
    JOIN dam_prices p ON c.id = p.crop_id
  `;
  const params = [];
  if (cropFilter) {
    sql += ` WHERE c.name_bn LIKE ? OR c.name_en LIKE ? `;
    params.push(`%${cropFilter}%`, `%${cropFilter}%`);
  }
  sql += ` GROUP BY c.id ORDER BY c.category, c.name_bn ASC`;

  const prices = queryAll(sql, params);
  res.json({ success: true, count: prices.length, data: prices });
});

// Instant Search Crop & Auto-match Price
app.get('/api/prices/search', (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) {
    return res.json({ success: true, data: [] });
  }

  const results = queryAll(`
    SELECT c.id as crop_id, c.name_bn, c.name_en, c.category, c.icon, c.is_perishable, c.unit,
           p.wholesale, p.retail, p.date_bn, p.trend, p.market, p.source,
           ROUND((p.retail - p.wholesale) / p.wholesale * 100, 1) as spread_percent
    FROM crops c
    JOIN dam_prices p ON c.id = p.crop_id
    WHERE c.name_bn LIKE ? OR c.name_en LIKE ? OR c.category LIKE ?
    GROUP BY c.id
    ORDER BY c.name_bn ASC
    LIMIT 10
  `, [`%${query}%`, `%${query}%`, `%${query}%`]);

  res.json({ success: true, query, data: results });
});

// Price Compare between Wholesale & Retail with Grade Adjustments
app.get('/api/prices/compare/:cropId', (req, res) => {
  const crop = queryOne(`
    SELECT c.*, p.wholesale, p.retail, p.trend, p.date_bn, p.market
    FROM crops c
    JOIN dam_prices p ON c.id = p.crop_id
    WHERE c.id = ?
    ORDER BY p.id DESC LIMIT 1
  `, [req.params.cropId]);

  if (!crop) return res.status(404).json({ success: false, error: 'ফসল পাওয়া যায়নি' });

  // Grade adjustment calculations
  const gradeA = parseFloat((crop.wholesale * 1.15).toFixed(2));
  const gradeB = parseFloat((crop.wholesale * 1.00).toFixed(2));
  const gradeC = parseFloat((crop.wholesale * 0.85).toFixed(2));
  const middlemanMargin = parseFloat((crop.retail - crop.wholesale).toFixed(2));
  const middlemanMarginPct = parseFloat(((middlemanMargin / crop.wholesale) * 100).toFixed(1));

  res.json({
    success: true,
    crop,
    grades: {
      A: { price: gradeA, label: 'সেরা মান (A)', formula: 'পাইকারি + ১৫%' },
      B: { price: gradeB, label: 'মাঝারি মান (B)', formula: 'পাইকারি ভিত্তি দর' },
      C: { price: gradeC, label: 'কম মান (C)', formula: 'পাইকারি - ১৫%' }
    },
    spread: {
      gap_bdt: middlemanMargin,
      gap_pct: middlemanMarginPct,
      summary: `পাইকারি থেকে খুচরা বাজারে মধ্যস্বত্বভোগীদের মোট মুনাফা প্রায় ${middlemanMarginPct}% (৳${middlemanMargin}/কেজি)`
    }
  });
});

// ─── Crop Grading (AI Vision Results Saved) ─────────────────────────────────
app.post('/api/grades', optionalAuth, (req, res) => {
  try {
    const { crop_id, crop_name, grade, confidence, reasons, fair_price, grade_adjusted_price } = req.body;
    const id = 'grd_' + uuidv4().substr(0, 10);
    const userId = req.user ? req.user.id : 'guest_farmer';

    runSQL(
      `INSERT INTO crop_grades (id, user_id, crop_id, crop_name, grade, confidence, reasons, fair_price, grade_adjusted_price, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [id, userId, crop_id || 1, crop_name || 'টমেটো', grade, confidence, JSON.stringify(reasons || []), fair_price || 35, grade_adjusted_price || 40.25]
    );

    res.json({ success: true, id, message: 'গ্রেডিং ফলাফল সংরক্ষিত হয়েছে' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/grades', (req, res) => {
  const grades = queryAll('SELECT * FROM crop_grades ORDER BY created_at DESC LIMIT 25');
  res.json({ success: true, data: grades });
});

// ─── Disputes ───────────────────────────────────────────────────────────────
app.post('/api/disputes', optionalAuth, (req, res) => {
  try {
    const { grade_id, crop_name, reason } = req.body;
    const id = 'dsp_' + uuidv4().substr(0, 10);
    const userId = req.user ? req.user.id : 'guest_farmer';
    const userName = req.user ? req.user.name : 'বেনামী কৃষক';

    runSQL(
      `INSERT INTO disputes (id, grade_id, user_id, user_name, crop_name, reason, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', datetime('now'))`,
      [id, grade_id || '', userId, userName, crop_name || 'টমেটো', reason || 'AI গ্রেড নিয়ে আপত্তি']
    );

    res.json({ success: true, id, message: 'আপত্তি নথিভুক্ত হয়েছে! অ্যাডমিন প্যানেল পর্যালোচনা করবে।' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/disputes', (req, res) => {
  const disputes = queryAll('SELECT * FROM disputes ORDER BY created_at DESC');
  res.json({ success: true, data: disputes });
});

// ─── Middleman Score Engine (দালাল ধরা স্কোর) ────────────────────────────────
app.post('/api/middleman-score', optionalAuth, (req, res) => {
  try {
    const { crop_id, crop_name, grade, fair_price, offer_price, quantity } = req.body;
    if (!fair_price || !offer_price || !quantity) {
      return res.status(400).json({ success: false, error: 'ন্যায্য দর, দালালের দাম ও পরিমাণ আবশ্যক' });
    }

    const fair = parseFloat(fair_price);
    const offer = parseFloat(offer_price);
    const qty = parseFloat(quantity);
    const gap_percent = ((fair - offer) / fair) * 100;
    const total_loss = (fair - offer) * qty;
    const is_fair = offer >= fair;

    const id = 'mms_' + uuidv4().substr(0, 10);
    const userId = req.user ? req.user.id : 'guest_farmer';

    runSQL(
      `INSERT INTO middleman_scores (id, user_id, crop_id, crop_name, grade, fair_price, offer_price, quantity, gap_percent, total_loss, is_fair, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [id, userId, crop_id || 1, crop_name || 'টমেটো', grade || 'A', fair, offer, qty, gap_percent, total_loss, is_fair ? 1 : 0]
    );

    res.json({
      success: true,
      id,
      gap_percent: parseFloat(gap_percent.toFixed(2)),
      total_loss: parseFloat(total_loss.toFixed(2)),
      is_fair,
      calculation_steps: [
        `১. সরকারি DAM সমন্বিত রেফারেন্স দর = ৳${fair}/কেজি`,
        `২. মধ্যস্বত্বভোগী/দালালের অফার = ৳${offer}/কেজি`,
        `৩. প্রতি কেজিতে মূল্য ঘাটতি = ৳${fair} - ৳${offer} = ৳${(fair - offer).toFixed(2)}/কেজি`,
        `৪. বঞ্চনার হার (Gap %) = (৳${(fair - offer).toFixed(2)} ÷ ৳${fair}) × ১০০ = ${gap_percent.toFixed(2)}%`,
        `৫. মোট ফসলের পরিমাণ = ${qty} কেজি`,
        `৬. সম্ভাব্য মোট আর্থিক ক্ষতি = ৳${(fair - offer).toFixed(2)} × ${qty} = ৳${total_loss.toFixed(2)}`
      ]
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Weather Alert (আবহাওয়া সতর্কতা) ───────────────────────────────────────
app.post('/api/weather', (req, res) => {
  try {
    const { day1, day2, day3, is_perishable } = req.body;
    const days = [
      { day: 1, probability: parseFloat(day1) || 0, label: 'আগামীকাল' },
      { day: 2, probability: parseFloat(day2) || 0, label: 'পরশু' },
      { day: 3, probability: parseFloat(day3) || 0, label: '৩য় দিন' }
    ];

    const high_rain_days = days.filter(d => d.probability > 60);
    const alert = (is_perishable !== false) && high_rain_days.length > 0;
    const first_alert_day = alert ? high_rain_days[0].day : null;

    const id = 'wth_' + uuidv4().substr(0, 10);
    runSQL(
      `INSERT INTO weather_settings (id, day1_prob, day2_prob, day3_prob, is_perishable, alert_triggered, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [id, days[0].probability, days[1].probability, days[2].probability, is_perishable ? 1 : 0, alert ? 1 : 0]
    );

    res.json({
      success: true,
      alert,
      first_alert_day,
      days,
      message: alert
        ? `⚠️ আগামী ${first_alert_day} দিনের মধ্যে বৃষ্টির সম্ভাবনা ${high_rain_days[0].probability}%! ফসল পচনশীল হওয়ায় দ্রুত বিক্রি নিশ্চিত করুন।`
        : `✅ আবহাওয়া অনুকূল। ফসলের কোনো বৃষ্টির ঝুঁকি নেই।`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Marketplace: Listings ──────────────────────────────────────────────────
app.get('/api/listings', (req, res) => {
  try {
    const status = req.query.status || 'open';
    let sql = `SELECT * FROM listings`;
    const params = [];

    if (status !== 'all') {
      sql += ` WHERE status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY created_at DESC`;

    const listings = queryAll(sql, params);
    const withOffers = listings.map(l => ({
      ...l,
      offers: queryAll('SELECT * FROM offers WHERE listing_id = ? ORDER BY created_at DESC', [l.id])
    }));

    res.json({ success: true, count: withOffers.length, data: withOffers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/listings', authMiddleware, (req, res) => {
  try {
    const { crop_id, crop_name, quantity, expected_price, location, grade } = req.body;
    if (!crop_name || !quantity || !expected_price) {
      return res.status(400).json({ success: false, error: 'ফসলের নাম, পরিমাণ এবং প্রত্যাশিত দর দিন' });
    }

    const id = 'lst_' + uuidv4().substr(0, 10);
    const farmerName = req.user.name;
    const userId = req.user.id;

    runSQL(
      `INSERT INTO listings (id, user_id, farmer_name, crop_id, crop_name, quantity, expected_price, location, grade, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', datetime('now'))`,
      [id, userId, farmerName, crop_id || 1, crop_name, parseFloat(quantity), parseFloat(expected_price), location || req.user.location || 'নিকটস্থ আড়ত', grade || 'A']
    );

    const saved = queryOne('SELECT * FROM listings WHERE id = ?', [id]);
    res.json({ success: true, message: 'সফলভাবে নতুন ফসলের তালিকা যুক্ত হয়েছে!', data: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Marketplace: Buyer Offers ──────────────────────────────────────────────
app.post('/api/offers', authMiddleware, (req, res) => {
  try {
    const { listing_id, offer_price, buyer_phone } = req.body;
    if (!listing_id || !offer_price) {
      return res.status(400).json({ success: false, error: 'তালিকা আইডি ও অফারের মূল্য আবশ্যক' });
    }

    const listing = queryOne('SELECT * FROM listings WHERE id = ?', [listing_id]);
    if (!listing) return res.status(404).json({ success: false, error: 'তালিকা পাওয়া যায়নি' });

    // Ownership Check: Farmer cannot bid on their own listing
    if (listing.user_id === req.user.id) {
      return res.status(400).json({ success: false, error: 'আপনি নিজের তালিকায় অফার দিতে পারবেন না' });
    }

    // Lookup crop wholesale price from DAM
    const cropPrice = queryOne(`
      SELECT p.wholesale FROM dam_prices p
      JOIN crops c ON c.id = p.crop_id
      WHERE c.name_bn = ? OR c.id = ?
      ORDER BY p.id DESC LIMIT 1
    `, [listing.crop_name, listing.crop_id]);

    const basePrice = cropPrice ? cropPrice.wholesale : listing.expected_price;
    const gradeMult = listing.grade === 'A' ? 1.15 : (listing.grade === 'C' ? 0.85 : 1.0);
    const fairPrice = parseFloat((basePrice * gradeMult).toFixed(2));

    const offer = parseFloat(offer_price);
    const gap_percent = ((fairPrice - offer) / fairPrice) * 100;
    const is_fair = offer >= fairPrice;

    const id = 'ofr_' + uuidv4().substr(0, 10);
    const buyerId = req.user.id;
    const bName = req.user.name;

    runSQL(
      `INSERT INTO offers (id, listing_id, buyer_id, buyer_name, buyer_phone, offer_price, fair_price, gap_percent, is_fair, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`,
      [id, listing_id, buyerId, bName, buyer_phone || req.user.phone || '', offer, fairPrice, gap_percent, is_fair ? 1 : 0]
    );

    // Notify farmer
    if (listing.user_id) {
      runSQL(
        `INSERT INTO notifications (id, user_id, title, message, type, created_at)
         VALUES (?, ?, 'নতুন অফার এসেছে!', ?, 'info', datetime('now'))`,
        [uuidv4(), listing.user_id, `${bName} আপনার ${listing.crop_name} (${listing.quantity} কেজি) এর জন্য ৳${offer}/কেজি অফার করেছেন।`]
      );
    }

    const saved = queryOne('SELECT * FROM offers WHERE id = ?', [id]);
    res.json({ success: true, message: 'আপনার অফার কৃষকের কাছে পাঠানো হয়েছে!', data: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Offer (Accept, Decline, Counter) with Strict Ownership & Role Check
app.patch('/api/offers/:id', authMiddleware, (req, res) => {
  try {
    const { status, counter_price } = req.body;
    const offer = queryOne('SELECT * FROM offers WHERE id = ?', [req.params.id]);
    if (!offer) return res.status(404).json({ success: false, error: 'অফার পাওয়া যায়নি' });

    const listing = queryOne('SELECT * FROM listings WHERE id = ?', [offer.listing_id]);
    if (!listing) return res.status(404).json({ success: false, error: 'সংশ্লিষ্ট তালিকা পাওয়া যায়নি' });

    const isFarmer = (listing.user_id === req.user.id);
    const isBuyer = (offer.buyer_id === req.user.id);
    const isAdmin = (req.user.role === 'admin');

    // Role & Ownership Authorization Guards:
    if (status === 'accepted' || status === 'declined') {
      if (!isFarmer && !isAdmin) {
        return res.status(403).json({ success: false, error: 'শুধুমাত্র সংশ্লিষ্ট কৃষক বা অ্যাডমিন এই অফার গ্রহণ বা প্রত্যাখ্যান করতে পারেন' });
      }
    } else if (status === 'countered') {
      if (!isFarmer && !isBuyer && !isAdmin) {
        return res.status(403).json({ success: false, error: 'শুধুমাত্র সংশ্লিষ্ট কৃষক বা ক্রেতা পাল্টা দর প্রস্তাব করতে পারেন' });
      }
    } else {
      if (!isFarmer && !isBuyer && !isAdmin) {
        return res.status(403).json({ success: false, error: 'অননুমোদিত অ্যাকশন' });
      }
    }

    if (counter_price) {
      runSQL('UPDATE offers SET status = ?, counter_price = ? WHERE id = ?', [status || 'countered', parseFloat(counter_price), req.params.id]);
    } else {
      runSQL('UPDATE offers SET status = ? WHERE id = ?', [status, req.params.id]);
    }

    // If accepted -> automatically initialize Escrow Transaction
    if (status === 'accepted') {
      runSQL('UPDATE listings SET status = ? WHERE id = ?', ['accepted', offer.listing_id]);
      const txId = 'tx_' + uuidv4().substr(0, 10);
      const finalPrice = offer.counter_price || offer.offer_price;
      const intermediaryPrice = parseFloat((finalPrice * 1.30).toFixed(2));
      const consumerPrice = parseFloat((intermediaryPrice * 1.25).toFixed(2));
      const farmerShare = parseFloat(((finalPrice / consumerPrice) * 100).toFixed(2));
      const txHash = 'TX-BN-' + Math.random().toString(36).substr(2, 9).toUpperCase();

      runSQL(
        `INSERT INTO transactions (id, listing_id, offer_id, farmer_id, farmer_name, buyer_id, buyer_name,
          crop_name, quantity, farmer_price, intermediary_price, consumer_price, farmer_share_percent,
          fair_price, escrow_step, escrow_log, tx_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, datetime('now'), datetime('now'))`,
        [
          txId, listing.id, offer.id, listing.user_id, listing.farmer_name, offer.buyer_id, offer.buyer_name,
          listing.crop_name, listing.quantity, finalPrice, intermediaryPrice, consumerPrice, farmerShare,
          offer.fair_price || finalPrice,
          JSON.stringify([{ step: 1, label: 'টাকা এসক্রোতে জমা', hash: txHash, timestamp: new Date().toLocaleString('bn-BD') }]),
          txHash
        ]
      );
    }

    res.json({ success: true, message: `অফার স্ট্যাটাস: ${status} সফল হয়েছে` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Transactions & Escrow Pipeline ─────────────────────────────────────────
app.get('/api/transactions', (req, res) => {
  const transactions = queryAll('SELECT * FROM transactions ORDER BY created_at DESC');
  res.json({ success: true, count: transactions.length, data: transactions });
});

app.get('/api/transactions/:id', (req, res) => {
  const tx = queryOne('SELECT * FROM transactions WHERE id = ?', [req.params.id]);
  if (!tx) return res.status(404).json({ success: false, error: 'লেনদেন পাওয়া যায়নি' });
  try {
    tx.escrow_log = JSON.parse(tx.escrow_log || '[]');
  } catch (e) {
    tx.escrow_log = [];
  }
  res.json({ success: true, data: tx });
});

// Advance Escrow Step - Strictly Authenticated with Role & Ownership Check
app.patch('/api/transactions/:id/escrow', authMiddleware, (req, res) => {
  try {
    const { step } = req.body;
    const tx = queryOne('SELECT * FROM transactions WHERE id = ?', [req.params.id]);
    if (!tx) return res.status(404).json({ success: false, error: 'লেনদেন পাওয়া যায়নি' });

    const isFarmer = (tx.farmer_id === req.user.id);
    const isBuyer = (tx.buyer_id === req.user.id);
    const isAdmin = (req.user.role === 'admin');

    if (!isFarmer && !isBuyer && !isAdmin) {
      return res.status(403).json({ success: false, error: 'শুধুমাত্র এই চুক্তির কৃষক, ক্রেতা বা অ্যাডমিন এসক্রো পরিবর্তন করতে পারেন' });
    }

    // Role-based step validation:
    // Step 2: Dispatch / transport -> Farmer or Admin only
    if (step === 2 && !isFarmer && !isAdmin) {
      return res.status(403).json({ success: false, error: 'শুধুমাত্র কৃষক ফসল পরিবহন শুরু করতে পারেন' });
    }
    // Step 3 or 4: Goods received / release funds -> Buyer or Admin only
    if ((step === 3 || step === 4) && !isBuyer && !isAdmin) {
      return res.status(403).json({ success: false, error: 'শুধুমাত্র ক্রেতা বা অ্যাডমিন ফসল প্রাপ্তি ও টাকা ছাড় করতে পারেন' });
    }

    let log = [];
    try { log = JSON.parse(tx.escrow_log || '[]'); } catch (e) { log = []; }

    const stepLabels = ['টাকা এসক্রোতে জমা', 'ফসল পরিবহন/রওয়ানা', 'ক্রেতা ফসল বুঝে পেয়েছেন', 'কৃষকের অ্যাকাউন্টে টাকা ছাড় সম্পন্ন'];
    const currentStepLabel = stepLabels[step - 1] || 'ধাপ সম্পন্ন';
    const hash = 'BK-' + Math.random().toString(36).substr(2, 8).toUpperCase();
    const timestamp = new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' });

    log.push({ step, label: currentStepLabel, hash, timestamp });

    runSQL(
      `UPDATE transactions
       SET escrow_step = ?, escrow_log = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [step, JSON.stringify(log), req.params.id]
    );

    // If step 4 (Funds Released) -> Increase Farmer & Buyer reputation
    if (step >= 4) {
      if (tx.farmer_id) runSQL('UPDATE users SET reputation_score = reputation_score + 2, total_deals = total_deals + 1 WHERE id = ?', [tx.farmer_id]);
      if (tx.buyer_id) runSQL('UPDATE users SET reputation_score = reputation_score + 2, total_deals = total_deals + 1 WHERE id = ?', [tx.buyer_id]);
      runSQL('UPDATE listings SET status = ? WHERE id = ?', ['completed', tx.listing_id]);
    }

    res.json({
      success: true,
      step,
      label: currentStepLabel,
      hash,
      timestamp,
      is_complete: step >= 4
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Notifications ──────────────────────────────────────────────────────────
app.get('/api/notifications', optionalAuth, (req, res) => {
  const userId = req.user ? req.user.id : null;
  let sql = 'SELECT * FROM notifications';
  const params = [];
  if (userId) {
    sql += ' WHERE user_id = ? OR user_id IS NULL';
    params.push(userId);
  }
  sql += ' ORDER BY created_at DESC LIMIT 20';
  const list = queryAll(sql, params);
  res.json({ success: true, data: list });
});

// ─── Admin Management Panel ─────────────────────────────────────────────────

// Admin Analytics Overview
app.get('/api/admin/stats', authMiddleware, adminOnly, (req, res) => {
  try {
    const userCount = queryOne('SELECT COUNT(*) as c FROM users').c;
    const cropCount = queryOne('SELECT COUNT(*) as c FROM crops').c;
    const listingCount = queryOne('SELECT COUNT(*) as c FROM listings').c;
    const activeListings = queryOne("SELECT COUNT(*) as c FROM listings WHERE status = 'open'").c;
    const txCount = queryOne('SELECT COUNT(*) as c FROM transactions').c;
    const disputeCount = queryOne('SELECT COUNT(*) as c FROM disputes').c;

    const totalVolume = queryAll('SELECT farmer_price, quantity FROM transactions')
      .reduce((acc, t) => acc + (t.farmer_price * t.quantity), 0);

    const priceAlerts = queryAll(`
      SELECT c.name_bn, c.icon, p.wholesale, p.retail, p.trend, p.market, p.date_bn
      FROM crops c
      JOIN dam_prices p ON c.id = p.crop_id
      ORDER BY p.id DESC
      LIMIT 8
    `);

    res.json({
      success: true,
      stats: {
        total_users: userCount,
        total_crops: cropCount,
        total_listings: listingCount,
        active_listings: activeListings,
        completed_transactions: txCount,
        total_volume_bdt: Math.round(totalVolume),
        active_disputes: disputeCount
      },
      recent_prices: priceAlerts
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Manage Users
app.get('/api/admin/users', authMiddleware, adminOnly, (req, res) => {
  const users = queryAll('SELECT id, name, phone, role, reputation_score, total_deals, location, created_at FROM users ORDER BY created_at DESC');
  res.json({ success: true, data: users });
});

app.delete('/api/admin/users/:id', authMiddleware, adminOnly, (req, res) => {
  if (['usr_admin', 'usr_farmer', 'usr_buyer'].includes(req.params.id)) {
    return res.status(400).json({ success: false, error: 'সিস্টেম ডিফল্ট অ্যাকাউন্ট মুছে ফেলা সম্ভব নয়' });
  }
  if (req.params.id === req.user.id) {
    return res.status(400).json({ success: false, error: 'নিজের অ্যাকাউন্ট মুছে ফেলা সম্ভব নয়' });
  }
  runSQL('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ success: true, message: 'ইউজার মুছে ফেলা হয়েছে' });
});

// Admin: Add / Update Crop Benchmark Prices
app.post('/api/admin/prices', authMiddleware, adminOnly, (req, res) => {
  try {
    const { crop_id, wholesale, retail, date_bn, market, trend } = req.body;
    if (!crop_id || !wholesale || !retail) {
      return res.status(400).json({ success: false, error: 'ফসলের আইডি, পাইকারি ও খুচরা দর দিন' });
    }

    runSQL(
      `INSERT INTO dam_prices (crop_id, wholesale, retail, date_bn, date_en, market, trend, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'DAM (অ্যাডমিন আপডেট)', datetime('now'))`,
      [
        parseInt(crop_id),
        parseFloat(wholesale),
        parseFloat(retail),
        date_bn || '২০২৪-১১-১৭',
        new Date().toISOString().split('T')[0],
        market || 'কারওয়ান বাজার',
        trend || 'stable'
      ]
    );

    res.json({ success: true, message: 'সরকারি বাজার দর আপডেট সম্পন্ন হয়েছে!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Add New Crop
app.post('/api/admin/crops', authMiddleware, adminOnly, (req, res) => {
  try {
    const { name_bn, name_en, category, is_perishable, icon, unit, wholesale, retail } = req.body;
    if (!name_bn || !wholesale || !retail) {
      return res.status(400).json({ success: false, error: 'ফসলের নাম ও প্রাথমিক দর দিন' });
    }

    runSQL(
      `INSERT INTO crops (name_bn, name_en, category, is_perishable, icon, unit, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [name_bn, name_en || name_bn, category || 'সবজি', is_perishable ? 1 : 0, icon || '🌿', unit || 'কেজি']
    );

    const newCrop = queryOne('SELECT id FROM crops WHERE name_bn = ? ORDER BY id DESC LIMIT 1', [name_bn]);
    if (newCrop) {
      runSQL(
        `INSERT INTO dam_prices (crop_id, wholesale, retail, date_bn, date_en, market, trend, source)
         VALUES (?, ?, ?, '২০২৪-১১-১৭', '2024-11-17', 'কারওয়ান বাজার', 'stable', 'DAM')`,
        [newCrop.id, parseFloat(wholesale), parseFloat(retail)]
      );
    }

    res.json({ success: true, message: 'নতুন ফসল ও মূল্য তালিকায় সফলভাবে যোগ হয়েছে!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── KPI & Global Analytics ─────────────────────────────────────────────────
app.get('/api/kpi', (req, res) => {
  try {
    const transactions = queryAll('SELECT * FROM transactions');
    const scores = queryAll('SELECT * FROM middleman_scores');
    const listings = queryAll('SELECT * FROM listings');
    const disputes = queryAll('SELECT * FROM disputes');

    const completed = transactions.filter(t => t.escrow_step >= 4);
    const avg_farmer_share = completed.length
      ? completed.reduce((s, t) => s + (t.farmer_share_percent || 0), 0) / completed.length
      : 61.5; // Benchmark default

    const total_underpayment = scores.filter(s => !s.is_fair)
      .reduce((s, m) => s + (m.total_loss || 0), 0);

    res.json({
      success: true,
      kpi: {
        avg_farmer_share_percent: parseFloat(avg_farmer_share.toFixed(1)),
        total_transactions: transactions.length,
        completed_transactions: completed.length,
        total_offers_checked: scores.length,
        fair_offers: scores.filter(s => s.is_fair).length,
        total_underpayment_identified: parseFloat(total_underpayment.toFixed(2)),
        total_listings: listings.length,
        open_listings: listings.filter(l => l.status === 'open').length,
        total_disputes: disputes.length,
        supported_crops: queryOne('SELECT COUNT(*) as c FROM crops').c
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Demo Data Seed - Guarded in Production
app.post('/api/demo-seed', optionalAuth, (req, res) => {
  // In production, block public unauthenticated invocation
  if (process.env.NODE_ENV === 'production' && (!req.user || req.user.role !== 'admin')) {
    return res.status(403).json({
      success: false,
      error: 'নিরাপত্তার স্বার্থে প্রোডাকশনে শুধুমাত্র অ্যাডমিন ডেমো ডেটা সিড করতে পারবেন'
    });
  }

  try {
    // Delete existing demo records if present to avoid unique constraint collision
    runSQL("DELETE FROM listings WHERE id = 'lst_demo_01'");
    runSQL("DELETE FROM offers WHERE id IN ('ofr_demo_01', 'ofr_demo_02')");
    runSQL("DELETE FROM middleman_scores WHERE id = 'mms_demo_01'");

    // 1. Seed demo listing
    const listingId = 'lst_demo_01';
    runSQL(
      `INSERT INTO listings (id, user_id, farmer_name, crop_id, crop_name, quantity, expected_price, location, grade, status, created_at)
       VALUES (?, 'usr_farmer', 'রহিম মিয়া', 1, 'টমেটো', 120, 36, 'নরসিংদী বাজার', 'A', 'open', datetime('now'))`,
      [listingId]
    );

    // 2. Seed 2 offers (one unfair, one fair)
    runSQL(
      `INSERT INTO offers (id, listing_id, buyer_id, buyer_name, buyer_phone, offer_price, fair_price, gap_percent, is_fair, status, created_at)
       VALUES (?, ?, 'usr_buyer_bad', 'স্থানীয় ফড়িয়া / দালাল', '01711111111', 25, 40.25, 37.89, 0, 'pending', datetime('now'))`,
      ['ofr_demo_01', listingId]
    );

    runSQL(
      `INSERT INTO offers (id, listing_id, buyer_id, buyer_name, buyer_phone, offer_price, fair_price, gap_percent, is_fair, status, created_at)
       VALUES (?, ?, 'usr_buyer', 'ঢাকা কারওয়ান বাজার আড়ত', '01900000000', 41, 40.25, -1.86, 1, 'pending', datetime('now'))`,
      ['ofr_demo_02', listingId]
    );

    // 3. Seed middleman calculation
    runSQL(
      `INSERT INTO middleman_scores (id, user_id, crop_id, crop_name, grade, fair_price, offer_price, quantity, gap_percent, total_loss, is_fair, created_at)
       VALUES ('mms_demo_01', 'usr_farmer', 1, 'টমেটো', 'A', 40.25, 25, 120, 37.89, 1830.00, 0, datetime('now'))`
    );

    res.json({ success: true, message: 'ডেমো ডেটা সফলভাবে লোড হয়েছে!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reset - Strictly Admin Only (Cannot be accessed publicly in production or development)
app.post('/api/reset', authMiddleware, adminOnly, (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_RESET !== 'true') {
    return res.status(403).json({
      success: false,
      error: 'প্রোডাকশন ডেটাবেস রিসেট নিষ্ক্রিয় করা আছে (নিরাপত্তা সুরক্ষা)'
    });
  }
  resetDB();
  res.json({ success: true, message: 'সব ডেটা সফলভাবে রিসেট হয়েছে' });
});

// ─── Single Page Application Fallback ───────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Server Startup ─────────────────────────────────────────────────────────
async function startServer() {
  await initDB();
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🌾 ভরসা (Bhorsha) v2.0 Pro সার্ভার সফলভাবে চালু হয়েছে`);
    console.log(`🔗 হোস্ট লিঙ্ক  : http://0.0.0.0:${PORT} (PORT: ${PORT})`);
    console.log(`📊 ডেটাবেস     : SQLite (sql.js) - bhorsha.db`);
    if (IS_PROD) {
      console.log(`🛡️  নিরাপত্তা     : প্রোডাকশন মোড সক্রিয় (ক্রেডেনশিয়াল লগিং নিষ্ক্রিয়)`);
    } else {
      console.log(`🛡️  অ্যাডমিন লগইন: 01700000000 (পাসওয়ার্ড: admin123)`);
      console.log(`👨‍🌾 কৃষক লগইন   : 01800000000 (পাসওয়ার্ড: farmer123)`);
      console.log(`🏪 ক্রেতা লগইন   : 01900000000 (পাসওয়ার্ড: buyer123)`);
    }
    console.log(`======================================================\n`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n🛑 সার্ভার শাটডাউন করা হচ্ছে...');
    server.close(() => {
      console.log('✅ সার্ভার সংযোগ বন্ধ সম্পন্ন।');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch(err => {
  console.error('সার্ভার রান করতে ব্যর্থ:', err);
  process.exit(1);
});
