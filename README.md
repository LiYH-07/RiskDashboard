# ⬡ RiskDashboard v2.1

美股 + 台股風險情緒監控系統 — 恐慌 & 過熱雙向偵測 + Discord 推播

> **v2.1 改用 Vite 建置**，完全相容 Node.js 18 / 20 / 22，解決舊版 react-scripts webpack 相容性問題。

---

## 環境需求

- Node.js v18 以上（建議 v20 LTS）
- npm v9 以上

確認版本：
```bash
node -v
npm -v
```

---

## 快速啟動

```bash
# 1. 解壓縮後進入專案資料夾
cd RiskDashboard

# 2. 安裝相依套件（首次約 30 秒）
npm install

# 3. 啟動開發伺服器
npm start
```

瀏覽器自動開啟 `http://localhost:3000`

> 也可用 `npm run dev`，效果相同。

---

## 建置正式版本

```bash
npm run build
# 輸出在 dist/ 資料夾
```

---

## 部署到 GitHub Pages（選用）

```bash
# 1. 安裝部署工具
npm install --save-dev gh-pages

# 2. 修改 package.json，在最外層加入：
#    "homepage": "https://<你的帳號>.github.io/RiskDashboard"

# 3. 修改 vite.config.js，將 base 改為：
#    base: '/RiskDashboard/'

# 4. 執行部署
npm run deploy
```

---

## 專案結構

```
RiskDashboard/
├── index.html              ← HTML 入口（Vite 標準位置）
├── vite.config.js          ← Vite 設定
├── package.json
├── src/
│   ├── main.jsx            ← React 進入點
│   └── RiskDashboard.jsx   ← 主程式（所有功能）
└── README.md
```

---

## 監控標的（共 9 個）

| 代號   | 名稱                   | 分類     | 備援                  |
|--------|------------------------|----------|-----------------------|
| SPY    | S&P 500 ETF            | 大盤指數 | —                     |
| QQQ    | NASDAQ 100 ETF         | 科技權重 | —                     |
| RSP    | Equal Weight S&P ETF   | 市場廣度 | —                     |
| HYG    | High Yield Bond ETF    | 信用市場 | —                     |
| VIX    | CBOE Volatility Index  | 恐慌指標 | —                     |
| TWII   | 台灣加權指數 TAIEX     | 台股大盤 | —                     |
| ES=F   | E-mini S&P 500 Futures | 美股期貨 | —                     |
| NQ=F   | NASDAQ-100 Futures     | 科技期貨 | —                     |
| TXF    | 台指期貨               | 台指期貨 | FITX=F → ^TWII        |

---

## Discord Webhook 設定

1. Discord 頻道 → 編輯頻道 → 整合 → Webhook → 新增 Webhook → 複製連結
2. Dashboard「🎮 Discord」分頁貼上 URL → 儲存 → 發送測試訊息

---

## 常見問題

**Q: npm install 很慢？**
可改用 `npm install --prefer-offline` 或安裝 pnpm 後用 `pnpm install`。

**Q: 3000 port 被佔用？**
修改 `vite.config.js` 中的 `server.port` 為其他值（如 3001）。

**Q: TXF 顯示「備援」標籤？**
正常現象，代表 TXF=F 無法取得，已自動切換至 FITX=F 或 ^TWII。

---

## 免責聲明

本程式資料僅供輔助參考，不構成任何投資建議。資料來源為 Yahoo Finance 延遲報價。
