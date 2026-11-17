/**
 * Bhorsha (ভরসা) Database Module
 * SQLite via sql.js (Pure JavaScript - no compilation required)
 * Tables: users, crops, dam_prices, crop_grades, disputes,
 *         middleman_scores, weather_settings, listings, offers,
 *         transactions, notifications
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'bhorsha.db');
let db = null;

// Initial 25+ real-world crops with current DAM market benchmarks (BDT)
const SEED_CROPS = [
  { name_bn: 'টমেটো', name_en: 'Tomato', category: 'সবজি', is_perishable: 1, icon: '🍅', wholesale: 35, retail: 55, trend: 'up' },
  { name_bn: 'গোল আলু', name_en: 'Potato', category: 'সবজি', is_perishable: 0, icon: '🥔', wholesale: 28, retail: 40, trend: 'stable' },
  { name_bn: 'দেশি পেঁয়াজ', name_en: 'Onion (Local)', category: 'মসলা', is_perishable: 0, icon: '🧅', wholesale: 65, retail: 85, trend: 'down' },
  { name_bn: 'আমদানি পেঁয়াজ', name_en: 'Onion (Imported)', category: 'মসলা', is_perishable: 0, icon: '🧅', wholesale: 55, retail: 75, trend: 'down' },
  { name_bn: 'রসুন (দেশি)', name_en: 'Garlic (Local)', category: 'মসলা', is_perishable: 0, icon: '🧄', wholesale: 160, retail: 210, trend: 'up' },
  { name_bn: 'কাঁচা মরিচ', name_en: 'Green Chili', category: 'মসলা', is_perishable: 1, icon: '🌶️', wholesale: 90, retail: 140, trend: 'up' },
  { name_bn: 'বেগুন (গোল)', name_en: 'Eggplant (Round)', category: 'সবজি', is_perishable: 1, icon: '🍆', wholesale: 42, retail: 65, trend: 'stable' },
  { name_bn: 'বেগুন (লম্বা)', name_en: 'Eggplant (Long)', category: 'সবজি', is_perishable: 1, icon: '🍆', wholesale: 38, retail: 60, trend: 'stable' },
  { name_bn: 'শসা', name_en: 'Cucumber', category: 'সবজি', is_perishable: 1, icon: '🥒', wholesale: 32, retail: 50, trend: 'down' },
  { name_bn: 'করলা', name_en: 'Bitter Gourd', category: 'সবজি', is_perishable: 1, icon: '🥒', wholesale: 48, retail: 75, trend: 'up' },
  { name_bn: 'পটল', name_en: 'Pointed Gourd', category: 'সবজি', is_perishable: 1, icon: '🥬', wholesale: 36, retail: 55, trend: 'stable' },
  { name_bn: 'লাউ (প্রতি পিস)', name_en: 'Bottle Gourd', category: 'সবজি', is_perishable: 1, icon: '🫑', wholesale: 40, retail: 65, trend: 'down' },
  { name_bn: 'ফুলকপি (প্রতি পিস)', name_en: 'Cauliflower', category: 'সবজি', is_perishable: 1, icon: '🥦', wholesale: 25, retail: 45, trend: 'up' },
  { name_bn: 'বাঁধাকপি (প্রতি পিস)', name_en: 'Cabbage', category: 'সবজি', is_perishable: 1, icon: '🥬', wholesale: 22, retail: 40, trend: 'stable' },
  { name_bn: 'গাজর', name_en: 'Carrot', category: 'সবজি', is_perishable: 0, icon: '🥕', wholesale: 50, retail: 75, trend: 'stable' },
  { name_bn: 'কাঁচা পেঁপে', name_en: 'Green Papaya', category: 'সবজি', is_perishable: 1, icon: '🍈', wholesale: 24, retail: 40, trend: 'down' },
  { name_bn: 'মিষ্টি কুমড়া', name_en: 'Sweet Pumpkin', category: 'সবজি', is_perishable: 0, icon: '🎃', wholesale: 26, retail: 45, trend: 'stable' },
  { name_bn: 'ঢেঁড়স', name_en: 'Okra (Ladyfinger)', category: 'সবজি', is_perishable: 1, icon: '🫛', wholesale: 38, retail: 60, trend: 'up' },
  { name_bn: 'মুলা', name_en: 'Radish', category: 'সবজি', is_perishable: 1, icon: '🥕', wholesale: 20, retail: 35, trend: 'down' },
  { name_bn: 'লাল শাক (আঁটি)', name_en: 'Red Amaranth', category: 'শাকসবজি', is_perishable: 1, icon: '🥬', wholesale: 12, retail: 25, trend: 'up' },
  { name_bn: 'পালং শাক (আঁটি)', name_en: 'Spinach', category: 'শাকসবজি', is_perishable: 1, icon: '🥬', wholesale: 15, retail: 30, trend: 'stable' },
  { name_bn: 'ধান (ব্রি-২৮)', name_en: 'Paddy (BR-28)', category: 'শস্য', is_perishable: 0, icon: '🌾', wholesale: 32, retail: 42, trend: 'stable' },
  { name_bn: 'ধান (মিনিকেট)', name_en: 'Paddy (Miniket)', category: 'শস্য', is_perishable: 0, icon: '🌾', wholesale: 38, retail: 48, trend: 'up' },
  { name_bn: 'কলা (সবরি, ডজন)', name_en: 'Banana (Sabri)', category: 'ফল', is_perishable: 1, icon: '🍌', wholesale: 75, retail: 120, trend: 'stable' },
  { name_bn: 'লেবু (প্রতি হালি)', name_en: 'Lemon (4 pcs)', category: 'ফল', is_perishable: 1, icon: '🍋', wholesale: 20, retail: 35, trend: 'up' }
];

async function initDB() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
      console.log(`✅ ডেটাবেস সফলভাবে লোড হয়েছে: ${DB_PATH}`);
    } catch (e) {
      console.warn('বিদ্যমান ডেটাবেস পড়তে সমস্যা, নতুন তৈরি করা হচ্ছে:', e.message);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
    console.log(`✅ নতুন ডেটাবেস তৈরি হয়েছে: ${DB_PATH}`);
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'farmer', 'buyer')),
      reputation_score INTEGER DEFAULT 100,
      total_deals INTEGER DEFAULT 0,
      location TEXT DEFAULT 'বাংলাদেশ',
      avatar TEXT DEFAULT '🌾',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS crops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_bn TEXT NOT NULL,
      name_en TEXT NOT NULL,
      category TEXT NOT NULL,
      is_perishable INTEGER DEFAULT 1,
      icon TEXT DEFAULT '🥬',
      unit TEXT DEFAULT 'কেজি',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dam_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      crop_id INTEGER NOT NULL,
      wholesale REAL NOT NULL,
      retail REAL NOT NULL,
      date_bn TEXT NOT NULL,
      date_en TEXT NOT NULL,
      market TEXT DEFAULT 'কারওয়ান বাজার',
      trend TEXT DEFAULT 'stable' CHECK(trend IN ('up', 'down', 'stable')),
      source TEXT DEFAULT 'DAM (কৃষি বিপণন অধিদপ্তর)',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(crop_id) REFERENCES crops(id)
    );

    CREATE TABLE IF NOT EXISTS crop_grades (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      crop_id INTEGER,
      crop_name TEXT DEFAULT 'টমেটো',
      grade TEXT NOT NULL CHECK(grade IN ('A', 'B', 'C')),
      confidence REAL NOT NULL,
      reasons TEXT,
      fair_price REAL,
      grade_adjusted_price REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS disputes (
      id TEXT PRIMARY KEY,
      grade_id TEXT,
      user_id TEXT,
      user_name TEXT,
      crop_name TEXT,
      reason TEXT,
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS middleman_scores (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      crop_id INTEGER,
      crop_name TEXT,
      grade TEXT,
      fair_price REAL NOT NULL,
      offer_price REAL NOT NULL,
      quantity REAL NOT NULL,
      gap_percent REAL NOT NULL,
      total_loss REAL NOT NULL,
      is_fair INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS weather_settings (
      id TEXT PRIMARY KEY,
      day1_prob REAL DEFAULT 0,
      day2_prob REAL DEFAULT 0,
      day3_prob REAL DEFAULT 0,
      is_perishable INTEGER DEFAULT 1,
      alert_triggered INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      farmer_name TEXT NOT NULL,
      crop_id INTEGER,
      crop_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      expected_price REAL NOT NULL,
      location TEXT,
      grade TEXT DEFAULT 'A',
      status TEXT DEFAULT 'open' CHECK(status IN ('open', 'accepted', 'declined', 'completed')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS offers (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL,
      buyer_id TEXT,
      buyer_name TEXT NOT NULL,
      buyer_phone TEXT,
      offer_price REAL NOT NULL,
      fair_price REAL,
      gap_percent REAL,
      is_fair INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined', 'countered')),
      counter_price REAL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(listing_id) REFERENCES listings(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL,
      offer_id TEXT NOT NULL,
      farmer_id TEXT,
      farmer_name TEXT,
      buyer_id TEXT,
      buyer_name TEXT,
      crop_name TEXT,
      quantity REAL,
      farmer_price REAL NOT NULL,
      intermediary_price REAL,
      consumer_price REAL,
      farmer_share_percent REAL,
      fair_price REAL,
      escrow_step INTEGER DEFAULT 0,
      escrow_log TEXT DEFAULT '[]',
      tx_hash TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed default admin and demo users
  seedDefaultUsers();

  // Seed crops and DAM prices if empty
  seedCropsAndPrices();

  saveDB();
  return db;
}

function seedDefaultUsers() {
  const adminCheck = queryOne("SELECT id FROM users WHERE phone = '01700000000'");
  if (!adminCheck) {
    const adminPass = bcrypt.hashSync('admin123', 8);
    const farmerPass = bcrypt.hashSync('farmer123', 8);
    const buyerPass = bcrypt.hashSync('buyer123', 8);

    runSQL(`INSERT INTO users (id, name, phone, password_hash, role, reputation_score, location, avatar)
            VALUES ('usr_admin', 'সিস্টেম অ্যাডমিন', '01700000000', ?, 'admin', 100, 'ঢাকা হেডকোয়ার্টার্স', '🛡️')`, [adminPass]);
    runSQL(`INSERT INTO users (id, name, phone, password_hash, role, reputation_score, location, avatar)
            VALUES ('usr_farmer', 'রহিম মিয়া (কৃষক)', '01800000000', ?, 'farmer', 98, 'নরসিংদী সদর', '👨‍🌾')`, [farmerPass]);
    runSQL(`INSERT INTO users (id, name, phone, password_hash, role, reputation_score, location, avatar)
            VALUES ('usr_buyer', 'ঢাকা পাইকারি আড়ত (করিম)', '01900000000', ?, 'buyer', 95, 'কারওয়ান বাজার, ঢাকা', '🏪')`, [buyerPass]);
    console.log('✅ ডিফল্ট অ্যাডমিন এবং ডেমো ইউজার তৈরি সম্পন্ন হয়েছে');
  }
}

function seedCropsAndPrices() {
  const cropCount = queryOne('SELECT COUNT(*) as c FROM crops');
  if (!cropCount || cropCount.c === 0) {
    console.log('🌱 ২৫+ ফসলের পাইকারি ও খুচরা তথ্য সিড করা হচ্ছে...');
    for (const crop of SEED_CROPS) {
      db.run(
        `INSERT INTO crops (name_bn, name_en, category, is_perishable, icon, unit)
         VALUES (?, ?, ?, ?, ?, 'কেজি')`,
        [crop.name_bn, crop.name_en, crop.category, crop.is_perishable, crop.icon]
      );
      const insertedCrop = queryOne('SELECT id FROM crops WHERE name_bn = ?', [crop.name_bn]);
      if (insertedCrop) {
        db.run(
          `INSERT INTO dam_prices (crop_id, wholesale, retail, date_bn, date_en, market, trend, source)
           VALUES (?, ?, ?, '২০২৪-১১-১৭', '2024-11-17', 'কারওয়ান বাজার ও শ্যামবাজার', ?, 'DAM (কৃষি বিপণন অধিদপ্তর)')`,
          [insertedCrop.id, crop.wholesale, crop.retail, crop.trend]
        );
      }
    }
    console.log('✅ ২৫+ ফসলের বাজার দর সিড সম্পন্ন হয়েছে');
  }
}

function queryAll(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  } catch (err) {
    console.error('QueryAll ত্রুটি:', sql, err.message);
    return [];
  }
}

function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

function runSQL(sql, params = []) {
  try {
    db.run(sql, params);
    saveDB();
    return true;
  } catch (err) {
    console.error('RunSQL ত্রুটি:', sql, err.message);
    return false;
  }
}

function saveDB() {
  try {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('ডেটাবেস সংরক্ষণে সমস্যা:', err.message);
  }
}

function resetDB() {
  db.run('DELETE FROM crop_grades');
  db.run('DELETE FROM middleman_scores');
  db.run('DELETE FROM disputes');
  db.run('DELETE FROM offers');
  db.run('DELETE FROM listings');
  db.run('DELETE FROM transactions');
  db.run('DELETE FROM weather_settings');
  db.run('DELETE FROM notifications');
  saveDB();
}

module.exports = {
  initDB,
  queryAll,
  queryOne,
  runSQL,
  saveDB,
  resetDB,
  SEED_CROPS
};
