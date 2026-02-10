/**
 * Myanmar 2D Live Bot — MYLUCKY2D3D API (WEBHOOK / Render)
 * =======================================================
 * ✅ Live updates via EDIT mode every 5s (no spam)
 * ✅ Live animation (Bracket Bounce): ⟪82⟫ → ⟨82⟩ → 〔82〕 → 【82】
 * ✅ Final result ✅ + Pin (ONLY when fiStatus === "yes") — Final is NORMAL number (no animation)
 * ✅ Modern/Internet separate posts (9:30 AM & 2:00 PM MMT) — NO PIN
 * ✅ Single channel only
 * ✅ Admin-only /forceam /forcepm
 * ✅ Rate-limit (429) retry + robust error handling
 *
 * ENV (Render):
 * - BOT_TOKEN   = Telegram Bot Token
 * - CHANNEL_ID  = @YourChannelUsername OR -100xxxxxxxxxx
 * - PUBLIC_URL  = https://your-app.onrender.com
 * - ADMIN_ID    = your Telegram numeric ID (only admin can use /forceam /forcepm)
 * Optional:
 * - EDIT_EVERY_MS = 5000
 * - LIVE_ENABLE_AM = 1 (default on)
 * - LIVE_ENABLE_PM = 1 (default on)
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
const LIVE_ENABLE_AM = process.env.LIVE_ENABLE_AM !== "0"; // default true
const LIVE_ENABLE_PM = process.env.LIVE_ENABLE_PM !== "0"; // default true

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

// ===== API ENDPOINTS (from view-source) =====
const API_LIVE = "https://mylucky2d3d.com/zusksbasqyfg/vodiicunchvb"; // POST dateVal, periodVal(am/pm)
const API_AM_REPORT = "https://mylucky2d3d.com/zusksbasqyfg/bpkhhthjpgve"; // POST dateVal (optional use)
const API_WEEKLY = "https://mylucky2d3d.com/zusksbasqyfg/ypcydmlxbhfv"; // POST dateVal (optional use)

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

// ===== TIME WINDOWS (MMT) =====
// Morning live window: 11:25 – 12:02 (MMT)
// Evening live window: 15:59 – 16:31 (MMT)
function inMorningLiveWindow() {
  const m = minutesNowMMT();
  return m >= 11 * 60 + 25 && m <= 12 * 60 + 2;
}
function inEveningLiveWindow() {
  const m = minutesNowMMT();
  return m >= 15 * 60 + 59 && m <= 16 * 60 + 31;
}

// Modern/Internet times (MMT): 9:30 AM and 2:00 PM
function inWindow(h, min, windowMin = 2) {
  const now = minutesNowMMT();
  const t = h * 60 + min;
  return now >= t && now <= t + windowMin;
}

// ===== Animation Tick (Telegram-safe) =====
let pulseIdx = 0;
function pulseTick() {
  pulseIdx = (pulseIdx + 1) % 4;
}

// ✅ Style: Bracket Bounce animation
function bracketBounce(n) {
  const frames = [
    `⟪${n}⟫`,
    `⟨${n}⟩`,
    `〔${n}〕`,
    `【${n}】`,
  ];
  return frames[pulseIdx % frames.length];
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
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    }
  });
  return data;
}

/**
 * Live AM/PM data:
 * returns: { status, playSet, playValue, playLucky, playDtm, fiStatus }
 */
async function fetchLive(periodVal /* 'am'|'pm' */) {
  const dateVal = ymdMMT();
  return postForm(API_LIVE, { dateVal, periodVal });
}

// (Optional) not required for core features:
async function fetchAmReport() {
  const dateVal = ymdMMT();
  return postForm(API_AM_REPORT, { dateVal });
}
async function fetchWeekly() {
  const dateVal = ymdMMT();
  return postForm(API_WEEKLY, { dateVal });
}

// ===== MODERN/INTERNET (HTML scrape) =====
async function fetchModernInternetBlocks() {
  const res = await axios.get("https://mylucky2d3d.com/", {
    timeout: 15000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    }
  });

  const $ = cheerio.load(res.data);

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
      if (/^\d{2}$/.test(v)) nums.push(v);
    });

    return {
      time: timeLabel,
      modern: nums[0] || "--",
      internet: nums[1] || "--"
    };
  }

  return {
    am930: pickBlock("9:30 AM"),
    pm200: pickBlock("2:00 PM")
  };
}

// ===== MESSAGE FORMATTERS =====
function liveMessageTemplate(label, liveNum, set, value, upd) {
  pulseTick(); // animation frame tick every build
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

// Final stays NORMAL (no animation)
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

// daily Mod/Int post lock
let lastPostedModIntMorningDate = null;
let lastPostedModIntEveningDate = null;

// final posted flags (per day)
let finalDoneAM = false;
let finalDonePM = false;

// change detection to reduce edits
let lastKeyAM = null;
let lastKeyPM = null;

// ===== DAILY RESET =====
function resetDailyStateIfNeeded() {
  const today = ymdMMT();
  if (today !== stateDate) {
    stateDate = today;

    liveMsgIdAM = null;
    liveMsgIdPM = null;

    pinnedFinalIdAM = null;
    pinnedFinalIdPM = null;

    lastPostedModIntMorningDate = null;
    lastPostedModIntEveningDate = null;

    finalDoneAM = false;
    finalDonePM = false;

    lastKeyAM = null;
    lastKeyPM = null;

    console.log("✅ Daily state reset:", stateDate);
  }
}

// ===== LIVE EDIT FLOW =====
async function upsertLive(period, data) {
  const isAM = period === "am";
  const label = isAM ? "🌅 MORNING" : "🌆 EVENING";

  // IMPORTANT: include pulseIdx so animation edits keep happening even if data doesn't change
  const key = `${data.playLucky}|${data.playSet}|${data.playValue}|${data.playDtm}|${data.fiStatus}|${pulseIdx}`;
  if (isAM && key === lastKeyAM) return;
  if (!isAM && key === lastKeyPM) return;

  const text = liveMessageTemplate(label, data.playLucky, data.playSet, data.playValue, data.playDtm);
  const opts = { parse_mode: "Markdown" };

  if (isAM) {
    if (!liveMsgIdAM) {
      const sent = await safeSendMessage(CHANNEL_ID, text, opts);
      liveMsgIdAM = sent.message_id;
    } else {
      await safeEditMessage(CHANNEL_ID, liveMsgIdAM, text, opts);
    }
    lastKeyAM = key;
  } else {
    if (!liveMsgIdPM) {
      const sent = await safeSendMessage(CHANNEL_ID, text, opts);
      liveMsgIdPM = sent.message_id;
    } else {
      await safeEditMessage(CHANNEL_ID, liveMsgIdPM, text, opts);
    }
    lastKeyPM = key;
  }
}

async function postFinal(period, data) {
  const isAM = period === "am";
  const label = isAM ? "🌅 MORNING" : "🌆 EVENING";

  const text = finalMessageTemplate(label, data.playLucky, data.playSet, data.playValue, data.playDtm);
  const opts = { parse_mode: "Markdown" };

  const sent = await safeSendMessage(CHANNEL_ID, text, opts);

  // unpin previous final for this period only
  if (isAM && pinnedFinalIdAM) await safeUnpin(CHANNEL_ID, pinnedFinalIdAM);
  if (!isAM && pinnedFinalIdPM) await safeUnpin(CHANNEL_ID, pinnedFinalIdPM);

  // pin this final
  await safePin(CHANNEL_ID, sent.message_id);

  if (isAM) pinnedFinalIdAM = sent.message_id;
  else pinnedFinalIdPM = sent.message_id;

  // stop editing further for that period today
  if (isAM) finalDoneAM = true;
  else finalDonePM = true;
}

// ===== MODERN/INTERNET DAILY POSTS (NO PIN) =====
async function postModInt(type /* morning|evening */) {
  const today = ymdMMT();
  if (type === "morning" && lastPostedModIntMorningDate === today) return;
  if (type === "evening" && lastPostedModIntEveningDate === today) return;

  const blocks = await fetchModernInternetBlocks();
  const block = type === "morning" ? blocks?.am930 : blocks?.pm200;
  if (!block) return;

  const title = type === "morning" ? "🕤 *9:30 AM*" : "🕑 *2:00 PM*";
  const msg = modIntTemplate(title, block.modern, block.internet);

  await safeSendMessage(CHANNEL_ID, msg, { parse_mode: "Markdown" });

  if (type === "morning") lastPostedModIntMorningDate = today;
  else lastPostedModIntEveningDate = today;
}

// ===== MAIN TICKS =====
async function tickLive() {
  resetDailyStateIfNeeded();

  // Morning live
  if (LIVE_ENABLE_AM && inMorningLiveWindow() && !finalDoneAM) {
    const data = await fetchLive("am").catch(() => null);
    if (data && data.status === "success") {
      if (data.fiStatus === "yes") {
        await postFinal("am", data);
      } else {
        await upsertLive("am", data);
      }
    }
  }

  // Evening live
  if (LIVE_ENABLE_PM && inEveningLiveWindow() && !finalDonePM) {
    const data = await fetchLive("pm").catch(() => null);
    if (data && data.status === "success") {
      if (data.fiStatus === "yes") {
        await postFinal("pm", data);
      } else {
        await upsertLive("pm", data);
      }
    }
  }
}

async function tickModInt() {
  resetDailyStateIfNeeded();

  // Morning 9:30 AM (9:30–9:32)
  if (inWindow(9, 30, 2)) {
    await postModInt("morning").catch(() => null);
  }

  // Evening 2:00 PM (14:00–14:02)
  if (inWindow(14, 0, 2)) {
    await postModInt("evening").catch(() => null);
  }
}

// Start loops
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
🌅 Morning : 11:25 – 12:02
🌆 Evening : 3:59 – 4:31

🔴 Live numbers = Red dot (Edit mode + Animation)
✅ Final result = Check + Pin (Only final)

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

🌅 Morning live msg: ${liveMsgIdAM ? "YES" : "NO"}
🌆 Evening live msg: ${liveMsgIdPM ? "YES" : "NO"}

✅ Final AM posted: ${finalDoneAM ? "YES" : "NO"}
✅ Final PM posted: ${finalDonePM ? "YES" : "NO"}

🧠 Admin ID set: ${ADMIN_ID ? "YES" : "NO"}`;

  await safeSendMessage(msg.chat.id, s);
});

// Admin-only: Force fetch + update (without time window)
bot.onText(/\/forceam/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg)) return denyNotAdmin(chatId);

  try {
    const data = await fetchLive("am");
    if (!data || data.status !== "success") {
      return safeSendMessage(chatId, `⚠️ AM fetch မရပါ (status: ${data?.status || "unknown"})`);
    }

    if (data.fiStatus === "yes") {
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

    if (data.fiStatus === "yes") {
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

// Optional: show your Telegram ID
bot.onText(/\/myid/, async (msg) => {
  const chatId = msg.chat.id;
  await safeSendMessage(chatId, `🆔 Your Telegram ID: ${msg.from.id}`);
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
