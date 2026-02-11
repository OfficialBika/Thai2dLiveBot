/**
 * Myanmar 2D Live Bot — MYLUCKY2D3D (WEBHOOK / Render)
 * ===================================================
 * ✅ Live updates via EDIT mode every 5s (no spam)
 * ✅ Live animation (Bracket Bounce): ⟪82⟫ → ⟨82⟩ → 〔82〕 → 【82】
 * ✅ Final result ✅ + Pin (ONLY after final time + fiStatus === "yes")
 * ✅ Modern/Internet separate posts (9:30 AM & 2:00 PM MMT) — NO PIN
 * ✅ Single channel only
 * ✅ Admin-only: /forceam /forcepm /forcemodam /forcemodpm
 * ✅ /test /status /myid
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
 */

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
const HOME_URL = "https://mylucky2d3d.com/"; // for modern/internet HTML scrape

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
      hour12: true
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
    timeout: 15000,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0"
    }
  });
  return data;
}
async function fetchLive(periodVal /* 'am'|'pm' */) {
  const dateVal = ymdMMT();
  return postForm(API_LIVE, { dateVal, periodVal });
}

// ===== MODERN/INTERNET (HTML scrape) =====
async function fetchModernInternetBlocks() {
  const url = "https://mylucky2d3d.com/";
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,my;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": "https://mylucky2d3d.com/",
    "Upgrade-Insecure-Requests": "1",
  };

  // retry 2 times (406/403 sometimes)
  let html = null;
  for (let i = 0; i < 2; i++) {
    try {
      const res = await axios.get(url, {
        timeout: 20000,
        headers,
        responseType: "text",
        validateStatus: (s) => s >= 200 && s < 500, // don't throw, we handle
      });

      if (res.status === 200 && typeof res.data === "string") {
        html = res.data;
        break;
      }

      // if 406/403 -> wait then retry
      if (res.status === 406 || res.status === 403) {
        await sleep(1200);
        continue;
      }

      throw new Error(`HTTP_${res.status}`);
    } catch (e) {
      if (i === 1) throw e;
      await sleep(1200);
    }
  }

  if (!html) throw new Error("HTML_EMPTY");

  const $ = cheerio.load(html);

  // ✅ page ထဲမှာ modIntV ကို class နဲ့ ရှိနေတာကြောင့် ဒီလိုစုပ်မယ်
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

    console.log("✅ Daily state reset:", stateDate);
  }
}

// ===== FINAL GUARDS (fix “Final တန်းပို့” issue) =====
// Only treat as Final if:
// - fiStatus === "yes"
// - AND (time is after official final time) OR playDtm includes "12:01" / "16:30"
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

2D ဂဏန်း တိုက်ရိုက်ကြည့်ရန်
Channel ကို join ပါ 👇`;

  await safeSendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔔 Join 2D Live Channel", url: "https://t.me/Live2DSet" }]
      ]
    }
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
  const s =
`📌 Bot Status
📅 Date (MMT): ${ymdMMT()}
⏱ Edit interval: ${EDIT_EVERY_MS}ms

🌅 AM live msg: ${liveMsgIdAM ? "YES" : "NO"}
🌆 PM live msg: ${liveMsgIdPM ? "YES" : "NO"}

✅ Final AM done: ${finalDoneAM ? "YES" : "NO"}
✅ Final PM done: ${finalDonePM ? "YES" : "NO"}

🧠 Mod/Int AM posted: ${modIntPostedAM ? "YES" : "NO"}
🧠 Mod/Int PM posted: ${modIntPostedPM ? "YES" : "NO"}

🔐 Admin ID set: ${ADMIN_ID ? "YES" : "NO"}
📢 Channel: ${CHANNEL_ID}`;

  await safeSendMessage(msg.chat.id, s);
});

bot.onText(/\/myid/, async (msg) => {
  await safeSendMessage(msg.chat.id, `🆔 Your Telegram ID: ${msg.from.id}`);
});

// Admin: force live/final
bot.onText(/\/forceam/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg)) return denyNotAdmin(chatId);

  try {
    const data = await fetchLive("am");
    if (!data || data.status !== "success") {
      return safeSendMessage(chatId, `⚠️ AM fetch မရပါ (status: ${data?.status || "unknown"})`);
    }

    // force = respect real final guard, so you can still see live
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

// Admin: force modern/internet posts (NO PIN)
bot.onText(/\/forcemodam/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg)) return denyNotAdmin(chatId);
  try {
    modIntPostedAM = false; // allow re-post
    await postModInt("am930");
    await safeSendMessage(chatId, "✅ /forcemodam → Posted 9:30 AM Modern/Internet");
  } catch (e) {
    await safeSendMessage(chatId, `❌ /forcemodam error: ${e.message}`);
  }
});

bot.onText(/\/forcemodpm/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg)) return denyNotAdmin(chatId);
  try {
    modIntPostedPM = false; // allow re-post
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

    res.writeHead(200);
    res.end("Bot is running");
  })
  .listen(PORT, () => console.log("✅ Server running on port", PORT));
