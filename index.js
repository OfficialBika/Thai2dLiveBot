/**
 * Myanmar 2D Live Bot — MYLUCKY2D3D (WEBHOOK / Render)
 * ===================================================
 * ✅ Live updates via EDIT mode every 5s (no spam)
 * ✅ Live animation (Bracket Bounce): ⟪82⟫ → ⟨82⟩ → 〔82〕 → 【82】
 * ✅ Final result ✅ + Pin (ONLY after final time + fiStatus === "yes")
 * ✅ Modern/Internet separate posts (9:30 AM & 2:00 PM MMT) — NO PIN
 * ✅ Single channel only
 * ✅ Admin-only: /forceam /forcepm /forcemodam /forcemodpm
 * ✅ /start /test /status /myid
 * ✅ Weekend + Holiday (SET Holiday) -> NO live/final/modint posts
 * ✅ Holiday reason auto post at 10:00 AM MMT (once/day)
 * ✅ Rate-limit (429) retry + robust error handling
 *
 * ENV (Render):
 * - BOT_TOKEN   = Telegram Bot Token
 * - CHANNEL_ID  = @YourChannelUsername OR -100xxxxxxxxxx
 * - PUBLIC_URL  = https://your-app.onrender.com   (NO trailing slash)
 * - ADMIN_ID    = your Telegram numeric ID
 *
 * Optional:
 * - EDIT_EVERY_MS = 5000
 * - LIVE_ENABLE_AM = 1 (default on)  (set 0 to disable)
 * - LIVE_ENABLE_PM = 1 (default on)  (set 0 to disable)
 * - AM_LIVE_START = 11:30   (default 11:30)
 * - AM_LIVE_END   = 12:02   (default 12:02)
 * - PM_LIVE_START = 15:55   (default 15:55)
 * - PM_LIVE_END   = 16:31   (default 16:31)
 * - HOLIDAY_NOTICE_TIME = 10:00 (default 10:00)
 */

"use strict";

const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const cheerio = require("cheerio");
const http = require("http");

// ===== ENV =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PUBLIC_URL = process.env.PUBLIC_URL;
const ADMIN_ID = process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : null;

const PORT = process.env.PORT || 3000;
const WEBHOOK_PATH = "/webhook";
const WEBHOOK_URL = `${String(PUBLIC_URL || "").replace(/\/$/, "")}${WEBHOOK_PATH}`;

const EDIT_EVERY_MS = Number(process.env.EDIT_EVERY_MS || 5000);
const LIVE_ENABLE_AM = process.env.LIVE_ENABLE_AM !== "0";
const LIVE_ENABLE_PM = process.env.LIVE_ENABLE_PM !== "0";

// Live window overrides (MMT)
const AM_LIVE_START = process.env.AM_LIVE_START || "11:30";
const AM_LIVE_END = process.env.AM_LIVE_END || "12:02";
const PM_LIVE_START = process.env.PM_LIVE_START || "15:55";
const PM_LIVE_END = process.env.PM_LIVE_END || "16:31";

// Final official moments (MMT)
const AM_FINAL_TIME = "12:01";
const PM_FINAL_TIME = "16:30";

// Holiday notice time (MMT)
const HOLIDAY_NOTICE_TIME = process.env.HOLIDAY_NOTICE_TIME || "10:00";

if (!BOT_TOKEN || !CHANNEL_ID || !PUBLIC_URL) {
  console.error("❌ Missing ENV. Required: BOT_TOKEN, CHANNEL_ID, PUBLIC_URL");
  process.exit(1);
}

// ===== BOT (WEBHOOK) =====
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

bot
  .setWebHook(WEBHOOK_URL)
  .then(() => console.log("✅ Webhook set:", WEBHOOK_URL))
  .catch((e) => console.error("❌ setWebHook error:", e.message));

// ===== API ENDPOINTS =====
const API_LIVE = "https://mylucky2d3d.com/zusksbasqyfg/vodiicunchvb"; // POST dateVal, periodVal(am/pm)
const HOME_URL = "https://mylucky2d3d.com/";
const HOLIDAY_URL = "https://mylucky2d3d.com/set-holiday";

// ===== UTIL: Myanmar Time (Asia/Yangon) =====
function nowMMTDateObj() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Yangon" }));
}
function ymdMMT() {
  const d = nowMMTDateObj();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function prettyMMT() {
  return nowMMTDateObj()
    .toLocaleString("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Yangon",
    })
    .replace(",", " •");
}
function minutesNowMMT() {
  const d = nowMMTDateObj();
  return d.getHours() * 60 + d.getMinutes();
}
function parseHMToMinutes(hm) {
  const [h, m] = String(hm).split(":").map((x) => Number(x));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}
function inRangeMinutes(startHM, endHM) {
  const now = minutesNowMMT();
  const s = parseHMToMinutes(startHM);
  const e = parseHMToMinutes(endHM);
  if (s === null || e === null) return false;
  return now >= s && now <= e;
}
function afterHM(hm) {
  const now = minutesNowMMT();
  const t = parseHMToMinutes(hm);
  if (t === null) return false;
  return now >= t;
}

// exact minute check (use range in tick to avoid missing)
function isNowHM(hm) {
  const now = minutesNowMMT();
  const t = parseHMToMinutes(hm);
  if (t === null) return false;
  return now === t;
}

// ===== Animation (Bracket Bounce) =====
let animIdx = 0;
function tickAnim() {
  animIdx = (animIdx + 1) % 4;
}
function bracketBounce(n) {
  const frames = [`⟪${n}⟫`, `⟨${n}⟩`, `〔${n}〕`, `【${n}】`];
  return frames[animIdx % frames.length];
}

// ===== SAFE HELPERS (rate limit retry) =====
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function tgRetryAfterSeconds(err) {
  const ra = err?.response?.body?.parameters?.retry_after;
  return typeof ra === "number" ? ra : null;
}
async function safeSendMessage(chatId, text, opts = {}) {
  try {
    return await bot.sendMessage(chatId, text, opts);
  } catch (e) {
    const ra = tgRetryAfterSeconds(e);
    if (ra) {
      await sleep((ra + 1) * 1000);
      return bot.sendMessage(chatId, text, opts);
    }
    throw e;
  }
}
async function safeEditMessage(chatId, messageId, text, opts = {}) {
  try {
    return await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
  } catch (e) {
    const ra = tgRetryAfterSeconds(e);
    if (ra) {
      await sleep((ra + 1) * 1000);
      return bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
    }
    const desc = e?.response?.body?.description || "";
    if (desc.includes("message is not modified")) return null;
    throw e;
  }
}
async function safePin(chatId, messageId) {
  try {
    return await bot.pinChatMessage(chatId, messageId, { disable_notification: true });
  } catch (e) {
    const ra = tgRetryAfterSeconds(e);
    if (ra) {
      await sleep((ra + 1) * 1000);
      return bot.pinChatMessage(chatId, messageId, { disable_notification: true });
    }
    throw e;
  }
}
async function safeUnpin(chatId, messageId) {
  try {
    return await bot.unpinChatMessage(chatId, messageId);
  } catch {
    return null;
  }
}

// ===== API CALLS =====
async function postForm(url, paramsObj) {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(paramsObj)) form.append(k, String(v));

  const { data } = await axios.post(url, form, {
    timeout: 20000,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
      "Accept": "application/json,text/plain,*/*",
      "Accept-Language": "en-US,en;q=0.9",
    },
    validateStatus: (s) => s >= 200 && s < 500,
  });

  // some cases return HTML error page
  if (typeof data !== "object" || data === null) {
    throw new Error("API_NON_JSON");
  }
  return data;
}

async function fetchLive(periodVal /* 'am'|'pm' */) {
  const dateVal = ymdMMT();
  return postForm(API_LIVE, { dateVal, periodVal });
}

// ===== MODERN/INTERNET (HTML scrape) =====
async function fetchModernInternetBlocks() {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,my;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": HOME_URL,
    "Upgrade-Insecure-Requests": "1",
  };

  let html = null;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await axios.get(HOME_URL, {
        timeout: 20000,
        headers,
        responseType: "text",
        validateStatus: (s) => s >= 200 && s < 500,
      });

      if (res.status === 200 && typeof res.data === "string") {
        html = res.data;
        break;
      }

      if (res.status === 403 || res.status === 406) {
        await sleep(1200);
        continue;
      }

      throw new Error(`HOME_HTTP_${res.status}`);
    } catch (e) {
      if (i === 2) throw e;
      await sleep(1200);
    }
  }

  if (!html) throw new Error("HOME_HTML_EMPTY");

  const $ = cheerio.load(html);

  function pickBlock(timeLabel) {
    let block = null;

    $(".feature-card").each((_, el) => {
      const t = $(el).text().replace(/\s+/g, " ").trim();
      if (t.includes(timeLabel) && t.includes("Modern") && t.includes("Internet")) {
        block = $(el);
      }
    });

    if (!block) return null;

    const nums = [];
    block.find(".modIntV").each((_, el) => {
      const v = $(el).text().trim();
      if (/^\d{2}$/.test(v) || v === "--") nums.push(v);
    });

    return {
      time: timeLabel,
      modern: nums[0] ?? "--",
      internet: nums[1] ?? "--",
    };
  }

  return {
    am930: pickBlock("9:30 AM"),
    pm200: pickBlock("2:00 PM"),
  };
}

// ===== Holiday / Weekend =====
function getWeekdayMMT() {
  // 0 Sun .. 6 Sat
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Yangon", weekday: "short" })
      .format(nowMMTDateObj())
      .startsWith("Sun")
      ? 0
      : new Date(nowMMTDateObj().toLocaleString("en-US", { timeZone: "Asia/Yangon" })).getDay()
  );
}

function weekdayNameFromIndex(i) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i] || "Unknown";
}

function parseDateToYMD(text) {
  const s = String(text || "").trim();

  // yyyy-mm-dd
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // dd/mm/yyyy
  const dmy = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (dmy) {
    const dd = String(dmy[1]).padStart(2, "0");
    const mm = String(dmy[2]).padStart(2, "0");
    const yyyy = dmy[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // 11/Feb/2026 or 11 Feb 2026
  const mon = s.match(/\b(\d{1,2})\s*[-/ ]\s*([A-Za-z]{3,9})\s*[-/ ]\s*(\d{4})\b/);
  if (mon) {
    const dd = String(mon[1]).padStart(2, "0");
    const mName = mon[2].toLowerCase().slice(0, 3);
    const yyyy = mon[3];
    const map = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      may: "05",
      jun: "06",
      jul: "07",
      aug: "08",
      sep: "09",
      oct: "10",
      nov: "11",
      dec: "12",
    };
    const mm = map[mName];
    if (mm) return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

let holidayCache = {
  fetchedAt: 0,
  mapByYMD: new Map(), // ymd -> name
};

async function fetchHolidayMap() {
  const now = Date.now();
  // refresh every 6 hours
  if (holidayCache.fetchedAt && now - holidayCache.fetchedAt < 6 * 60 * 60 * 1000) {
    return holidayCache.mapByYMD;
  }

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,my;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": HOME_URL,
  };

  const res = await axios.get(HOLIDAY_URL, {
    timeout: 20000,
    headers,
    responseType: "text",
    validateStatus: (s) => s >= 200 && s < 500,
  });

  if (res.status !== 200 || typeof res.data !== "string") {
    // if fail, keep old cache (if any)
    holidayCache.fetchedAt = now;
    return holidayCache.mapByYMD;
  }

  const $ = cheerio.load(res.data);
  const m = new Map();

  // Try table rows first
  $("tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (!tds || tds.length < 1) return;

    const rowText = $(tr).text().replace(/\s+/g, " ").trim();
    const ymd = parseDateToYMD(rowText);
    if (!ymd) return;

    // try holiday name (last td text)
    let name = "";
    if (tds.length >= 2) {
      name = $(tds[tds.length - 1]).text().replace(/\s+/g, " ").trim();
    } else {
      name = rowText;
    }

    if (name) m.set(ymd, name);
  });

  // Fallback: any visible blocks with date + text
  if (m.size === 0) {
    const full = $.text().split("\n").map((x) => x.trim()).filter(Boolean);
    for (const line of full) {
      const ymd = parseDateToYMD(line);
      if (ymd) {
        m.set(ymd, line);
      }
    }
  }

  holidayCache.fetchedAt = now;
  holidayCache.mapByYMD = m;
  return m;
}

// per-day result cache
let marketClosedCache = {
  ymd: null,
  result: null,
};

async function isMarketClosedToday() {
  const today = ymdMMT();
  if (marketClosedCache.ymd === today && marketClosedCache.result) {
    return marketClosedCache.result;
  }

  // Weekend in MMT
  const dayIdx = nowMMTDateObj().getDay(); // 0 Sun .. 6 Sat
  if (dayIdx === 0 || dayIdx === 6) {
    const reason = `Weekend (${weekdayNameFromIndex(dayIdx)})`;
    const out = { closed: true, reason };
    marketClosedCache = { ymd: today, result: out };
    return out;
  }

  // Holiday from site
  try {
    const map = await fetchHolidayMap();
    const name = map.get(today);
    if (name) {
      const out = { closed: true, reason: `SET Holiday — ${name}` };
      marketClosedCache = { ymd: today, result: out };
      return out;
    }
  } catch {
    // ignore: if holiday fetch fails, still allow market
  }

  const out = { closed: false, reason: "" };
  marketClosedCache = { ymd: today, result: out };
  return out;
}

function holidayNoticeTemplate(reason) {
  return (
`╭──────────────╮
│ 🛑 Market 2D Closed │
╰──────────────╯
📅 ${prettyMMT()}

ဒီနေ့ 2D မထွက်ပါဘူး။

အကြောင်းရင်း 👉 *${reason}*

နောက်နေ့ market ပြန်ဖွင့်တာနဲ့ Live ပြန်တင်ပေးပါမယ် ✅`
  );
}

// ===== MESSAGE TEMPLATES =====
function liveMessageTemplate(label, liveNum, set, value, upd) {
  tickAnim();
  const animatedNum = bracketBounce(liveNum || "--");

  return (
`╭───────────╮
│ ${label}│တိုက်ရိုက်Live
╰───────────╯
📅 ${prettyMMT()}

🎯 *Now 2D* : 🔴 *${animatedNum}*

📊 *SET*
🟢 *${set || "--"}*

💰 *VALUE*
🔵 *${value || "--"}*

🕒 Updated: *${upd || "--"}*`
  );
}

function finalMessageTemplate(label, finalNum, set, value, upd) {
  return (
`╭───────────╮
│ ${label}│ထွက်ဂဏန်း
╰───────────╯
📅 ${prettyMMT()}

🎯 *Now 2D* : *${finalNum || "--"}* ✅

📊 *SET*
🟢 *${set || "--"}*

💰 *VALUE*
🔵 *${value || "--"}*

🕒 Updated: *${upd || "--"}*`
  );
}

function modIntTemplate(timeTitle, modern, internet) {
  return (
`╭──────────────╮
│ 🧠 MODERN / INTERNET │
╰──────────────╯
📅 ${prettyMMT()}

${timeTitle}
🟢 *Modern* : *${modern || "--"}*
🔵 *Internet* : *${internet || "--"}*`
  );
}

// ===== STATE (per day) =====
let stateDate = ymdMMT();

// live edit message ids
let liveMsgIdAM = null;
let liveMsgIdPM = null;

// pinned final ids
let pinnedFinalIdAM = null;
let pinnedFinalIdPM = null;

// final done flags
let finalDoneAM = false;
let finalDonePM = false;

// daily mod/int posted lock
let modIntPostedAM = false;
let modIntPostedPM = false;

// Holiday notice (once/day)
let holidayNoticePosted = false;

// ===== DAILY RESET =====
function resetDailyStateIfNeeded() {
  const today = ymdMMT();
  if (today !== stateDate) {
    stateDate = today;

    liveMsgIdAM = null;
    liveMsgIdPM = null;

    pinnedFinalIdAM = null;
    pinnedFinalIdPM = null;

    finalDoneAM = false;
    finalDonePM = false;

    modIntPostedAM = false;
    modIntPostedPM = false;

    holidayNoticePosted = false;

    // reset per-day market cache too
    marketClosedCache = { ymd: null, result: null };

    console.log("✅ Daily state reset:", stateDate);
  }
}

// ===== FINAL GUARDS =====
// Only treat as Final if:
// - fiStatus === "yes"
// - AND (time is after official final time) OR playDtm includes "12:01"/"16:30"
function looksLikeFinalTime(period, playDtm) {
  const dtm = String(playDtm || "");
  if (period === "am") {
    if (dtm.includes("12:01")) return true;
    return afterHM(AM_FINAL_TIME);
  }
  if (period === "pm") {
    if (dtm.includes("16:30")) return true;
    return afterHM(PM_FINAL_TIME);
  }
  return false;
}

// ===== LIVE EDIT FLOW =====
async function upsertLive(period, data) {
  const isAM = period === "am";
  const label = isAM ? "🌅 MORNING" : "🌆 EVENING";
  const opts = { parse_mode: "Markdown" };

  const text = liveMessageTemplate(label, data.playLucky, data.playSet, data.playValue, data.playDtm);

  if (isAM) {
    if (!liveMsgIdAM) {
      const sent = await safeSendMessage(CHANNEL_ID, text, opts);
      liveMsgIdAM = sent.message_id;
    } else {
      await safeEditMessage(CHANNEL_ID, liveMsgIdAM, text, opts);
    }
  } else {
    if (!liveMsgIdPM) {
      const sent = await safeSendMessage(CHANNEL_ID, text, opts);
      liveMsgIdPM = sent.message_id;
    } else {
      await safeEditMessage(CHANNEL_ID, liveMsgIdPM, text, opts);
    }
  }
}

async function postFinal(period, data) {
  const isAM = period === "am";
  const label = isAM ? "🌅 MORNING" : "🌆 EVENING";
  const opts = { parse_mode: "Markdown" };

  const text = finalMessageTemplate(label, data.playLucky, data.playSet, data.playValue, data.playDtm);
  const sent = await safeSendMessage(CHANNEL_ID, text, opts);

  // unpin previous final for that period
  if (isAM && pinnedFinalIdAM) await safeUnpin(CHANNEL_ID, pinnedFinalIdAM);
  if (!isAM && pinnedFinalIdPM) await safeUnpin(CHANNEL_ID, pinnedFinalIdPM);

  await safePin(CHANNEL_ID, sent.message_id);

  if (isAM) pinnedFinalIdAM = sent.message_id;
  else pinnedFinalIdPM = sent.message_id;

  if (isAM) finalDoneAM = true;
  else finalDonePM = true;
}

// ===== MODERN/INTERNET POST (NO PIN) =====
async function postModInt(which /* "am930" | "pm200" */) {
  const blocks = await fetchModernInternetBlocks();
  if (!blocks) return;

  if (which === "am930") {
    if (modIntPostedAM) return;
    const b = blocks.am930;
    if (!b) return;
    const msg = modIntTemplate("🕤 *9:30 AM*", b.modern, b.internet);
    await safeSendMessage(CHANNEL_ID, msg, { parse_mode: "Markdown" });
    modIntPostedAM = true;
  }

  if (which === "pm200") {
    if (modIntPostedPM) return;
    const b = blocks.pm200;
    if (!b) return;
    const msg = modIntTemplate("🕑 *2:00 PM*", b.modern, b.internet);
    await safeSendMessage(CHANNEL_ID, msg, { parse_mode: "Markdown" });
    modIntPostedPM = true;
  }
}

// ===== MAIN TICKS =====
async function tickLive() {
  resetDailyStateIfNeeded();

  // ✅ closed day -> no live/final/modint
  const closed = await isMarketClosedToday();
  if (closed?.closed) return;

  // Morning window
  if (LIVE_ENABLE_AM && inRangeMinutes(AM_LIVE_START, AM_LIVE_END) && !finalDoneAM) {
    const data = await fetchLive("am").catch(() => null);
    if (data && data.status === "success") {
      if (data.fiStatus === "yes" && looksLikeFinalTime("am", data.playDtm)) {
        await postFinal("am", data);
      } else {
        await upsertLive("am", data);
      }
    }
  }

  // Evening window
  if (LIVE_ENABLE_PM && inRangeMinutes(PM_LIVE_START, PM_LIVE_END) && !finalDonePM) {
    const data = await fetchLive("pm").catch(() => null);
    if (data && data.status === "success") {
      if (data.fiStatus === "yes" && looksLikeFinalTime("pm", data.playDtm)) {
        await postFinal("pm", data);
      } else {
        await upsertLive("pm", data);
      }
    }
  }
}

async function tickModInt() {
  resetDailyStateIfNeeded();

  const closed = await isMarketClosedToday();

  // ✅ 10:00 AM MMT -> Holiday/Weekend notice (once/day)
  // Use range 10:00–10:01 so it won't miss due to interval drift
  if (!holidayNoticePosted && inRangeMinutes(HOLIDAY_NOTICE_TIME, "10:01")) {
    if (closed?.closed) {
      await safeSendMessage(CHANNEL_ID, holidayNoticeTemplate(closed.reason), { parse_mode: "Markdown" });
      holidayNoticePosted = true;
    }
  }

  // closed day -> do not post mod/int
  if (closed?.closed) return;

  // 9:30 AM window (9:30–9:33)
  if (inRangeMinutes("09:30", "09:33")) {
    await postModInt("am930").catch(() => null);
  }

  // 2:00 PM window (14:00–14:03)
  if (inRangeMinutes("14:00", "14:03")) {
    await postModInt("pm200").catch(() => null);
  }
}

// loops
setInterval(() => {
  tickLive().catch((e) => console.log("Live tick error:", e.message));
}, EDIT_EVERY_MS);

setInterval(() => {
  tickModInt().catch((e) => console.log("ModInt tick error:", e.message));
}, 20 * 1000);

// ===== ADMIN HELPERS =====
function isAdmin(msg) {
  if (!ADMIN_ID) return false;
  return msg?.from?.id === ADMIN_ID;
}
async function denyNotAdmin(chatId) {
  return safeSendMessage(chatId, "⛔ ဒီ command ကို Admin ပဲသုံးလို့ရပါတယ်။");
}
async function denyClosedDay(chatId, reason) {
  return safeSendMessage(chatId, `🛑 ဒီနေ့ Market ပိတ်ပါတယ်။\nအကြောင်းရင်း: ${reason}`);
}

// ===== COMMANDS =====
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  const text =
`🎯 Myanmar 2D Live Bot

⏰ Market Time (Myanmar)
🌅 Morning Live : ${AM_LIVE_START} – ${AM_LIVE_END}
🌆 Evening Live : ${PM_LIVE_START} – ${PM_LIVE_END}

🔴 Live = Red dot (Edit mode + Animation)
✅ Final = Check + Pin (Only after ${AM_FINAL_TIME} / ${PM_FINAL_TIME})

🧠 Modern/Internet (Separate posts)
🕤 9:30 AM  •  🕑 2:00 PM

🛑 Weekend + Holiday = NO posts
📣 Holiday Notice = ${HOLIDAY_NOTICE_TIME} AM (MMT)

Channel ကို join ပါ 👇`;

  await safeSendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [[{ text: "🔔 Join 2D Live Channel", url: "https://t.me/Live2DSet" }]],
    },
  });
});

bot.onText(/\/test/, async (msg) => {
  try {
    await safeSendMessage(CHANNEL_ID, "✅ Test post OK (channel)");
    await safeSendMessage(msg.chat.id, "✅ Test post sent to channel");
  } catch (e) {
    await safeSendMessage(msg.chat.id, `❌ Test failed: ${e.message}`);
  }
});

bot.onText(/\/status/, async (msg) => {
  const closed = await isMarketClosedToday().catch(() => ({ closed: false, reason: "" }));
  const s =
`📌 Bot Status
📅 Date (MMT): ${ymdMMT()}
⏱ Edit interval: ${EDIT_EVERY_MS}ms

🛑 Closed today: ${closed.closed ? "YES" : "NO"}
📣 Close reason: ${closed.closed ? closed.reason : "-"}

🌅 AM live msg: ${liveMsgIdAM ? "YES" : "NO"}
🌆 PM live msg: ${liveMsgIdPM ? "YES" : "NO"}

✅ Final AM done: ${finalDoneAM ? "YES" : "NO"}
✅ Final PM done: ${finalDonePM ? "YES" : "NO"}

🧠 Mod/Int AM posted: ${modIntPostedAM ? "YES" : "NO"}
🧠 Mod/Int PM posted: ${modIntPostedPM ? "YES" : "NO"}

📣 Holiday notice posted: ${holidayNoticePosted ? "YES" : "NO"}

🔐 Admin ID set: ${ADMIN_ID ? "YES" : "NO"}
📢 Channel: ${CHANNEL_ID}`;

  await safeSendMessage(msg.chat.id, s);
});

bot.onText(/\/myid/, async (msg) => {
  await safeSendMessage(msg.chat.id, `🆔 Your Telegram ID: ${msg.from.id}`);
});

// Admin: force live/final (blocked on closed day)
bot.onText(/\/forceam/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg)) return denyNotAdmin(chatId);

  const closed = await isMarketClosedToday().catch(() => ({ closed: false, reason: "" }));
  if (closed.closed) return denyClosedDay(chatId, closed.reason);

  try {
    const data = await fetchLive("am");
    if (!data || data.status !== "success") {
      return safeSendMessage(chatId, `⚠️ AM fetch မရပါ (status: ${data?.status || "unknown"})`);
    }

    if (data.fiStatus === "yes" && looksLikeFinalTime("am", data.playDtm)) {
      await postFinal("am", data);
      return safeSendMessage(chatId, "✅ /forceam → Final posted + pinned");
    } else {
      await upsertLive("am", data);
      return safeSendMessage(chatId, "✅ /forceam → Live updated (edit mode)");
    }
  } catch (e) {
    return safeSendMessage(chatId, `❌ /forceam error: ${e.message}`);
  }
});

bot.onText(/\/forcepm/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg)) return denyNotAdmin(chatId);

  const closed = await isMarketClosedToday().catch(() => ({ closed: false, reason: "" }));
  if (closed.closed) return denyClosedDay(chatId, closed.reason);

  try {
    const data = await fetchLive("pm");
    if (!data || data.status !== "success") {
      return safeSendMessage(chatId, `⚠️ PM fetch မရပါ (status: ${data?.status || "unknown"})`);
    }

    if (data.fiStatus === "yes" && looksLikeFinalTime("pm", data.playDtm)) {
      await postFinal("pm", data);
      return safeSendMessage(chatId, "✅ /forcepm → Final posted + pinned");
    } else {
      await upsertLive("pm", data);
      return safeSendMessage(chatId, "✅ /forcepm → Live updated (edit mode)");
    }
  } catch (e) {
    return safeSendMessage(chatId, `❌ /forcepm error: ${e.message}`);
  }
});

// Admin: force modern/internet posts (NO PIN) (blocked on closed day)
bot.onText(/\/forcemodam/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg)) return denyNotAdmin(chatId);

  const closed = await isMarketClosedToday().catch(() => ({ closed: false, reason: "" }));
  if (closed.closed) return denyClosedDay(chatId, closed.reason);

  try {
    modIntPostedAM = false;
    await postModInt("am930");
    await safeSendMessage(chatId, "✅ /forcemodam → Posted 9:30 AM Modern/Internet");
  } catch (e) {
    await safeSendMessage(chatId, `❌ /forcemodam error: ${e.message}`);
  }
});

bot.onText(/\/forcemodpm/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg)) return denyNotAdmin(chatId);

  const closed = await isMarketClosedToday().catch(() => ({ closed: false, reason: "" }));
  if (closed.closed) return denyClosedDay(chatId, closed.reason);

  try {
    modIntPostedPM = false;
    await postModInt("pm200");
    await safeSendMessage(chatId, "✅ /forcemodpm → Posted 2:00 PM Modern/Internet");
  } catch (e) {
    await safeSendMessage(chatId, `❌ /forcemodpm error: ${e.message}`);
  }
});

// ===== HTTP SERVER (Webhook Receiver) =====
http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url === WEBHOOK_PATH) {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const update = JSON.parse(body);
          bot.processUpdate(update);
        } catch {}
        res.writeHead(200);
        res.end("OK");
      });
      return;
    }

    // health check
    res.writeHead(200);
    res.end("Bot is running");
  })
  .listen(PORT, () => console.log("✅ Server running on port", PORT));
