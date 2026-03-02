/**
 * Myanmar 2D Live Bot — VVVIP 2D (Socket.IO) (WEBHOOK / Render)
 * ============================================================
 * ✅ Live updates via EDIT mode every 5s (no spam)
 * ✅ Pro Live animation (heartbeat + dot + bracket + ticker bar)
 * ✅ Final result ✅ + Pin (ONLY after final time) — Final is NORMAL number (no animation)
 * ✅ Modern/Internet separate posts (9:30 AM & 2:00 PM MMT) — NO PIN
 * ✅ Weekend + Holiday (SET Holiday) -> NO live/final/modint posts
 * ✅ Holiday/Weekend reason auto post at 10:00 AM MMT (once/day)
 * ✅ Admin-only: /forceam /forcepm /forcemodam /forcemodpm /forceholiday
 * ✅ /start /test /status /myid
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
 * - MODINT_AM_START = 09:30 (default 09:30)
 * - MODINT_AM_END   = 09:33 (default 09:33)
 * - MODINT_PM_START = 14:00 (default 14:00)
 * - MODINT_PM_END   = 14:03 (default 14:03)
 */

"use strict";

const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const cheerio = require("cheerio");
const http = require("http");
const { io } = require("socket.io-client");

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

// Mod/Int windows
const MODINT_AM_START = process.env.MODINT_AM_START || "09:30";
const MODINT_AM_END = process.env.MODINT_AM_END || "09:33";
const MODINT_PM_START = process.env.MODINT_PM_START || "14:00";
const MODINT_PM_END = process.env.MODINT_PM_END || "14:03";

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

// ===== VVVIP 2D Socket.IO API =====
const VVVIP_SOCKET_URL = "https://live.higginkk.org:4002";
// (PCAPdroid မှာ host: live.higginkk.org:4002)

// ===== SET Holiday Page (kept from mylucky) =====
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

// ===== Pro Live Animation Helpers =====
let animIdx = 0;
function tickAnim() {
  animIdx = (animIdx + 1) % 60;
}
function livePulseDot() {
  const dots = ["🔴", "🟩", "🟡", "🟪"];
  return dots[animIdx % dots.length];
}
function heartPulse() {
  const hearts = ["💛", "❤️", "💚", "💖"];
  return hearts[animIdx % hearts.length];
}
function bracketBounce(n) {
  const frames = [
    `⟪${n}⟫`, `⟨${n}⟩`, `(${n})`, `⟮${n}⟯`,
    `〔${n}〕`, `{${n}}`, `【${n}】`, `〖${n}〗`,
    `「${n}」`, `『${n}』`
  ];
  return frames[animIdx % frames.length];
}
function tickerBar() {
  const bars = ["▁","▂","▃","▄","▅","▆","▇","█","▇","▆","▅","▄","▃","▂"];
  return bars[animIdx % bars.length];
}
function fmtNum(x) {
  const s = String(x ?? "").trim();
  if (!s || s === "--") return "--";
  const n = Number(s.replace(/,/g, ""));
  if (Number.isNaN(n)) return s;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
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

// ===== Holiday helpers (Weekend + SET Holiday page) =====
function weekdayNameFromIndex(i) {
  return ["တနင်္ဂနွေနေ့", "တနင်္လာနေ့", "အင်္ဂါနေ့", "ဗုဒ္ဓဟူးနေ့", "ကြာသပတေးနေ့", "သောကြနေ့", "စနေနေ့"][i] || "Unknown";
}
function parseDateToYMD(text) {
  const s = String(text || "").trim();
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (dmy) {
    const dd = String(dmy[1]).padStart(2, "0");
    const mm = String(dmy[2]).padStart(2, "0");
    const yyyy = dmy[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const mon = s.match(/\b(\d{1,2})\s*[-/ ]\s*([A-Za-z]{3,9})\s*[-/ ]\s*(\d{4})\b/);
  if (mon) {
    const dd = String(mon[1]).padStart(2, "0");
    const mName = mon[2].toLowerCase().slice(0, 3);
    const yyyy = mon[3];
    const map = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
    const mm = map[mName];
    if (mm) return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

let holidayCache = { fetchedAt: 0, mapByYMD: new Map() };

async function fetchHolidayMap() {
  const now = Date.now();
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
    holidayCache.fetchedAt = now;
    return holidayCache.mapByYMD;
  }

  const $ = cheerio.load(res.data);
  const m = new Map();

  $("tr").each((_, tr) => {
    const rowText = $(tr).text().replace(/\s+/g, " ").trim();
    const ymd = parseDateToYMD(rowText);
    if (!ymd) return;

    const tds = $(tr).find("td");
    let name = "";
    if (tds && tds.length >= 2) {
      name = $(tds[tds.length - 1]).text().replace(/\s+/g, " ").trim();
    } else {
      name = rowText;
    }
    if (name) m.set(ymd, name);
  });

  holidayCache.fetchedAt = now;
  holidayCache.mapByYMD = m;
  return m;
}

let marketClosedCache = { ymd: null, result: null };

async function isMarketClosedToday() {
  const today = ymdMMT();
  if (marketClosedCache.ymd === today && marketClosedCache.result) return marketClosedCache.result;

  const dayIdx = nowMMTDateObj().getDay(); // 0 Sun .. 6 Sat
  if (dayIdx === 0 || dayIdx === 6) {
    const out = { closed: true, reason: `Weekend (${weekdayNameFromIndex(dayIdx)})` };
    marketClosedCache = { ymd: today, result: out };
    return out;
  }

  try {
    const map = await fetchHolidayMap();
    const name = map.get(today);
    if (name) {
      const out = { closed: true, reason: `SET Holiday — ${name}` };
      marketClosedCache = { ymd: today, result: out };
      return out;
    }
  } catch {}

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

နောက်နေ့ 2D market ပြန်ဖွင့်တာနဲ့ Live ပြန်တင်ပေးပါမယ် ✅`
  );
}

// ===== VVVIP LIVE DATA CACHE (from socket) =====
let vvip = {
  connected: false,
  lastAt: 0,
  data: null, // normalized
  lastError: "",
};

function normalizeVVVIPPayload(payload) {
  // payload looks like:
  // { event:"data", data:{ morningRound:{set,value,digit}, eveningRound:{...}, modernMorning, internetMorning, modernEvening, internetEvening, serverTime, updatedAt, isRunning, ... } }
  const d = payload?.data || payload?.data?.data || payload; // safe fallback
  const core = d?.data ? d.data : d; // if wrapped

  const morning = core?.morningRound || {};
  const evening = core?.eveningRound || {};

  return {
    serverTime: core?.serverTime || "",       // string from server
    updatedAt: core?.updatedAt || "",         // ISO string often
    isRunning: core?.isRunning,               // boolean (if provided)
    tw: core?.tw ?? core?.TW ?? "",
    // rounds
    am: {
      set: morning?.set ?? "--",
      value: morning?.value ?? "--",
      digit: morning?.digit ?? "--",
    },
    pm: {
      set: evening?.set ?? "--",
      value: evening?.value ?? "--",
      digit: evening?.digit ?? "--",
    },
    // modern/internet
    modInt: {
      am: {
        modern: core?.modernMorning ?? "--",
        internet: core?.internetMorning ?? "--",
      },
      pm: {
        modern: core?.modernEvening ?? "--",
        internet: core?.internetEvening ?? "--",
      },
    },
  };
}

// ===== Connect Socket.IO =====
function startVVVIPSocket() {
  const socket = io(VVVIP_SOCKET_URL, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1500,
    timeout: 15000,
  });

  socket.on("connect", () => {
    vvip.connected = true;
    vvip.lastError = "";
    console.log("✅ VVVIP socket connected:", socket.id);
  });

  socket.on("disconnect", (reason) => {
    vvip.connected = false;
    console.log("⚠️ VVVIP socket disconnected:", reason);
  });

  socket.on("connect_error", (err) => {
    vvip.connected = false;
    vvip.lastError = err?.message || "connect_error";
    console.log("❌ VVVIP connect_error:", vvip.lastError);
  });

  // Many servers emit "data" event; if not, we also listen to any event
  socket.on("data", (payload) => {
    try {
      vvip.data = normalizeVVVIPPayload({ data: payload });
      vvip.lastAt = Date.now();
    } catch (e) {
      vvip.lastError = e.message;
    }
  });

  socket.onAny((event, payload) => {
    // In your PCAP: {"event":"data","data":{...}}
    // Sometimes server sends object with event field.
    try {
      if (event === "message" || event === "data" || event === "live") {
        // handled above or here
      }
      if (payload && typeof payload === "object") {
        const maybe = payload?.event === "data" ? payload : null;
        if (maybe) {
          vvip.data = normalizeVVVIPPayload(maybe);
          vvip.lastAt = Date.now();
        }
      }
    } catch {}
  });

  return socket;
}

startVVVIPSocket();

// ===== MESSAGE TEMPLATES =====
function liveMessageTemplate(label, digit, set, value, serverTime) {
  tickAnim();
  const n = bracketBounce(digit || "--");
  const dot = livePulseDot();
  const heart = heartPulse();

  return (
`╭─────────────╮
│ ${heart} ${label}│တိုက်ရိုက်Live
╰─────────────╯
📅 ${prettyMMT()}

🎯 *Now 2D* : ${dot} *${n}*

🟢 *SET*   ${tickerBar()}  *${fmtNum(set)}*
🔵 *VALUE* ${tickerBar()}  *${fmtNum(value)}*

🕒 Server: *${serverTime || "--"}*`
  );
}

function finalMessageTemplate(label, digit, set, value, serverTime) {
  return (
`╭───────────╮
│ ${label}│ထွက်ဂဏန်း
╰───────────╯
📅 ${prettyMMT()}

🎯 *Now 2D* : *${digit || "--"}* ✅

🟢 *SET* : *${fmtNum(set)}*
🔵 *VALUE* : *${fmtNum(value)}*

🕒 Server: *${serverTime || "--"}*`
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
let liveMsgIdAM = null;
let liveMsgIdPM = null;

let pinnedFinalIdAM = null;
let pinnedFinalIdPM = null;

let finalDoneAM = false;
let finalDonePM = false;

let modIntPostedAM = false;
let modIntPostedPM = false;

let holidayNoticePosted = false;

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

    marketClosedCache = { ymd: null, result: null };

    console.log("✅ Daily state reset:", stateDate);
  }
}

// ===== Final guard (time-based only) =====
function isFinalTime(period) {
  return period === "am" ? afterHM(AM_FINAL_TIME) : afterHM(PM_FINAL_TIME);
}

// ===== LIVE POST/EDIT =====
async function upsertLive(period, snap) {
  const isAM = period === "am";
  const label = isAM ? "🌅 မနက်" : "🌆 ညနေ";
  const opts = { parse_mode: "Markdown" };

  const d = isAM ? snap.am : snap.pm;
  const text = liveMessageTemplate(label, d.digit, d.set, d.value, snap.serverTime);

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

async function postFinal(period, snap) {
  const isAM = period === "am";
  const label = isAM ? "🌅 မနက်" : "🌆 ညနေ";
  const opts = { parse_mode: "Markdown" };

  const d = isAM ? snap.am : snap.pm;
  const text = finalMessageTemplate(label, d.digit, d.set, d.value, snap.serverTime);
  const sent = await safeSendMessage(CHANNEL_ID, text, opts);

  if (isAM && pinnedFinalIdAM) await safeUnpin(CHANNEL_ID, pinnedFinalIdAM);
  if (!isAM && pinnedFinalIdPM) await safeUnpin(CHANNEL_ID, pinnedFinalIdPM);

  await safePin(CHANNEL_ID, sent.message_id);

  if (isAM) pinnedFinalIdAM = sent.message_id;
  else pinnedFinalIdPM = sent.message_id;

  if (isAM) finalDoneAM = true;
  else finalDonePM = true;
}

// ===== MODERN/INTERNET POST (from VVVIP socket data) =====
async function postModInt(which /* "am930" | "pm200" */, snap) {
  if (!snap?.modInt) return;

  if (which === "am930") {
    if (modIntPostedAM) return;
    const b = snap.modInt.am;
    const msg = modIntTemplate("🕤 *9:30 AM*", b.modern, b.internet);
    await safeSendMessage(CHANNEL_ID, msg, { parse_mode: "Markdown" });
    modIntPostedAM = true;
  }

  if (which === "pm200") {
    if (modIntPostedPM) return;
    const b = snap.modInt.pm;
    const msg = modIntTemplate("🕑 *2:00 PM*", b.modern, b.internet);
    await safeSendMessage(CHANNEL_ID, msg, { parse_mode: "Markdown" });
    modIntPostedPM = true;
  }
}

// ===== GET SNAPSHOT (safe) =====
function getSnap() {
  if (!vvip.data) return null;
  return vvip.data;
}

// ===== MAIN TICKS =====
async function tickLive() {
  resetDailyStateIfNeeded();

  const closed = await isMarketClosedToday();
  if (closed?.closed) return;

  const snap = getSnap();
  if (!snap) return;

  // AM live window
  if (LIVE_ENABLE_AM && inRangeMinutes(AM_LIVE_START, AM_LIVE_END) && !finalDoneAM) {
    // If final time reached -> post final once, else edit live
    if (isFinalTime("am")) {
      await postFinal("am", snap);
    } else {
      await upsertLive("am", snap);
    }
  }

  // PM live window
  if (LIVE_ENABLE_PM && inRangeMinutes(PM_LIVE_START, PM_LIVE_END) && !finalDonePM) {
    if (isFinalTime("pm")) {
      await postFinal("pm", snap);
    } else {
      await upsertLive("pm", snap);
    }
  }
}

async function tickModIntAndHolidayNotice() {
  resetDailyStateIfNeeded();

  const closed = await isMarketClosedToday();

  // 10:00–10:01 holiday notice once/day
  if (!holidayNoticePosted && inRangeMinutes(HOLIDAY_NOTICE_TIME, "10:01")) {
    if (closed?.closed) {
      await safeSendMessage(CHANNEL_ID, holidayNoticeTemplate(closed.reason), { parse_mode: "Markdown" });
      holidayNoticePosted = true;
    }
  }

  if (closed?.closed) return;

  const snap = getSnap();
  if (!snap) return;

  // Mod/Int windows
  if (inRangeMinutes(MODINT_AM_START, MODINT_AM_END)) {
    await postModInt("am930", snap).catch(() => null);
  }
  if (inRangeMinutes(MODINT_PM_START, MODINT_PM_END)) {
    await postModInt("pm200", snap).catch(() => null);
  }
}

// loops
setInterval(() => {
  tickLive().catch((e) => console.log("Live tick error:", e.message));
}, EDIT_EVERY_MS);

setInterval(() => {
  tickModIntAndHolidayNotice().catch((e) => console.log("ModInt tick error:", e.message));
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
  return safeSendMessage(chatId, `🛑 ဒီနေ့ 2D Market ပိတ်ပါတယ်။\nအကြောင်းရင်းက: ${reason}`);
}

// ===== COMMANDS =====
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const text =
`🎯 Myanmar 2D Live Bot (VVVIP Socket)

⏰ Market Time (Myanmar)
🌅 မနက် Live : ${AM_LIVE_START} – ${AM_LIVE_END}
🌆 ညနေ Live : ${PM_LIVE_START} – ${PM_LIVE_END}

🔴 Live = Edit mode + Pro animation
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
  const snap = getSnap();
  const s =
`📌 Bot Status
📅 Date (MMT): ${ymdMMT()}
⏱ Edit interval: ${EDIT_EVERY_MS}ms

🛑 Closed today: ${closed.closed ? "YES" : "NO"}
📣 Close reason: ${closed.closed ? closed.reason : "-"}

🔌 VVVIP socket: ${vvip.connected ? "CONNECTED" : "DISCONNECTED"}
🕒 VVVIP last data: ${vvip.lastAt ? new Date(vvip.lastAt).toLocaleString() : "NONE"}
❗ VVVIP last error: ${vvip.lastError || "-"}

🌅 AM live msg: ${liveMsgIdAM ? "YES" : "NO"}
🌆 PM live msg: ${liveMsgIdPM ? "YES" : "NO"}

✅ Final AM done: ${finalDoneAM ? "YES" : "NO"}
✅ Final PM done: ${finalDonePM ? "YES" : "NO"}

🧠 Mod/Int AM posted: ${modIntPostedAM ? "YES" : "NO"}
🧠 Mod/Int PM posted: ${modIntPostedPM ? "YES" : "NO"}

📣 Holiday notice posted: ${holidayNoticePosted ? "YES" : "NO"}

🔐 Admin ID set: ${ADMIN_ID ? "YES" : "NO"}
📢 Channel: ${CHANNEL_ID}

🧾 ServerTime: ${snap?.serverTime || "-"}`;

  await safeSendMessage(msg.chat.id, s);
});

bot.onText(/\/myid/, async (msg) => {
  await safeSendMessage(msg.chat.id, `🆔 Your Telegram ID: ${msg.from.id}`);
});

// Admin: force AM/PM (use current socket snap)
bot.onText(/\/forceam/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg)) return denyNotAdmin(chatId);

  const closed = await isMarketClosedToday().catch(() => ({ closed: false, reason: "" }));
  if (closed.closed) return denyClosedDay(chatId, closed.reason);

  const snap = getSnap();
  if (!snap) return safeSendMessage(chatId, "⚠️ VVVIP data မရသေးပါ (socket မလာသေး)။ App ကိုဖွင့်ပြီး Live page refresh လုပ်ပါ။");

  try {
    if (isFinalTime("am")) {
      await postFinal("am", snap);
      return safeSendMessage(chatId, "✅ /forceam → Final posted + pinned");
    } else {
      await upsertLive("am", snap);
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

  const snap = getSnap();
  if (!snap) return safeSendMessage(chatId, "⚠️ VVVIP data မရသေးပါ (socket မလာသေး)။ App ကိုဖွင့်ပြီး Live page refresh လုပ်ပါ။");

  try {
    if (isFinalTime("pm")) {
      await postFinal("pm", snap);
      return safeSendMessage(chatId, "✅ /forcepm → Final posted + pinned");
    } else {
      await upsertLive("pm", snap);
      return safeSendMessage(chatId, "✅ /forcepm → Live updated (edit mode)");
    }
  } catch (e) {
    return safeSendMessage(chatId, `❌ /forcepm error: ${e.message}`);
  }
});

bot.onText(/\/forcemodam/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg)) return denyNotAdmin(chatId);

  const closed = await isMarketClosedToday().catch(() => ({ closed: false, reason: "" }));
  if (closed.closed) return denyClosedDay(chatId, closed.reason);

  const snap = getSnap();
  if (!snap) return safeSendMessage(chatId, "⚠️ VVVIP data မရသေးပါ (socket မလာသေး)။");

  try {
    modIntPostedAM = false;
    await postModInt("am930", snap);
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

  const snap = getSnap();
  if (!snap) return safeSendMessage(chatId, "⚠️ VVVIP data မရသေးပါ (socket မလာသေး)။");

  try {
    modIntPostedPM = false;
    await postModInt("pm200", snap);
    await safeSendMessage(chatId, "✅ /forcemodpm → Posted 2:00 PM Modern/Internet");
  } catch (e) {
    await safeSendMessage(chatId, `❌ /forcemodpm error: ${e.message}`);
  }
});

// Admin: force holiday notice (even if not 10:00)
bot.onText(/\/forceholiday/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg)) return denyNotAdmin(chatId);

  const closed = await isMarketClosedToday().catch(() => ({ closed: false, reason: "" }));
  if (!closed.closed) {
    return safeSendMessage(chatId, "✅ Today is NOT closed (Weekend/Holiday မဟုတ်ပါ)။");
  }

  try {
    await safeSendMessage(CHANNEL_ID, holidayNoticeTemplate(closed.reason), { parse_mode: "Markdown" });
    holidayNoticePosted = true;
    await safeSendMessage(chatId, "✅ /forceholiday → Holiday notice posted to channel");
  } catch (e) {
    await safeSendMessage(chatId, `❌ /forceholiday error: ${e.message}`);
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

    res.writeHead(200);
    res.end("Bot is running");
  })
  .listen(PORT, () => console.log("✅ Server running on port", PORT));
