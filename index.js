/*
 * Myanmar 2D Live Bot — FINAL FIXED
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

// intervals
const EDIT_EVERY_MS = Number(process.env.EDIT_EVERY_MS || 5000);
const LIVE_ENABLE_AM = process.env.LIVE_ENABLE_AM !== "0";
const LIVE_ENABLE_PM = process.env.LIVE_ENABLE_PM !== "0";

// Live windows (MMT)
const AM_LIVE_START = process.env.AM_LIVE_START || "11:30";
const AM_LIVE_END = process.env.AM_LIVE_END || "12:10";
const PM_LIVE_START = process.env.PM_LIVE_START || "15:55";
const PM_LIVE_END = process.env.PM_LIVE_END || "16:45";

// Final times (MMT)
const AM_FINAL_TIME = process.env.AM_FINAL_TIME || "12:01";
const PM_FINAL_TIME = process.env.PM_FINAL_TIME || "16:30";

// Holiday notice time (MMT)
const HOLIDAY_NOTICE_TIME = process.env.HOLIDAY_NOTICE_TIME || "10:00";

// Modern/Internet requested times (MMT)
const MODINT_AM_POST_AT = process.env.MODINT_AM_POST_AT || "09:30";
const MODINT_PM_POST_AT = process.env.MODINT_PM_POST_AT || "14:00";
const MODINT_WINDOW_MINUTES = Number(process.env.MODINT_WINDOW_MINUTES || 2);

// LOTTO freshness
const LOTTO_PACKET_MAX_AGE_MS = Number(process.env.LOTTO_PACKET_MAX_AGE_MS || 600000);
const LOTTO_WAIT_MS = Number(process.env.LOTTO_WAIT_MS || 15000);
const LOTTO_WS_STALE_MS = Number(process.env.LOTTO_WS_STALE_MS || 70000);

// ===================== VALIDATE =====================
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
const API_LIVE = "https://mylucky2d3d.com/zusksbasqyfg/vodiicunchvb";
const HOME_URL = "https://mylucky2d3d.com/";
const HOLIDAY_URL = "https://mylucky2d3d.com/set-holiday";

// predictlotto socket.io
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
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date()).replace(",", " •");
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
function inMinuteWindow(atHM, windowMins = 1) {
  const t = parseHMToMinutes(atHM);
  if (t === null) return false;
  const now = minutesNowMMT();
  return now >= t && now <= t + Math.max(0, windowMins);
}
function afterHM(hm) {
  const now = minutesNowMMT();
  const t = parseHMToMinutes(hm);
  if (t === null) return false;
  return now >= t;
}
function beforeOrEqualHM(hm, extraMinutes = 0) {
  const now = minutesNowMMT();
  const t = parseHMToMinutes(hm);
  if (t === null) return false;
  return now <= t + Math.max(0, extraMinutes);
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
  const frames = [`⟪${n}⟫`, `⟨${n}⟩`, `(${n})`, `⟮${n}⟯`, `〔${n}〕`, `{${n}}`, `【${n}】`, `〖${n}〗`, `「${n}」`, `『${n}』`];
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
  if (typeof res.data !== "object" || res.data === null) throw new Error("API_NON_JSON");
  return res.data;
}
async function fetchMyluckyLiveJSON(periodVal) {
  const dateVal = ymdMMT();
  return postForm(API_LIVE, { dateVal, periodVal });
}
async function fetchMyluckyLiveScrape(periodVal) {
  const htmlRes = await axios.get(HOME_URL, {
    timeout: 20000,
    headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html,*/*" },
    responseType: "text",
    validateStatus: (s) => s >= 200 && s < 600,
  });
  if (htmlRes.status !== 200 || typeof htmlRes.data !== "string") throw new Error("HOME_HTML_EMPTY");

  const $ = cheerio.load(htmlRes.data);
  const text = $("body").text().replace(/\s+/g, " ").trim();

  const out = {
    status: "success",
    playLucky: "--",
    playSet: "--",
    playValue: "--",
    playDtm: prettyMMT(),
    fiStatus: "no",
    modern: "--",
    internet: "--",
    tw: "--",
  };

  if (text.includes("Modern") && text.includes("Internet")) {
    try {
      const blocks = await fetchModernInternetBlocksFallback();
      if (periodVal === "am") {
        out.modern = blocks.am.modern;
        out.internet = blocks.am.internet;
      } else {
        out.modern = blocks.pm.modern;
        out.internet = blocks.pm.internet;
      }
    } catch {}
  }

  return out;
}

// ===================== LOTTO PREDICT socket.io PRIMARY =====================
let lottoWs = null;
let lottoConnected = false;

let lastData = null;
let lastDataAt = 0;
let lastData2 = null;
let lastData2At = 0;
let lastLogs = [];
let lastLogsAt = 0;
let lastWsPacketAt = 0;

function isNumLike(v) {
  const s = String(v ?? "").trim();
  return /^\d+(\.\d+)?$/.test(s.replace(/,/g, ""));
}

function parseServerTime(serverTime) {
  const s = String(serverTime || "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;

  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  let hh = Number(m[4]);
  const mi = Number(m[5]);
  const ss = Number(m[6]);
  const ap = m[7].toUpperCase();

  if ([dd, mm, yyyy, hh, mi, ss].some(Number.isNaN)) return null;

  hh = hh % 12;
  if (ap === "PM") hh += 12;

  const d = new Date(yyyy, mm - 1, dd, hh, mi, ss);
  return Number.isNaN(d.getTime()) ? null : d;
}

function serverTimeToYMD(serverTime) {
  const d = parseServerTime(serverTime);
  if (!d) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function serverTimeMeridiem(serverTime) {
  const m = String(serverTime || "").match(/\b(AM|PM)\b/i);
  return m ? m[1].toUpperCase() : null;
}

function serverTimeMinutes(serverTime) {
  const d = parseServerTime(serverTime);
  if (!d) return null;
  return d.getHours() * 60 + d.getMinutes();
}

function isTodayServerTime(serverTime) {
  const ymd = serverTimeToYMD(serverTime);
  return !!ymd && ymd === ymdMMT();
}

function isFinalByServerTime(period, serverTime) {
  const mins = serverTimeMinutes(serverTime);
  const target = parseHMToMinutes(period === "am" ? AM_FINAL_TIME : PM_FINAL_TIME);
  if (mins === null || target === null) return false;
  return mins >= target;
}

function setLottoEvent(eventName, payload) {
  lastWsPacketAt = Date.now();

  if (eventName === "data" && payload && typeof payload === "object") {
    lastData = payload;
    lastDataAt = Date.now();
    return;
  }

  if (eventName === "data2" && payload && typeof payload === "object") {
    lastData2 = payload;
    lastData2At = Date.now();
    return;
  }

  if (eventName === "logs" && Array.isArray(payload)) {
    lastLogs = payload.filter((x) => x && typeof x === "object").slice(0, 200);
    lastLogsAt = Date.now();
  }
}

function summarizePacket(eventName, payload) {
  if (eventName === "logs") {
    const top = Array.isArray(payload) && payload[0] ? payload[0] : null;
    return `[LOTTO logs] count=${Array.isArray(payload) ? payload.length : 0} latest=${top?.serverTime || "-"} digit=${top?.digit ?? "-"} set=${top?.set ?? "-"} value=${top?.value ?? "-"}`;
  }

  const mr = payload?.morningRound || {};
  const er = payload?.eveningRound || {};
  return `[LOTTO ${eventName}] time=${payload?.serverTime || "-"} isRunning=${String(payload?.isRunning)} round=${payload?.round ?? "-"} AM=${mr?.digit ?? "-"} PM=${er?.digit ?? "-"} set=${payload?.set ?? "-"} value=${payload?.value ?? "-"}`;
}

function getFreshPacketItems(maxAgeMs = LOTTO_PACKET_MAX_AGE_MS) {
  const items = [];

  if (lastData && Date.now() - lastDataAt <= maxAgeMs) {
    items.push({ at: lastDataAt, v: lastData });
  }

  if (lastData2 && Date.now() - lastData2At <= maxAgeMs) {
    items.push({ at: lastData2At, v: lastData2 });
  }

  return items;
}

function chooseBestPacket(items) {
  if (!items.length) return null;

  const finalOne = items
    .filter((x) => x.v && x.v.isRunning === false)
    .sort((a, b) => b.at - a.at)[0];

  if (finalOne) return finalOne.v;

  items.sort((a, b) => b.at - a.at);
  return items[0].v;
}

function getFreshestLottoPacket(maxAgeMs = LOTTO_PACKET_MAX_AGE_MS) {
  return chooseBestPacket(getFreshPacketItems(maxAgeMs));
}

function getFreshestLottoPacketToday(maxAgeMs = LOTTO_PACKET_MAX_AGE_MS) {
  return chooseBestPacket(
    getFreshPacketItems(maxAgeMs).filter((x) => isTodayServerTime(x.v?.serverTime))
  );
}

function extractRound(period, v) {
  const isAM = period === "am";
  const round = isAM ? (v?.morningRound || {}) : (v?.eveningRound || {});

  const digit = isNumLike(round?.digit) ? round.digit : (isNumLike(v?.digit) ? v.digit : "--");
  const set = isNumLike(round?.set) ? round.set : (isNumLike(v?.set) ? v.set : "--");
  const value = isNumLike(round?.value) ? round.value : (isNumLike(v?.value) ? v.value : "--");

  return { digit, set, value };
}

function lottoToStandard(period, v) {
  const r = extractRound(period, v);
  const isAM = period === "am";

  return {
    status: "success",
    playLucky: r.digit,
    playSet: r.set,
    playValue: r.value,
    playDtm: v?.serverTime ?? "--",
    fiStatus: v?.isRunning === false ? "yes" : "no",
    modern: isAM ? (v?.mornet?.modernMorning ?? "--") : (v?.mornet?.modernEvening ?? "--"),
    internet: isAM ? (v?.mornet?.internetMorning ?? "--") : (v?.mornet?.internetEvening ?? "--"),
    tw: v?.tw ?? "--",
  };
}

function getFreshLogForPeriod(period, maxAgeMs = LOTTO_PACKET_MAX_AGE_MS) {
  if (!Array.isArray(lastLogs) || !lastLogs.length) return null;
  if (!lastLogsAt || Date.now() - lastLogsAt > maxAgeMs) return null;

  const wanted = period === "am" ? "AM" : "PM";

  const rows = lastLogs
    .map((x, i) => ({ i, x, d: parseServerTime(x?.serverTime) }))
    .filter((r) => r.d && isTodayServerTime(r.x?.serverTime) && serverTimeMeridiem(r.x?.serverTime) === wanted);

  if (!rows.length) return null;

  rows.sort((a, b) => b.d.getTime() - a.d.getTime() || a.i - b.i);
  return rows[0].x;
}

function logToStandard(period, row, packetMeta) {
  const isAM = period === "am";

  return {
    status: "success",
    playLucky: isNumLike(row?.digit) ? row.digit : "--",
    playSet: isNumLike(row?.set) ? row.set : "--",
    playValue: isNumLike(row?.value) ? row.value : "--",
    playDtm: row?.serverTime ?? "--",
    fiStatus: packetMeta?.isRunning === false || isFinalByServerTime(period, row?.serverTime) ? "yes" : "no",
    modern: isAM ? (packetMeta?.mornet?.modernMorning ?? "--") : (packetMeta?.mornet?.modernEvening ?? "--"),
    internet: isAM ? (packetMeta?.mornet?.internetMorning ?? "--") : (packetMeta?.mornet?.internetEvening ?? "--"),
    tw: packetMeta?.tw ?? "--",
  };
}

function getBestLottoStandardSync(period, maxAgeMs = LOTTO_PACKET_MAX_AGE_MS) {
  const packetToday = getFreshestLottoPacketToday(maxAgeMs);
  const logRow = getFreshLogForPeriod(period, maxAgeMs);

  if (logRow) return logToStandard(period, logRow, packetToday);
  if (packetToday) return lottoToStandard(period, packetToday);

  return null;
}

async function waitFreshLottoStandard(period, maxAgeMs = LOTTO_PACKET_MAX_AGE_MS, waitMs = LOTTO_WAIT_MS) {
  const deadline = Date.now() + waitMs;

  while (Date.now() < deadline) {
    const v = getBestLottoStandardSync(period, maxAgeMs);
    if (v) return v;
    await sleep(250);
  }

  throw new Error("LOTTO_NO_DATA");
}

async function getFreshLottoPacket(maxAgeMs = LOTTO_PACKET_MAX_AGE_MS) {
  const v = getFreshestLottoPacket(maxAgeMs);
  if (v) return v;

  const deadline = Date.now() + LOTTO_WAIT_MS;
  while (Date.now() < deadline) {
    const retry = getFreshestLottoPacket(maxAgeMs);
    if (retry) return retry;
    await sleep(250);
  }

  throw new Error("LOTTO_NO_DATA");
}

function getModIntFromLotto(v) {
  return {
    am: {
      modern: v?.mornet?.modernMorning ?? "--",
      internet: v?.mornet?.internetMorning ?? "--",
      tw: v?.tw ?? "--",
    },
    pm: {
      modern: v?.mornet?.modernEvening ?? "--",
      internet: v?.mornet?.internetEvening ?? "--",
      tw: v?.tw ?? "--",
    },
  };
}

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
      lottoConnected = false;

      ws.on("open", () => {
        lastWsPacketAt = Date.now();
        console.log("✅ LOTTO WS open");
      });

      ws.on("message", (buf) => {
        lastWsPacketAt = Date.now();

        const raw = buf.toString("utf8");
        const packets = raw.split("\x1e").filter(Boolean);

        for (const msg of packets) {
          if (msg === "2") {
            try { ws.send("3"); } catch {}
            continue;
          }

          if (msg.startsWith("0")) {
            try {
              ws.send(`40/live,{"token":"${LOTTO_TOKEN}"}`);
            } catch {}
            continue;
          }

          if (msg.startsWith("40/live")) {
            lottoConnected = true;
            console.log("✅ LIVE namespace joined");
            continue;
          }

          if (msg.startsWith("42/live,")) {
            try {
              const payload = msg.slice("42/live,".length);
              const arr = JSON.parse(payload);
              const eventName = arr?.[0];
              const dataObj = arr?.[1];

              if (eventName === "data" || eventName === "data2" || eventName === "logs") {
                console.log(summarizePacket(eventName, dataObj));
                setLottoEvent(eventName, dataObj);
              }
            } catch (e) {
              console.log("❌ parse fail:", e.message);
            }
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
        try { ws.close(); } catch {}
      });
    } catch (e) {
      lottoConnected = false;
      console.log("❌ LOTTO WS init error:", e?.message || e);
      setTimeout(connect, 1500);
    }
  };

  connect();
}
startLottoWs();

setInterval(() => {
  if (!lottoWs) return;
  if (lottoWs.readyState !== WebSocket.OPEN) return;
  if (!lastWsPacketAt) return;

  const age = Date.now() - lastWsPacketAt;
  if (age > LOTTO_WS_STALE_MS) {
    console.log(`⚠️ LOTTO WS stale (${age}ms) -> reconnect`);
    lottoConnected = false;
    try { lottoWs.terminate(); } catch {}
  }
}, 15000);

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
    am: pickBlock("9:30 AM"),
    pm: pickBlock("2:00 PM"),
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

အကြောင်းရင်း 👇

*${reason}*

နောက်နေ့ 2D market ပြန်ဖွင့်တာနဲ့ Live ပြန်တင်ပေးပါမယ် ✅

🤖 *${BOT_USERNAME} ဖြင့်ဖန်တီးထားသည်*`;
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
  if (which === "am" && modIntPostedAM) return;
  if (which === "pm" && modIntPostedPM) return;

  let blocks = null;

  try {
    const v = await getFreshLottoPacket(LOTTO_PACKET_MAX_AGE_MS);
    if (v && isTodayServerTime(v.serverTime)) {
      blocks = getModIntFromLotto(v);
    }
  } catch {}

  if (!blocks) {
    try {
      const fb = await fetchModernInternetBlocksFallback();
      blocks = {
        am: { modern: fb.am.modern, internet: fb.am.internet, tw: "--" },
        pm: { modern: fb.pm.modern, internet: fb.pm.internet, tw: "--" },
      };
    } catch {
      blocks = {
        am: { modern: "--", internet: "--", tw: "--" },
        pm: { modern: "--", internet: "--", tw: "--" },
      };
    }
  }

  if (which === "am") {
    const b = blocks.am;
    await safeSendMessage(CHANNEL_ID, modIntTemplate("🕘 *9:30 AM*", b.modern, b.internet, b.tw), { parse_mode: "Markdown" });
    modIntPostedAM = true;
  } else {
    const b = blocks.pm;
    await safeSendMessage(CHANNEL_ID, modIntTemplate("🕑 *2:00 PM*", b.modern, b.internet, b.tw), { parse_mode: "Markdown" });
    modIntPostedPM = true;
  }
}

// ===================== LIVE FETCH SMART =====================
async function fetchLiveSmart(period) {
  try {
    const v = await waitFreshLottoStandard(period, LOTTO_PACKET_MAX_AGE_MS, LOTTO_WAIT_MS);
    if (v && v.status === "success") return v;
  } catch {}

  try {
    const j = await fetchMyluckyLiveJSON(period);
    if (j && j.status === "success") return j;
  } catch {}

  return fetchMyluckyLiveScrape(period);
}

// ===================== TICKS =====================
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

  if (!holidayNoticePosted && inRangeMinutes(HOLIDAY_NOTICE_TIME, "10:01")) {
    if (closed?.closed) {
      await safeSendMessage(CHANNEL_ID, holidayNoticeTemplate(closed.reason), { parse_mode: "Markdown" });
      holidayNoticePosted = true;
    }
  }
  if (closed?.closed) return;

  if (inMinuteWindow(MODINT_AM_POST_AT, MODINT_WINDOW_MINUTES)) await postModInt("am").catch(() => null);
  if (inMinuteWindow(MODINT_PM_POST_AT, MODINT_WINDOW_MINUTES)) await postModInt("pm").catch(() => null);
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

🔴 Live = Edit mode + Pro animation
✅ Final = Check + Pin (Only after ${AM_FINAL_TIME} / ${PM_FINAL_TIME})

🧠 Modern/Internet/TW (Separate posts)
🕘 ${MODINT_AM_POST_AT}  •  🕑 ${MODINT_PM_POST_AT}

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
  const age1 = lastDataAt ? Math.floor((Date.now() - lastDataAt) / 1000) : null;
  const age2 = lastData2At ? Math.floor((Date.now() - lastData2At) / 1000) : null;
  const logsAge = lastLogsAt ? Math.floor((Date.now() - lastLogsAt) / 1000) : null;
  const wsAge = lastWsPacketAt ? Math.floor((Date.now() - lastWsPacketAt) / 1000) : null;

  const freshestAny = getFreshestLottoPacket(24 * 60 * 60 * 1000);
  const freshestToday = getFreshestLottoPacketToday(24 * 60 * 60 * 1000);
  const latestLogAM = getFreshLogForPeriod("am", 24 * 60 * 60 * 1000);
  const latestLogPM = getFreshLogForPeriod("pm", 24 * 60 * 60 * 1000);

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
🛰 ws last packet age: ${wsAge === null ? "none" : `${wsAge}s`}
🛰 data age: ${age1 === null ? "none" : `${age1}s`}
🛰 data2 age: ${age2 === null ? "none" : `${age2}s`}
🛰 logs age: ${logsAge === null ? "none" : `${logsAge}s`}

🛰 latest packet(any): ${freshestAny?.serverTime || "-"}
🛰 latest packet(today): ${freshestToday?.serverTime || "-"}
🛰 latest AM log: ${latestLogAM?.serverTime || "-"}
🛰 latest PM log: ${latestLogPM?.serverTime || "-"}

🛰 token: ${LOTTO_TOKEN}
🛰 host: ${LOTTO_WS_URL}`;

  await safeSendMessage(chatId, s);
});

bot.onText(/\/pingapi/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg)) return denyNotAdmin(chatId);

  try {
    const v = await getFreshLottoPacket(LOTTO_PACKET_MAX_AGE_MS);
    const am = lottoToStandard("am", v);
    const pm = lottoToStandard("pm", v);
    const blocks = getModIntFromLotto(v);

    await safeSendMessage(
      chatId,
      `✅ LOTTO OK (/live)
AM: ${am.playLucky} | SET ${am.playSet} | VALUE ${am.playValue}
PM: ${pm.playLucky} | SET ${pm.playSet} | VALUE ${pm.playValue}
Time: ${am.playDtm}
isRunning: ${v?.isRunning}

Modern(AM): ${blocks.am.modern} | Internet(AM): ${blocks.am.internet} | TW: ${blocks.am.tw}
Modern(PM): ${blocks.pm.modern} | Internet(PM): ${blocks.pm.internet} | TW: ${blocks.pm.tw}`
    );
  } catch (e) {
    await safeSendMessage(chatId, `❌ LOTTO FAIL: ${e.message}`);
  }

  try {
    const m = await fetchMyluckyLiveJSON("am");
    await safeSendMessage(chatId, `✅ mylucky OK (am)\nstatus=${m.status}`);
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
    await postModInt("am");
    await safeSendMessage(chatId, "✅ /forcemodam → Posted 9:30 AM Modern/Internet/TW");
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
    await postModInt("pm");
    await safeSendMessage(chatId, "✅ /forcemodpm → Posted 2:00 PM Modern/Internet/TW");
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
