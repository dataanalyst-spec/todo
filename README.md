# AAALAY · Mcube Sales Dashboard

Live call centre dashboard that reads Mcube CSV exports and renders KPIs, agent scorecards, leakage analysis, timing intelligence, and auto-generated standup scripts.

## 📁 Project Structure

```
/
├── index.html        ← Main page (no logic inside — clean HTML only)
├── dashboard.css     ← All styles
├── dashboard.js      ← All logic: CSV parsing, metrics, charts, rendering
└── data/
    └── report.csv    ← Latest Mcube export (auto-loaded on page open)
```

## 🚀 How to update the dashboard (daily workflow)

1. Go to Mcube → Reports → Call Reports → Export CSV
2. Rename the file to **`report.csv`**
3. Replace `data/report.csv` in the GitHub repo (drag & drop in GitHub UI or `git commit`)
4. Vercel auto-deploys in ~30 seconds
5. Refresh the dashboard URL — data is live

> The dashboard auto-loads `data/report.csv` on page open. No upload needed on Vercel.

## 🖥️ Local development

Open `index.html` directly in Chrome — it will show the upload screen (browsers block `fetch()` for local files). Drag & drop any Mcube CSV to load.

Or run a local server:
```bash
npx serve .
# then open http://localhost:3000
```

## 📊 CSV columns required

| Column | Used for |
|--------|----------|
| `Agent Name` | Agent grouping |
| `Start Time` | Date/hour analysis |
| `Dial Status` | ANSWER / BUSY / Executive Busy / CANCEL |
| `Answered Time` | Duration, quality/ghost classification |
| `Call Type` | inbound vs outbound split |
| `Disconnected By` | Customer / Executive / System |
| `Customer Number` | Missed inbound callback list |

All standard Mcube export columns — no renaming needed.

## ⚙️ Vercel setup

1. Push this repo to GitHub
2. Import into [vercel.com](https://vercel.com) → "Add New Project"
3. Framework: **Other** (static HTML)
4. Root directory: `/` (default)
5. Deploy → get your URL

No build step needed. Pure static HTML/CSS/JS.
