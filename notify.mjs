/**
 * RiskDashboard — GitHub Actions 推播腳本
 * 執行方式：node notify.mjs
 * 環境變數：DISCORD_WEBHOOK_URL（存在 GitHub Secrets）
 *
 * 觸發條件：
 *   🚨 恐慌訊號 ≥ 2 個（S1～S4 + 超賣雙確認）
 *   🔥 過熱訊號 ≥ 2 個（H1～H4 + 超買雙確認）
 */

// ── 標的定義 ────────────────────────────────────────────────────────────────
const SYMBOLS = [
  { id: "SPY",  yahoo: ["SPY"]                       },
  { id: "QQQ",  yahoo: ["QQQ"]                       },
  { id: "RSP",  yahoo: ["RSP"]                       },
  { id: "HYG",  yahoo: ["HYG"]                       },
  { id: "VIX",  yahoo: ["^VIX"]                      },
  { id: "TWII", yahoo: ["^TWII"]                     },
  { id: "ES",   yahoo: ["ES=F"]                      },
  { id: "NQ",   yahoo: ["NQ=F"]                      },
  { id: "TXF",  yahoo: ["TXF=F", "FITX=F", "^TWII"] },
];

// ── Yahoo Finance endpoints ─────────────────────────────────────────────────
function makeYahooUrls(sym) {
  const path = `${encodeURIComponent(sym)}?interval=1d&range=3mo`;
  return [
    `https://query2.finance.yahoo.com/v8/finance/chart/${path}`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${path}`,
  ];
}

// GitHub Actions 環境是 Node.js 後端，可直接請求，無 CORS 限制
// 但仍需帶 User-Agent，否則 Yahoo 可能回 429
const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; RiskDashboard/2.1; +https://github.com)",
  "Accept": "application/json",
};

// ── 技術指標 ────────────────────────────────────────────────────────────────
function calcRSI(closes, period = 14) {
  const v = closes.filter(x => x !== null && !isNaN(x));
  if (v.length < period + 2) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= period; i++) { const d = v[i] - v[i-1]; d >= 0 ? g += d : l -= d; }
  let ag = g / period, al = l / period;
  for (let i = period + 1; i < v.length; i++) {
    const d = v[i] - v[i-1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (al === 0) return 100;
  return +(100 - 100 / (1 + ag / al)).toFixed(1);
}

function calcMFI(closes, period = 14) {
  const v = closes.filter(x => x !== null && !isNaN(x));
  if (v.length < period + 2) return null;
  let pos = 0, neg = 0;
  for (let i = v.length - period; i < v.length; i++) {
    const d = v[i] - v[i-1], mf = v[i] * Math.abs(d);
    d >= 0 ? pos += mf : neg += mf;
  }
  if (neg === 0) return 100;
  return +(100 - 100 / (1 + pos / neg)).toFixed(1);
}

// ── 單一 Yahoo 代號請求（含 User-Agent，無需 Proxy）────────────────────────
async function fetchOneYahoo(sym) {
  for (const url of makeYahooUrls(sym)) {
    try {
      const res = await fetch(url, {
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const meta   = result.meta;
      const closes = result.indicators?.quote?.[0]?.close ?? [];
      const valid  = closes.filter(x => x !== null && !isNaN(x));
      if (valid.length < 5) continue;

      const price    = meta.regularMarketPrice ?? valid.at(-1);
      const metaPrev = meta.chartPreviousClose ?? meta.previousClose;
      let change = 0;
      if (price && metaPrev && metaPrev !== 0) {
        change = ((price - metaPrev) / metaPrev) * 100;
      } else if (valid.length >= 2) {
        change = ((valid.at(-1) - valid.at(-2)) / valid.at(-2)) * 100;
      }
      return { price, change, rsi: calcRSI(closes), mfi: calcMFI(closes), sourceSymbol: sym };
    } catch { /* 嘗試下一個 endpoint */ }
  }
  return null;
}

async function fetchSymbol(yahooList) {
  for (const sym of yahooList) {
    const d = await fetchOneYahoo(sym);
    if (d) return d;
  }
  return null;
}

// ── 訊號判斷 ────────────────────────────────────────────────────────────────
function evalSignals(data) {
  const { SPY, QQQ, RSP, HYG, VIX } = data;

  // 恐慌訊號
  const s1 = !!(SPY?.rsi < 35 || QQQ?.rsi < 35);
  const s2 = !!(RSP?.change < -2);
  const s3 = !!(HYG?.change < -1.5);
  const s4 = !!(VIX?.price > 30);
  const oversold = !!(
    (SPY?.rsi < 30 && SPY?.mfi < 25) ||
    (QQQ?.rsi < 30 && QQQ?.mfi < 25)
  );
  const panicCount = [s1, s2, s3, s4].filter(Boolean).length;

  // 過熱訊號
  const h1 = !!(SPY?.rsi > 70 || QQQ?.rsi > 70);
  const h2 = !!(RSP?.change > 2);
  const h3 = !!(HYG?.change > 1);
  const h4 = !!(VIX?.price < 15);
  const overbought = !!(
    (SPY?.rsi > 75 && SPY?.mfi > 75) ||
    (QQQ?.rsi > 75 && QQQ?.mfi > 75)
  );
  const heatCount = [h1, h2, h3, h4].filter(Boolean).length;

  return {
    panic:  { count: panicCount,  s1, s2, s3, s4, oversold,   triggered: panicCount >= 2 },
    heat:   { count: heatCount,   h1, h2, h3, h4, overbought, triggered: heatCount  >= 2 },
  };
}

// ── Discord Embed 建構 ───────────────────────────────────────────────────────
function fmt(v)    { return v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 2 }); }
function fmtC(v)   { return v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(2) + "%"; }

function buildPanicEmbed(sig, data) {
  const { SPY, QQQ, RSP, HYG, VIX, TWII, TXF } = data;
  const ts = Math.floor(Date.now() / 1000);
  return {
    title: "🚨 恐慌底部訊號觸發",
    color: 0xef4444,
    description: `**觸發訊號 ${sig.count}/4** — 市場可能接近極端恐慌底部`,
    fields: [
      { name: "📉 S1 · SPY/QQQ RSI < 35", value: sig.s1 ? `✅ SPY RSI=${SPY?.rsi ?? "—"} / QQQ RSI=${QQQ?.rsi ?? "—"}` : "❌ 未觸發", inline: true },
      { name: "🌊 S2 · RSP 急跌 > -2%",   value: sig.s2 ? `✅ ${fmtC(RSP?.change)}` : "❌ 未觸發", inline: true },
      { name: "💸 S3 · HYG 恐慌 > -1.5%", value: sig.s3 ? `✅ ${fmtC(HYG?.change)}` : "❌ 未觸發", inline: true },
      { name: "😱 S4 · VIX > 30",          value: sig.s4 ? `✅ VIX = ${fmt(VIX?.price)}` : "❌ 未觸發", inline: true },
      { name: "⚡ RSI+MFI 超賣雙確認",     value: sig.oversold ? "✅ 確認" : "❌ 未觸發", inline: true },
      { name: "🇹🇼 台股狀況",
        value: `TWII ${fmtC(TWII?.change)} (${fmt(TWII?.price)})　TXF ${fmtC(TXF?.change)} (${fmt(TXF?.price)})`,
        inline: false },
      { name: "📊 SPY / QQQ",
        value: `SPY ${fmt(SPY?.price)} ${fmtC(SPY?.change)} RSI=${SPY?.rsi ?? "—"}\nQQQ ${fmt(QQQ?.price)} ${fmtC(QQQ?.change)} RSI=${QQQ?.rsi ?? "—"}`,
        inline: true },
    ],
    footer: { text: `Risk Sentinel v2 · GitHub Actions · <t:${ts}:T>` },
  };
}

function buildHeatEmbed(sig, data) {
  const { SPY, QQQ, RSP, HYG, VIX, TWII, TXF } = data;
  const ts = Math.floor(Date.now() / 1000);
  return {
    title: "🔥 市場過熱訊號觸發",
    color: 0xf97316,
    description: `**觸發訊號 ${sig.count}/4** — 注意回調風險`,
    fields: [
      { name: "📈 H1 · SPY/QQQ RSI > 70", value: sig.h1 ? `✅ SPY RSI=${SPY?.rsi ?? "—"} / QQQ RSI=${QQQ?.rsi ?? "—"}` : "❌ 未觸發", inline: true },
      { name: "🚀 H2 · RSP 急漲 > +2%",   value: sig.h2 ? `✅ ${fmtC(RSP?.change)}` : "❌ 未觸發", inline: true },
      { name: "💰 H3 · HYG 強漲 > +1%",   value: sig.h3 ? `✅ ${fmtC(HYG?.change)}` : "❌ 未觸發", inline: true },
      { name: "😴 H4 · VIX < 15",          value: sig.h4 ? `✅ VIX = ${fmt(VIX?.price)}` : "❌ 未觸發", inline: true },
      { name: "🔥 RSI+MFI 超買雙確認",     value: sig.overbought ? "✅ 確認" : "❌ 未觸發", inline: true },
      { name: "🇹🇼 台股狀況",
        value: `TWII ${fmtC(TWII?.change)} (${fmt(TWII?.price)})　TXF ${fmtC(TXF?.change)} (${fmt(TXF?.price)})`,
        inline: false },
      { name: "📊 SPY / QQQ",
        value: `SPY ${fmt(SPY?.price)} ${fmtC(SPY?.change)} RSI=${SPY?.rsi ?? "—"}\nQQQ ${fmt(QQQ?.price)} ${fmtC(QQQ?.change)} RSI=${QQQ?.rsi ?? "—"}`,
        inline: true },
    ],
    footer: { text: `Risk Sentinel v2 · GitHub Actions · <t:${ts}:T>` },
  };
}

// ── Discord 推播 ─────────────────────────────────────────────────────────────
async function sendDiscord(webhookUrl, embed) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });
  if (!res.ok) throw new Error(`Discord HTTP ${res.status}`);
}

// ── 主程式 ───────────────────────────────────────────────────────────────────
async function main() {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl?.startsWith("https://discord.com/api/webhooks/")) {
    console.error("❌ 未設定 DISCORD_WEBHOOK_URL，請在 GitHub Secrets 中新增");
    process.exit(1);
  }

  console.log("📡 開始抓取市場資料...");
  const results = await Promise.allSettled(
    SYMBOLS.map(s => fetchSymbol(s.yahoo).then(d => [s.id, d]))
  );

  const data = {};
  for (const r of results) {
    if (r.status === "fulfilled" && r.value[1]) {
      data[r.value[0]] = r.value[1];
    }
  }

  const fetched = Object.keys(data);
  const missing = SYMBOLS.map(s => s.id).filter(id => !data[id]);
  console.log(`✅ 取得：${fetched.join(", ")}`);
  if (missing.length) console.warn(`⚠ 無法取得：${missing.join(", ")}`);

  // 訊號判斷
  const { panic, heat } = evalSignals(data);
  console.log(`🚨 恐慌訊號：${panic.count}/4（觸發：${panic.triggered}）`);
  console.log(`🔥 過熱訊號：${heat.count}/4（觸發：${heat.triggered}）`);

  // 推播
  let sent = false;
  if (panic.triggered) {
    await sendDiscord(webhookUrl, buildPanicEmbed(panic, data));
    console.log("✅ 恐慌訊號推播成功");
    sent = true;
  }
  if (heat.triggered) {
    await sendDiscord(webhookUrl, buildHeatEmbed(heat, data));
    console.log("✅ 過熱訊號推播成功");
    sent = true;
  }
  if (!sent) {
    console.log("💤 無訊號觸發，本次不推播");
  }
}

main().catch(e => { console.error("❌ 執行失敗：", e.message); process.exit(1); });
