/**
 * Myanmar 2D Live Bot — FINAL (WEBHOOK / Render)
 * ===================================================
 * ✅ Primary Source: VVIP 2D WebSocket (socket.io)  (works even when mylucky2d3d is 500)
 * ✅ Fallback Source: mylucky2d3d.com POST API
 * ✅ Live updates via EDIT mode every 5s (no spam)
 * ✅ Final ✅ + Pin (when isRunning=false and serverTime hits 12:01 / 4:30)
 * ✅ Modern/Internet separate posts (9:30 AM & 2:00 PM MMT) — NO PIN
 * ✅ Weekend + Holiday (SET Holiday) -> NO live/final/modint posts
 * ✅ Holiday/Weekend reason auto post at 10:00 AM MMT (once/day)
 * ✅ Admin-only: /forceam /forcepm /forcemodam /forcemodpm /forceholiday /pingapi
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
const WebSocket = require("ws");

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

// ===== SOURCES =====
// Fallback mylucky2d3d
const API_LIVE = "https://mylucky2d3d.com/zusksbasqyfg/vodiicunchvb"; // POST dateVal, periodVal(am/pm)
const HOME_URL = "https://mylucky2d3d.com/";
const HOLIDAY_URL = "https://mylucky2d3d.com/set-holiday";

// Primary VVIP WebSocket (from PCAPdroid)
const VVIP_WS_URL = "wss://live.higginkk.org:4002/socket.io/?EIO=4&transport=websocket";
const VVIP_ORIGIN = "https://live.higginkk.org";

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
function tickAnim() { animIdx = (animIdx + 1) % 60; }
function livePulseDot() {
  const dots = ["🔴", "🟩", "🟡", "🟪"];
  return dots[animIdx % dots.length];
}
function heartPulse() {
  const hearts = ["💛", "❤️", "💚", "💖"];
  return hearts[animIdx % hearts.length];
}
function bracketBounce(n) {
  const frames = [`⟪${n}⟫`,`⟨${n}⟩`,`(${n})`,`⟮${n}⟯`,`〔${n}〕`,`{${n}}`,`【${n}】`,`〖${n}〗`,`「${n}」`,`『${n}』`];
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
async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function tgRetryAfterSeconds(err) {
  const ra = err?.response?.body?.parameters?.retry_after;
  return typeof ra === "number" ? ra : null;
}
async function safeSendMessage(chatId, text, opts = {}) {
  try { return await bot.sendMessage(chatId, text, opts); }
  catch (e) {
    const ra = tgRetryAfterSeconds(e);
    if (ra) { await sleep((ra + 1) * 1000); return bot.sendMessage(chatId, text, opts); }
    throw e;
  }
}
async function safeEditMessage(chatId, messageId, text, opts = {}) {
  try { return await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts }); }
  catch (e) {
    const ra = tgRetryAfterSeconds(e);
    if (ra) { await sleep((ra + 1) * 1000); return bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts }); }
    const desc = e?.response?.body?.description || "";
    if (desc.includes("message is not modified")) return null;
    throw e;
  }
}
async function safePin(chatId, messageId) {
  try { return await bot.pinChatMessage(chatId, messageId, { disable_notification: true }); }
  catch (e) {
    const ra = tgRetryAfterSeconds(e);
    if (ra) { await sleep((ra + 1) * 1000); return bot.pinChatMessage(chatId, messageId, { disable_notification: true }); }
    throw e;
  }
}
async function safeUnpin(chatId, messageId) {
  try { return await bot.unpinChatMessage(chatId, messageId); }
  catch { return null; }
}

// ===== Fallback: mylucky2d3d POST =====
async function postForm(url, paramsObj) {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(paramsObj)) form.append(k, String(v));

  const res = await axios.post(url, form, {
    timeout: 20000,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
      "Accept": "application/json,text/plain,*/*",
      "Accept-Language": "en-US,en;q=0.9",
    },
    // IMPORTANT: allow 500 so we can handle ourselves
    validateStatus: (s) => s >= 200 && s < 600,
  });

  if (res.status >= 500) throw new Error(`UPSTREAM_${res.status}`);
  const data = res.data;
  if (typeof data !== "object" || data === null) throw new Error("API_NON_JSON");
  return data;
}
async function fetchMyluckyLive(periodVal) {
  const dateVal = ymdMMT();
  return postForm(API_LIVE, { dateVal, periodVal });
}

// ===== Primary: VVIP WebSocket (socket.io) =====
async function fetchVvipLiveOnce() {
  const ws = new WebSocket(VVIP_WS_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Origin": VVIP_ORIGIN,
    },
  });

  return await new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error("VVIP_TIMEOUT"));
    }, 9000);

    ws.on("open", () => { /* wait handshake */ });

    ws.on("message", (buf) => {
      const msg = buf.toString();

      // handshake: "0{...}"
      if (msg.startsWith("0")) {
        // connect namespace "/live"
        ws.send("40/live,");
        return;
      }

      // data event: "42/live,[ ... ]"
      if (msg.startsWith("42/live,")) {
        clearTimeout(t);
        try { ws.close(); } catch {}

        try {
          const payload = msg.replace("42/live,", "");
          const arr = JSON.parse(payload); // [eventName, dataObj]
          const dataObj = arr?.[1];

          // sometimes it can be wrapped: {event:"data", data:{...}}
          if (dataObj?.event === "data" && dataObj?.data) return resolve(dataObj.data);

          if (!dataObj) return reject(new Error("VVIP_BAD_PAYLOAD"));
          resolve(dataObj);
        } catch (e) {
          reject(new Error("VVIP_PARSE_FAIL"));
        }
      }
    });

    ws.on("error", (e) => {
      clearTimeout(t);
      try { ws.close(); } catch {}
      reject(e);
    });
  });
}

// convert VVIP payload -> bot standard format
function vvipToStandard(period /* am|pm */, v) {
  const isAM = period === "am";
  const r = isAM ? (v.morningRound || {}) : (v.eveningRound || {});
  const playLucky = r.digit ?? "--";
  const playSet = r.set ?? "--";
  const playValue = r.value ?? "--";
  const playDtm = v.serverTime ?? "--";

  // final detection from VVIP
  const fiStatus = v.isRunning === false ? "yes" : "no";

  return {
    status: "success",
    playLucky,
    playSet,
    playValue,
    playDtm,
    fiStatus,
    // extra for mod/int
    modern: isAM ? (v?.mornet?.modernMorning ?? "--") : (v?.mornet?.modernEvening ?? "--"),
    internet: isAM ? (v?.mornet?.internetMorning ?? "--") : (v?.mornet?.internetEvening ?? "--"),
  };
}

// ===== Modern/Internet (Preferred: VVIP payload) =====
function getModIntFromVvip(v) {
  return {
    am930: { modern: v?.mornet?.modernMorning ?? "--", internet: v?.mornet?.internetMorning ?? "--" },
    pm200: { modern: v?.mornet?.modernEvening ?? "--", internet: v?.mornet?.internetEvening ?? "--" },
  };
}

// Fallback Modern/Internet: scrape mylucky2d3d HOME
async function fetchModernInternetBlocksFallback() {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,my;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": HOME_URL,
    "Upgrade-Insecure-Requests": "1",
  };

  const res = await axios.get(HOME_URL, {
    timeout: 20000,
    headers,
    responseType: "text",
    validateStatus: (s) => s >= 200 && s < 600,
  });

  if (res.status >= 500) throw new Error(`HOME_UPSTREAM_${res.status}`);
  if (res.status !== 200 || typeof res.data !== "string") throw new Error("HOME_HTML_EMPTY");

  const $ = cheerio.load(res.data);

  function pickBlock(timeLabel) {
    let block = null;
    $(".feature-card").each((_, el) => {
      const t = $(el).text().replace(/\s+/g, " ").trim();
      if (t.includes(timeLabel) && t.includes("Modern") && t.includes("Internet")) block = $(el);
    });
    if (!block) return null;

    const nums = [];
    block.find(".modIntV").each((_, el) => {
      const v = $(el).text().trim();
      if (/^\d{1,4}$/.test(v) || v === "--") nums.push(v);
    });

    return { modern: nums[0] ?? "--", internet: nums[1] ?? "--" };
  }

  return {
    am930: pickBlock("9:30 AM") || { modern: "--", internet: "--" },
    pm200: pickBlock("2:00 PM") || { modern: "--", internet: "--" },
  };
}

// ===== Holiday / Weekend =====
function weekdayNameFromIndex(i) {
  return ["တနင်္ဂနွေနေ့","တနင်္လာနေ့","အင်္ဂါနေ့","ဗုဒ္ဓဟူးနေ့","ကြာသပတေးနေ့","သောကြနေ့","စနေနေ့"][i] || "Unknown";
}
function parseDateToYMD(text) {
  const s = String(text || "").trim();
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (dmy) return `${dmy[3]}-${String(dmy[2]).padStart(2,"0")}-${String(dmy[1]).padStart(2,"0")}`;

  const mon = s.match(/\b(\d{1,2})\s*[-/ ]\s*([A-Za-z]{3,9})\s*[-/ ]\s*(\d{4})\b/);
  if (mon) {
    const map = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
    const mm = map[mon[2].toLowerCase().slice(0,3)];
    if (mm) return `${mon[3]}-${mm}-${String(mon[1]).padStart(2,"0")}`;
  }
  return null;
}

let holidayCache = { fetchedAt: 0, mapByYMD: new Map() };

async function fetchHolidayMap() {
  const now = Date.now();
  if (holidayCache.fetchedAt && now - holidayCache.fetchedAt < 6 * 60 * 60 * 1000) return holidayCache.mapByYMD;

  const res = await axios.get(HOLIDAY_URL, {
    timeout: 20000,
    headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html,*/*" },
    responseType: "text",
    validateStatus: (s) => s >= 200 && s < 600,
  });

  if (res.status >= 500) {
    holidayCache.fetchedAt = now;
    return holidayCache.mapByYMD;
  }
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
    if (tds && tds.length >= 2) name = $(tds[tds.length - 1]).text().replace(/\s+/g, " ").trim();
    else name = rowText;

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

// ===== MESSAGE TEMPLATES =====
function liveMessageTemplate(label, liveNum, set, value, upd) {
  tickAnim();
  const n = bracketBounce(liveNum || "--");
  const dot = livePulseDot();
  const heart = heartPulse();

  return (
`╭─────────────╮
│ ${heart} ${label}│တိုက်ရိုက်Live
╰─────────────╯
📅 ${upd || "--"}

🎯 *Now 2D* : ${dot} *${n}*

🟢 *SET*   ${tickerBar()}  *${fmtNum(set)}*
🔵 *VALUE* ${tickerBar()}  *${fmtNum(value)}*

🤖 *@Myanmar2dLiveBot*

🕒 Updated: *${upd || "--"}*`
  );
}

// Final stays NORMAL (no animation)
function finalMessageTemplate(label, finalNum, set, value, upd) {
  return (
`╭───────────╮
│ ${label}│ထွက်ဂဏန်း
╰───────────╯
📅 ${upd || "--"}

🎯 *Now 2D* : *${finalNum || "--"}* ✅

🟢 *SET*   *${fmtNum(set)}*
🔵 *VALUE* *${fmtNum(value)}*

🤖 *@Myanmar2dLiveBot*

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
let liveMsgIdAM = null;
let liveMsgIdPM = null;
let pinnedFinalIdAM = null;
let pinnedFinalIdPM = null;
let finalDoneAM = false;
let finalDonePM = false;
let modIntPostedAM = false;
let modIntPostedPM = false;
let holidayNoticePosted = false;

// store last VVIP payload for mod/int posting
let lastVvipPayload = null;

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

// final guard using time + fiStatus
function looksLikeFinalTime(period, playDtm) {
  const dtm = String(playDtm || "");
  if (period === "am") return dtm.includes("12:01") || afterHM(AM_FINAL_TIME);
  if (period === "pm") return dtm.includes("16:30") || afterHM(PM_FINAL_TIME);
  return false;
}

async function upsertLive(period, data) {
  const isAM = period === "am";
  const label = isAM ? "🌅 မနက်" : "🌆 ညနေ";
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
  const label = isAM ? "🌅 မနက်" : "🌆 ညနေ";
  const opts = { parse_mode: "Markdown" };

  const text = finalMessageTemplate(label, data.playLucky, data.playSet, data.playValue, data.playDtm);
  const sent = await safeSendMessage(CHANNEL_ID, text, opts);

  if (isAM && pinnedFinalIdAM) await safeUnpin(CHANNEL_ID, pinnedFinalIdAM);
  if (!isAM && pinnedFinalIdPM) await safeUnpin(CHANNEL_ID, pinnedFinalIdPM);

  await safePin(CHANNEL_ID, sent.message_id);

  if (isAM) pinnedFinalIdAM = sent.message_id;
  else pinnedFinalIdPM = sent.message_id;

  if (isAM) finalDoneAM = true;
  else finalDonePM = true;
}

async function postModInt(which) {
  // prefer VVIP values
  let blocks = null;

  try {
    if (!lastVvipPayload) lastVvipPayload = await fetchVvipLiveOnce();
    blocks = getModIntFromVvip(lastVvipPayload);
  } catch {}

  // fallback scrape
  if (!blocks) {
    try { blocks = await fetchModernInternetBlocksFallback(); }
    catch { blocks = { am930: { modern: "--", internet: "--" }, pm200: { modern: "--", internet: "--" } }; }
  }

  if (which === "am930") {
    if (modIntPostedAM) return;
    const b = blocks.am930;
    const msg = modIntTemplate("🕤 *9:30 AM*", b.modern, b.internet);
    await safeSendMessage(CHANNEL_ID, msg, { parse_mode: "Markdown" });
    modIntPostedAM = true;
  }

  if (which === "pm200") {
    if (modIntPostedPM) return;
    const b = blocks.pm200;
    const msg = modIntTemplate("🕑 *2:00 PM*", b.modern, b.internet);
    await safeSendMessage(CHANNEL_ID, msg, { parse_mode: "Markdown" });
    modIntPostedPM = true;
  }
}

// fetch live (prefer VVIP, fallback mylucky)
async function fetchLiveSmart(period) {
  // 1) VVIP primary
  try {
    const v = await fetchVvipLiveOnce();
    lastVvipPayload = v;
    return vvipToStandard(period, v);
  } catch {}

  // 2) fallback mylucky
  try {
    const raw = await fetchMyluckyLive(period);
    return raw;
  } catch (e) {
    throw e;
  }
}

// ===== TICKS =====
async function tickLive() {
  resetDailyStateIfNeeded();

  const closed = await isMarketClosedToday();
  if (closed?.closed) return;

  if (LIVE_ENABLE_AM && inRangeMinutes(AM_LIVE_START, AM_LIVE_END) && !finalDoneAM) {
    const data = await fetchLiveSmart("am").catch(() => null);
    if (data && data.status === "success") {
      if (data.fiStatus === "yes" && looksLikeFinalTime("am", data.playDtm)) {
        await postFinal("am", data);
      } else {
        await upsertLive("am", data);
      }
    }
  }

  if (LIVE_ENABLE_PM && inRangeMinutes(PM_LIVE_START, PM_LIVE_END) && !finalDonePM) {
    const data = await fetchLiveSmart("pm").catch(() => null);
    if (data && data.status === "success") {
      if (data.fiStatus === "yes" && looksLikeFinalTime("pm", data.playDtm)) {
        await postFinal("pm", data);
      } else {
        await upsertLive("pm", data);
      }
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

  if (inRangeMinutes(MODINT_AM_START, MODINT_AM_END)) await postModInt("am930").catch(() => null);
  if (inRangeMinutes(MODINT_PM_START, MODINT_PM_END)) await postModInt("pm200").catch(() => null);
}

// loops
setInterval(() => { tickLive().catch((e) => console.log("Live tick error:", e.message)); }, EDIT_EVERY_MS);
setInterval(() => { tickModIntAndHolidayNotice().catch((e) => console.log("ModInt tick error:", e.message)); }, 20 * 1000);

// ===== ADMIN HELPERS =====
function isAdmin(msg) { return ADMIN_ID && msg?.from?.id === ADMIN_ID; }
async function denyNotAdmin(chatId) { return safeSendMessage(chatId, "⛔ ဒီ command ကို Admin ပဲသုံးလို့ရပါတယ်။"); }
async function denyClosedDay(chatId, reason) { return safeSendMessage(chatId, `🛑 ဒီနေ့ 2D Market ပိတ်ပါတယ်။\nအကြောင်းရင်းက: ${reason}`); }

// ===== COMMANDS =====
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const text =
`🎯 Myanmar 2D Live Bot

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
    reply_markup: { inline_keyboard: [[{ text: "🔔 Join 2D Live Channel", url: "https://t.me/Live2DSet" }]] },
  });
});

bot.onText(/\/myid/, async (msg) => safeSendMessage(msg.chat.id, `🆔 Your Telegram ID: ${msg.from.id}`));

bot.onText(/\/test(?:\s+(.+))?/, async (msg, match) => {
  try {
    await safeSendMessage(CHANNEL_ID, `✅ Test post OK (channel)\n${match?.[1] ? `Message: ${match[1]}` : ""}`.trim());
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

// Admin: quick API health check
bot.onText(/\/pingapi/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg)) return denyNotAdmin(chatId);

  try {
    const v = await fetchVvipLiveOnce();
    const am = vvipToStandard("am", v);
    await safeSendMessage(chatId, `✅ VVIP WS OK\nAM: ${am.playLucky} | SET ${am.playSet} | VALUE ${am.playValue}\nTime: ${am.playDtm}`);
  } catch (e) {
    await safeSendMessage(chatId, `❌ VVIP WS FAIL: ${e.message}`);
  }

  try {
    const m = await fetchMyluckyLive("am");
    await safeSendMessage(chatId, `✅ mylucky API OK (am)\nstatus=${m.status}`);
  } catch (e) {
    await safeSendMessage(chatId, `⚠️ mylucky API FAIL: ${e.message}`);
  }
});

// Admin: force AM/PM live/final
bot.onText(/\/forceam/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg)) return denyNotAdmin(chatId);

  const closed = await isMarketClosedToday().catch(() => ({ closed: false, reason: "" }));
  if (closed.closed) return denyClosedDay(chatId, closed.reason);

  try {
    const data = await fetchLiveSmart("am");
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
    const data = await fetchLiveSmart("pm");
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

// Admin: force modern/internet
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

// Admin: force holiday notice (even if not 10:00)
bot.onText(/\/forceholiday/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg)) return denyNotAdmin(chatId);

  const closed = await isMarketClosedToday().catch(() => ({ closed: false, reason: "" }));
  if (!closed.closed) return safeSendMessage(chatId, "✅ Today is NOT closed (Weekend/Holiday မဟုတ်ပါ)။");

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
        try { bot.processUpdate(JSON.parse(body)); } catch {}
        res.writeHead(200);
        res.end("OK");
      });
      return;
    }
    res.writeHead(200);
    res.end("Bot is running");
  })
  .listen(PORT, () => console.log("✅ Server running on port", PORT));
