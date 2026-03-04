/*
 * Myanmar 2D Live Bot — FINAL (No Error)
 * ✅ Socket.IO /live token join fixed
 * ✅ PM mapping fallback (use top-level digit/set/value when eveningRound is empty)
 * ✅ Modern/Internet post time: 9:31 AM and 2:01 PM (MMT)
 * ✅ /pingapi no longer fails due to freshness (shows last known if needed)
 */

"use strict";

const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const cheerio = require("cheerio");
const http = require("http");
const WebSocket = require("ws");

// ===================== ENV =====================
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID || "@Live2DSet";
const PUBLIC_URL = process.env.PUBLIC_URL;
const ADMIN_ID = process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : null;

const BOT_USERNAME = process.env.BOT_USERNAME || "@Thai2dLiveBot";

const PORT = process.env.PORT || 3000;
const WEBHOOK_PATH = "/webhook";
const WEBHOOK_URL = `${String(PUBLIC_URL || "").replace(/\/$/, "")}${WEBHOOK_PATH}`;

const EDIT_EVERY_MS = Number(process.env.EDIT_EVERY_MS || 5000);
const LIVE_ENABLE_AM = process.env.LIVE_ENABLE_AM !== "0";
const LIVE_ENABLE_PM = process.env.LIVE_ENABLE_PM !== "0";

// Live windows (MMT)
const AM_LIVE_START = process.env.AM_LIVE_START || "11:30";
const AM_LIVE_END = process.env.AM_LIVE_END || "12:02";
const PM_LIVE_START = process.env.PM_LIVE_START || "15:55";
const PM_LIVE_END = process.env.PM_LIVE_END || "16:31";

// Final times (MMT)
const AM_FINAL_TIME = process.env.AM_FINAL_TIME || "12:01";
const PM_FINAL_TIME = process.env.PM_FINAL_TIME || "16:30";

// Holiday notice time
const HOLIDAY_NOTICE_TIME = process.env.HOLIDAY_NOTICE_TIME || "10:00";

// ✅ Mod/Int windows (post at exactly 9:31 and 2:01)
const MODINT_AM_START = process.env.MODINT_AM_START || "09:31";
const MODINT_AM_END = process.env.MODINT_AM_END || "09:32";
const MODINT_PM_START = process.env.MODINT_PM_START || "14:01";
const MODINT_PM_END = process.env.MODINT_PM_END || "14:02";

if (!BOT_TOKEN || !CHANNEL_ID || !PUBLIC_URL) {
  console.error("❌ Missing ENV. Required: BOT_TOKEN, CHANNEL_ID, PUBLIC_URL");
  process.exit(1);
}

// ===================== BOT (WEBHOOK) =====================
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

bot
  .setWebHook(WEBHOOK_URL)
  .then(() => console.log("✅ Webhook set:", WEBHOOK_URL))
  .catch((e) => console.error("❌ setWebHook error:", e.message));

// ===================== SOURCES =====================
// Fallback mylucky2d3d
const API_LIVE = "https://mylucky2d3d.com/zusksbasqyfg/vodiicunchvb";
const HOME_URL = "https://mylucky2d3d.com/";
const HOLIDAY_URL = "https://mylucky2d3d.com/set-holiday";

// ===== LOTTO (Primary) socket.io raw ws =====
const LOTTO_WS_URL = "wss://app.predictlotto.org/socket.io/?EIO=4&transport=websocket";
const LOTTO_ORIGIN = "https://app.predictlotto.org";
const LOTTO_TOKEN = process.env.LOTTO_TOKEN || "mmvip2d";

// ===================== TIME (MMT) =====================
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

// ===================== UI ANIM =====================
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
    `⟪${n}⟫`,
    `⟨${n}⟩`,
    `(${n})`,
    `⟮${n}⟯`,
    `〔${n}〕`,
    `{${n}}`,
    `【${n}】`,
    `〖${n}〗`,
    `「${n}」`,
    `『${n}』`,
  ];
  return frames[animIdx % frames.length];
}
function tickerBar() {
  const bars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█", "▇", "▆", "▅", "▄", "▃", "▂"];
  return bars[animIdx % bars.length];
}
function fmtNum(x) {
  const s = String(x ?? "").trim();
  if (!s || s === "--") return "--";
  const n = Number(s.replace(/,/g, ""));
  if (Number.isNaN(n)) return s;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function isNumLike(v) {
  const s = String(v ?? "").trim();
  return /^\d+(\.\d+)?$/.test(s.replace(/,/g, ""));
}

// ===================== TELEGRAM SAFE HELPERS =====================
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

// ===================== FALLBACK MYLUCKY =====================
async function postForm(url, paramsObj) {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(paramsObj)) form.append(k, String(v));

  const res = await axios.post(url, form, {
    timeout: 20000,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json,text/plain,*/*",
      "Accept-Language": "en-US,en;q=0.9",
    },
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

// ===================== LOTTO PREDICT socket.io PRIMARY =====================
let lottoWs = null;
let lottoConnected = false;

// we may receive both data + data2
let lastLottoData = null;
let lastLottoDataAt = 0;

let lastLottoData2 = null;
let lastLottoData2At = 0;

function startLottoWs() {
  const connect = () => {
    try {
      const ws = new WebSocket(LOTTO_WS_URL, {
        headers: {
          "User-Agent": "Dart/3.9 (dart:io)",
          Origin: LOTTO_ORIGIN,
        },
      });

      lottoWs = ws;

      ws.on("open", () => {
        lottoConnected = true;
        console.log("✅ LOTTO WS connected");
      });

      ws.on("message", (buf) => {
        const raw = buf.toString("utf8");
        const packets = raw.split("\x1e").filter(Boolean);

        for (const msg of packets) {
          // ping -> pong
          if (msg === "2") {
            try {
              ws.send("3");
            } catch {}
            continue;
          }

          // handshake 0{...} => join namespace with token
          if (msg.startsWith("0")) {
            try {
              ws.send(`40/live,${JSON.stringify({ token: LOTTO_TOKEN })}`);
            } catch {}
            continue;
          }

          // joined namespace
          if (msg.startsWith("40/live")) {
            // optional: could be 40/live,{"sid":"..."} or 40/live
            continue;
          }

          // events
          if (msg.startsWith("42/live,")) {
            try {
              const payload = msg.slice("42/live,".length);
              const arr = JSON.parse(payload);
              const eventName = arr?.[0];
              const dataObj = arr?.[1];

              if (eventName === "data" && dataObj) {
                lastLottoData = dataObj;
                lastLottoDataAt = Date.now();
              }
              if (eventName === "data2" && dataObj) {
                lastLottoData2 = dataObj;
                lastLottoData2At = Date.now();
              }
            } catch {}
            continue;
          }
        }
      });

      ws.on("close", (code, reason) => {
        lottoConnected = false;
        lottoWs = null;
        console.log("⚠️ LOTTO WS closed:", code, reason?.toString?.() || "");
        setTimeout(connect, 1500);
      });

      ws.on("error", (e) => {
        lottoConnected = false;
        console.log("❌ LOTTO WS error:", e?.message || e);
        try {
          ws.close();
        } catch {}
      });
    } catch (e) {
      lottoConnected = false;
      console.log("❌ LOTTO WS init error:", e?.message || e);
      setTimeout(connect, 1500);
    }
  };

  connect();
}

// ✅ start at boot
startLottoWs();

// watchdog: if connected but no fresh data for long time, force reconnect
setInterval(() => {
  const now = Date.now();
  const newest = Math.max(lastLottoDataAt || 0, lastLottoData2At || 0);
  if (lottoConnected && newest && now - newest > 120000) {
    try {
      lottoWs?.close();
    } catch {}
  }
}, 30000);

async function getLottoPayloadFresh(maxAgeMs = 20000) {
  const now = Date.now();

  // prefer lastLottoData, fallback to data2
  const pickIfFresh = () => {
    if (lastLottoData && now - lastLottoDataAt <= maxAgeMs) return lastLottoData;
    if (lastLottoData2 && now - lastLottoData2At <= maxAgeMs) return lastLottoData2;
    return null;
  };

  const fresh = pickIfFresh();
  if (fresh) return fresh;

  // wait a bit for new frames
  const deadline = now + 6000;
  while (Date.now() < deadline) {
    const v = pickIfFresh();
    if (v) return v;
    await sleep(250);
  }
  throw new Error("LOTTO_NO_DATA");
}

function extractRoundForPeriod(period, v) {
  const isAM = period === "am";
  const roundObj = isAM ? v?.morningRound : v?.eveningRound;

  // If roundObj is missing OR has "--" but top-level has numbers => fallback to top-level
  const rd = roundObj && typeof roundObj === "object" ? roundObj : {};

  const digit = isNumLike(rd?.digit) ? rd.digit : isNumLike(v?.digit) ? v.digit : "--";
  const set = isNumLike(rd?.set) ? rd.set : isNumLike(v?.set) ? v.set : "--";
  const value = isNumLike(rd?.value) ? rd.value : isNumLike(v?.value) ? v.value : "--";

  return { digit, set, value };
}

function lottoToStandard(period, v) {
  const r = extractRoundForPeriod(period, v);

  return {
    status: "success",
    playLucky: r.digit ?? "--",
    playSet: r.set ?? "--",
    playValue: r.value ?? "--",
    playDtm: v?.serverTime ?? "--",

    // when isRunning === false => final may be ready depending on time
    fiStatus: v?.isRunning === false ? "yes" : "no",

    modern: period === "am" ? v?.mornet?.modernMorning ?? "--" : v?.mornet?.modernEvening ?? "--",
    internet: period === "am" ? v?.mornet?.internetMorning ?? "--" : v?.mornet?.internetEvening ?? "--",
    tw: v?.tw ?? "--",
  };
}

function getModIntFromLotto(v) {
  return {
    am930: {
      modern: v?.mornet?.modernMorning ?? "--",
      internet: v?.mornet?.internetMorning ?? "--",
      tw: v?.tw ?? "--",
    },
    pm200: {
      modern: v?.mornet?.modernEvening ?? "--",
      internet: v?.mornet?.internetEvening ?? "--",
      tw: v?.tw ?? "--",
    },
  };
}

// fallback scrape for mod/int if Lotto unavailable
async function fetchModernInternetBlocksFallback() {
  const res = await axios.get(HOME_URL, {
    timeout: 20000,
    headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html,*/*" },
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
    if (!block) return { modern: "--", internet: "--" };

    const nums = [];
    block.find(".modIntV").each((_, el) => {
      const v = $(el).text().trim();
      if (/^\d{1,4}$/.test(v) || v === "--") nums.push(v);
    });

    return { modern: nums[0] ?? "--", internet: nums[1] ?? "--" };
  }

  return {
    am930: pickBlock("9:30 AM"),
    pm200: pickBlock("2:00 PM"),
  };
}

// ===================== HOLIDAY / WEEKEND =====================
function weekdayNameFromIndex(i) {
  return ["တနင်္ဂနွေနေ့", "တနင်္လာနေ့", "အင်္ဂါနေ့", "ဗုဒ္ဓဟူးနေ့", "ကြာသပတေးနေ့", "သောကြနေ့", "စနေနေ့"][i] || "Unknown";
}
function parseDateToYMD(text) {
  const s = String(text || "").trim();

  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (dmy) return `${dmy[3]}-${String(dmy[2]).padStart(2, "0")}-${String(dmy[1]).padStart(2, "0")}`;

  const mon = s.match(/\b(\d{1,2})\s*[-/ ]\s*([A-Za-z]{3,9})\s*[-/ ]\s*(\d{4})\b/);
  if (mon) {
    const map = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
    const mm = map[mon[2].toLowerCase().slice(0, 3)];
    if (mm) return `${mon[3]}-${mm}-${String(mon[1]).padStart(2, "0")}`;
  }
  return null;
}

let holidayCache = { fetchedAt: 0, mapByYMD: new Map() };

async function fetchHolidayMap() {
  const now = Date.now();
  if (holidayCache.fetchedAt && now - holidayCache.fetchedAt < 6 * 60 * 60 * 1000) return holidayCache.mapByYMD;

  const res = await axios.get(HOLIDAY_URL, {
    timeout: 20000,
    headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html,*/*" },
    responseType: "text",
    validateStatus: (s) => s >= 200 && s < 600,
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

  const dayIdx = nowMMTDateObj().getDay();
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
  return `╭──────────────╮
│ 🛑 Market 2D Closed │
╰──────────────╯
📅 ${prettyMMT()}

ဒီနေ့ 2D မထွက်ပါဘူး။

🤖 *${BOT_USERNAME} ဖြင့်ဖန်တီးထားသည်*

အကြောင်းရင်း 👇

*${reason}*

နောက်နေ့ 2D market ပြန်ဖွင့်တာနဲ့ Live ပြန်တင်ပေးပါမယ် ✅`;
}

// ===================== MESSAGE TEMPLATES =====================
function liveMessageTemplate(label, liveNum, set, value, upd) {
  tickAnim();
  const n = bracketBounce(liveNum || "--");
  const dot = livePulseDot();
  const heart = heartPulse();

  return `╭─────────────╮
│ ${heart} ${label}│တိုက်ရိုက်Live
╰─────────────╯
📅 ${upd || "--"}

🎯 *Now 2D* : ${dot} *${n}*

🟢 *SET*   ${tickerBar()}  *${fmtNum(set)}*
🔵 *VALUE* ${tickerBar()}  *${fmtNum(value)}*

🤖 *${BOT_USERNAME} ဖြင့်ဖန်တီးထားသည်*

🕒 Updated: *${upd || "--"}*`;
}

function finalMessageTemplate(label, finalNum, set, value, upd) {
  return `╭───────────╮
│ ${label}│ထွက်ဂဏန်း
╰───────────╯
📅 ${upd || "--"}

🎯 *Now 2D* : *${finalNum || "--"}* ✅

🟢 *SET*   *${fmtNum(set)}*
🔵 *VALUE* *${fmtNum(value)}*

🤖 *${BOT_USERNAME} ဖြင့်ဖန်တီးထားသည်*

🕒 Updated: *${upd || "--"}*`;
}

function modIntTemplate(timeTitle, modern, internet, tw) {
  return `╭──────────────╮
│ 🧠 MODERN / INTERNET │
╰──────────────╯
📅 ${prettyMMT()}

${timeTitle}

🟢 *Modern* : *${modern || "--"}*
🔵 *Internet* : *${internet || "--"}*
🟣 *TW* : *${tw || "--"}*

🤖 *${BOT_USERNAME} ဖြင့်ဖန်တီးထားသည်*`;
}

// ===================== STATE =====================
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

function looksLikeFinalTime(period, playDtm) {
  const dtm = String(playDtm || "");
  if (period === "am") return dtm.includes("12:01") || afterHM(AM_FINAL_TIME);
  if (period === "pm") return dtm.includes("16:30") || afterHM(PM_FINAL_TIME);
  return false;
}

// ===================== LIVE FLOW =====================
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

  if (isAM) {
    pinnedFinalIdAM = sent.message_id;
    finalDoneAM = true;
  } else {
    pinnedFinalIdPM = sent.message_id;
    finalDonePM = true;
  }
}

// ===================== MOD/INT POST =====================
async function postModInt(which) {
  let blocks = null;

  try {
    const v = await getLottoPayloadFresh(120000); // allow 2 mins for mod/int
    blocks = getModIntFromLotto(v);
  } catch {}

  if (!blocks) {
    try {
      const fb = await fetchModernInternetBlocksFallback();
      blocks = { am930: { ...fb.am930, tw: "--" }, pm200: { ...fb.pm200, tw: "--" } };
    } catch {
      blocks = { am930: { modern: "--", internet: "--", tw: "--" }, pm200: { modern: "--", internet: "--", tw: "--" } };
    }
  }

  if (which === "am930") {
    if (modIntPostedAM) return;
    const b = blocks.am930;
    await safeSendMessage(CHANNEL_ID, modIntTemplate("🕤 *9:31 AM*", b.modern, b.internet, b.tw), { parse_mode: "Markdown" });
    modIntPostedAM = true;
  }

  if (which === "pm200") {
    if (modIntPostedPM) return;
    const b = blocks.pm200;
    await safeSendMessage(CHANNEL_ID, modIntTemplate("🕑 *2:01 PM*", b.modern, b.internet, b.tw), { parse_mode: "Markdown" });
    modIntPostedPM = true;
  }
}

// ===================== LIVE FETCH SMART =====================
async function fetchLiveSmart(period) {
  // 1) Lotto Predict primary
  try {
    const v = await getLottoPayloadFresh(20000);
    return lottoToStandard(period, v);
  } catch {}

  // 2) mylucky fallback (may not be same schema)
  const fb = await fetchMyluckyLive(period).catch(() => null);
  if (fb && typeof fb === "object") {
    // try to map common keys if present, else fail gracefully
    const digit = fb?.digit ?? fb?.live ?? fb?.result ?? "--";
    const set = fb?.set ?? "--";
    const value = fb?.value ?? "--";
    const time = fb?.dt ?? fb?.time ?? prettyMMT();
    return {
      status: "success",
      playLucky: digit,
      playSet: set,
      playValue: value,
      playDtm: time,
      fiStatus: "no",
      modern: "--",
      internet: "--",
      tw: "--",
    };
  }

  throw new Error("NO_SOURCE");
}

// ===================== TICKS =====================
async function tickLive() {
  resetDailyStateIfNeeded();
  const closed = await isMarketClosedToday();
  if (closed?.closed) return;

  if (LIVE_ENABLE_AM && inRangeMinutes(AM_LIVE_START, AM_LIVE_END) && !finalDoneAM) {
    const data = await fetchLiveSmart("am").catch(() => null);
    if (data && data.status === "success") {
      if (data.fiStatus === "yes" && looksLikeFinalTime("am", data.playDtm)) await postFinal("am", data);
      else await upsertLive("am", data);
    }
  }

  if (LIVE_ENABLE_PM && inRangeMinutes(PM_LIVE_START, PM_LIVE_END) && !finalDonePM) {
    const data = await fetchLiveSmart("pm").catch(() => null);
    if (data && data.status === "success") {
      if (data.fiStatus === "yes" && looksLikeFinalTime("pm", data.playDtm)) await postFinal("pm", data);
      else await upsertLive("pm", data);
    }
  }
}

async function tickModIntAndHolidayNotice() {
  resetDailyStateIfNeeded();
  const closed = await isMarketClosedToday();

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

setInterval(() => tickLive().catch((e) => console.log("Live tick error:", e.message)), EDIT_EVERY_MS);
setInterval(() => tickModIntAndHolidayNotice().catch((e) => console.log("ModInt tick error:", e.message)), 20 * 1000);

// ===================== ADMIN HELPERS =====================
function isAdmin(msg) {
  return ADMIN_ID && msg?.from?.id === ADMIN_ID;
}
async function denyNotAdmin(chatId) {
  return safeSendMessage(chatId, "⛔ ဒီ command ကို Admin ပဲသုံးလို့ရပါတယ်။");
}
async function denyClosedDay(chatId, reason) {
  return safeSendMessage(chatId, `🛑 ဒီနေ့ 2D Market ပိတ်ပါတယ်။\nအကြောင်းရင်းက: ${reason}`);
}

// ===================== COMMANDS =====================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const text = `🎯 Myanmar 2D Live Bot

⏰ Market Time (Myanmar)
🌅 မနက် Live : ${AM_LIVE_START} – ${AM_LIVE_END}
🌆 ညနေ Live : ${PM_LIVE_START} – ${PM_LIVE_END}

✅ Final = Pin (Only after ${AM_FINAL_TIME} / ${PM_FINAL_TIME})

🧠 Modern/Internet
🕤 9:31 AM  •  🕑 2:01 PM

🛑 Weekend + Holiday = NO posts
📣 Holiday Notice = ${HOLIDAY_NOTICE_TIME} AM (MMT)

Channel ကို join ပါ 👇`;

  await safeSendMessage(chatId, text, {
    reply_markup: { inline_keyboard: [[{ text: "🔔 Join 2D Live Channel", url: "https://t.me/Live2DSet" }]] },
  });
});

bot.onText(/\/myid/, async (msg) => safeSendMessage(msg.chat.id, `🆔 Your Telegram ID: ${msg.from.id}`));

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg)) return denyNotAdmin(chatId);

  const closed = await isMarketClosedToday().catch(() => ({ closed: false, reason: "" }));
  const newest = Math.max(lastLottoDataAt || 0, lastLottoData2At || 0);
  const age = newest ? Math.floor((Date.now() - newest) / 1000) : null;

  const s = `📌 Bot Status
📅 Date (MMT): ${ymdMMT()}
⏱ Edit interval: ${EDIT_EVERY_MS}ms

🛑 Closed today: ${closed.closed ? "YES" : "NO"}
📣 Close reason: ${closed.closed ? closed.reason : "-"}

✅ Final AM done: ${finalDoneAM ? "YES" : "NO"}
✅ Final PM done: ${finalDonePM ? "YES" : "NO"}

🧠 Mod/Int AM posted: ${modIntPostedAM ? "YES" : "NO"}
🧠 Mod/Int PM posted: ${modIntPostedPM ? "YES" : "NO"}

🔐 Admin ID set: ${ADMIN_ID ? "YES" : "NO"}
📢 Channel: ${CHANNEL_ID}

🛰 WS Joined /live: ${lottoConnected ? "YES" : "NO"}
🛰 data age: ${age === null ? "none" : `${age}s`}
🛰 token: ${LOTTO_TOKEN}
🛰 host: ${LOTTO_WS_URL}`;

  await safeSendMessage(chatId, s);
});

bot.onText(/\/pingapi/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg)) return denyNotAdmin(chatId);

  try {
    // allow last-known up to 6 hours for debugging
    const v = await getLottoPayloadFresh(6 * 60 * 60 * 1000);
    const am = lottoToStandard("am", v);
    const pm = lottoToStandard("pm", v);

    await safeSendMessage(
      chatId,
      `✅ LOTTO OK (/live)\nAM: ${am.playLucky} | SET ${am.playSet} | VALUE ${am.playValue}\nPM: ${pm.playLucky} | SET ${pm.playSet} | VALUE ${pm.playValue}\nTime: ${am.playDtm}\nModern(AM): ${am.modern} | Internet(AM): ${am.internet} | TW: ${am.tw}\nModern(PM): ${pm.modern} | Internet(PM): ${pm.internet}`
    );
  } catch (e) {
    await safeSendMessage(chatId, `❌ LOTTO FAIL: ${e.message}`);
  }

  try {
    const m = await fetchMyluckyLive("am");
    await safeSendMessage(chatId, `✅ mylucky OK (am)\nstatus=${m.status ?? "unknown"}`);
  } catch (e) {
    await safeSendMessage(chatId, `⚠️ mylucky FAIL: ${e.message}`);
  }
});

bot.onText(/\/forceam/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg)) return denyNotAdmin(chatId);

  const closed = await isMarketClosedToday().catch(() => ({ closed: false, reason: "" }));
  if (closed.closed) return denyClosedDay(chatId, closed.reason);

  try {
    const data = await fetchLiveSmart("am");
    if (data && data.status === "success") {
      if (data.fiStatus === "yes" && looksLikeFinalTime("am", data.playDtm)) {
        await postFinal("am", data);
        return safeSendMessage(chatId, "✅ /forceam → Final posted + pinned");
      }
      await upsertLive("am", data);
      return safeSendMessage(chatId, "✅ /forceam → Live updated (edit mode)");
    }
    return safeSendMessage(chatId, "⚠️ /forceam → data not success");
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
    if (data && data.status === "success") {
      if (data.fiStatus === "yes" && looksLikeFinalTime("pm", data.playDtm)) {
        await postFinal("pm", data);
        return safeSendMessage(chatId, "✅ /forcepm → Final posted + pinned");
      }
      await upsertLive("pm", data);
      return safeSendMessage(chatId, "✅ /forcepm → Live updated (edit mode)");
    }
    return safeSendMessage(chatId, "⚠️ /forcepm → data not success");
  } catch (e) {
    return safeSendMessage(chatId, `❌ /forcepm error: ${e.message}`);
  }
});

bot.onText(/\/forcemodam/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg)) return denyNotAdmin(chatId);

  const closed = await isMarketClosedToday().catch(() => ({ closed: false, reason: "" }));
  if (closed.closed) return denyClosedDay(chatId, closed.reason);

  try {
    modIntPostedAM = false;
    await postModInt("am930");
    await safeSendMessage(chatId, "✅ /forcemodam → Posted 9:31 AM Modern/Internet");
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
    await safeSendMessage(chatId, "✅ /forcemodpm → Posted 2:01 PM Modern/Internet");
  } catch (e) {
    await safeSendMessage(chatId, `❌ /forcemodpm error: ${e.message}`);
  }
});

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

// ===================== HTTP SERVER (WEBHOOK RECEIVER) =====================
http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url === WEBHOOK_PATH) {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          bot.processUpdate(JSON.parse(body));
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
