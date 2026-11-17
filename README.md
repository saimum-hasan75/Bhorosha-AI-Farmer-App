# ভরসা (Bhorsha) — কৃষকের AI সহায়

> **Snap a photo. Know the fair price. Sell with confidence.**

**Team Mathbondhu** | AgriSphere AI | FarmMarket | International AI Builders Congress 2026

---

## 🌾 Overview

Bhorsha (ভরসা, "trust") is a Bangla-first mobile web application that empowers Bangladeshi smallholder farmers at the moment of sale. Using multimodal AI for crop quality grading and transparent rule-based price calculations, it helps farmers negotiate fair prices with middlemen.

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│          Frontend (SPA)             │
│   public/index.html + app.js        │
│   Mobile-first Bangla UI            │
│   Claude Vision API (browser→API)   │
├─────────────────────────────────────┤
│        Backend (Express.js)          │
│   server.js — RESTful API (16 routes)│
│   Fair price calculations            │
│   Middleman score engine             │
├─────────────────────────────────────┤
│        Database (SQLite)             │
│   database.js — sql.js (pure JS)     │
│   8 tables, persistent on disk       │
│   bhorsha.db                         │
└─────────────────────────────────────┘
```

## 🚀 Quick Start

```bash
# Install dependencies
cd "D:\Bhorosha AI Farmer App"
npm install

# Start the server
node server.js

# Open in browser
# http://localhost:3000
```

## 📊 Database Schema (8 Tables)

| Table | Purpose |
|-------|---------|
| `dam_prices` | DAM wholesale/retail price data |
| `crop_grades` | AI grading results (grade, confidence, reasons) |
| `disputes` | Farmer grade disputes |
| `middleman_scores` | Gap% and loss calculations |
| `weather_settings` | Rain probability settings |
| `listings` | Farmer crop listings |
| `offers` | Buyer offers on listings |
| `transactions` | Escrow transactions with QR trail |

## 🔗 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health check |
| GET | `/api/prices` | DAM price data |
| POST | `/api/grades` | Save grading result |
| GET | `/api/grades` | Get recent grades |
| POST | `/api/disputes` | Log a dispute |
| GET | `/api/disputes` | Get all disputes |
| POST | `/api/middleman-score` | Calculate middleman gap |
| POST | `/api/weather` | Check weather alert |
| POST | `/api/listings` | Create a listing |
| GET | `/api/listings` | Get all listings with offers |
| POST | `/api/offers` | Submit a buyer offer |
| PATCH | `/api/offers/:id` | Accept/decline/counter offer |
| GET | `/api/transactions` | Get all transactions |
| PATCH | `/api/transactions/:id/escrow` | Advance escrow step |
| GET | `/api/kpi` | Dashboard KPI data |
| POST | `/api/reset` | Reset all data |
| POST | `/api/demo-seed` | Load demo data |

## 📱 Features

1. **📸 AI Crop Grading** — Photo → Claude Vision → Grade A/B/C with Bangla reasons
2. **💰 Middleman Score** — Transparent gap% and loss calculation
3. **🌦️ Weather Alert** — Rain probability-based selling advice
4. **📋 Listings & Offers** — Farmer-to-buyer marketplace
5. **🔐 Simulated Escrow** — 4-step payment flow with transaction hashes
6. **📱 QR Traceability** — Farmer→intermediary→consumer price trail
7. **📊 KPI Dashboard** — Average farmer share, underpayment tracking
8. **🎬 Demo Mode** — One-click sample data for presentations
9. **🎤 Voice Input** — Web Speech API in Bangla (bn-BD)
10. **🔒 Privacy** — All data stored locally in SQLite

## 🛠️ Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: SQLite via sql.js (pure JavaScript, no native compilation)
- **Frontend**: Vanilla HTML5 + CSS3 + JavaScript (no framework)
- **AI**: Claude API (claude-sonnet-4-20250514) for vision grading and Bangla advice
- **QR**: qrcode.js CDN
- **Fonts**: Noto Sans Bengali + Inter

## 📝 License

MIT — Team Mathbondhu, 2026
