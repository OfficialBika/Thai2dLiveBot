/**
 * Myanmar 2D Live + Final Bot
 * Source : mylucky2d3d.com
 * Hosting : Render Free (Webhook-less polling)
 */

const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const cheerio = require("cheerio");
const http = require("http");

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN || !CHANNEL_ID) {
  console.error("❌ BOT_TOKEN or CHANNEL_ID missing");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN);

/* =====================
   🇲🇲 MYANMAR TIME
   ===================== */
function getMyanmarTime() {
  return new Date(Date.now() + 6.5 * 60 * 60 * 1000);
}

function prettyTime() {
  return getMyanmarTime()
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

function minutesNow() {
  const d = getMyanmarTime();
  return d.getHours() * 60 + d.getMinutes();
}

/* =====================
   ⏰ TIME WINDOWS
   ===================== */
const MORNING_START = 11 * 60;
const MORNING_END = 12 * 60 + 5;

const EVENING_START = 15 * 60;
const EVENING_END = 16 * 60 + 35;

function isMorning() {
  const m = minutesNow();
  return m >= MORNING_START && m <= MORNING_END;
}

function isEvening() {
  const m = minutesNow();
  return m >= EVENING_START && m <= EVENING_END;
}

/* =====================
   📌 STATE
   ===================== */
let lastLive = null;
let finalMorning = false;
let finalEvening = false;
let lastPinnedId = null;

/* =====================
   📤 POST HELPERS
   ===================== */
async function send(msg) {
  try {
    return await bot.sendMessage(CHANNEL_ID, msg, { parse_mode: "Markdown" });
  } catch (e) {
    console.error("Send error:", e.message);
    return null;
  }
}

async function postLive(type, num, set, value) {
  const label = type === "morning" ? "🌅 MORNING" : "🌆 EVENING";

  const msg =
`╭───────────╮
│ ${label} │
╰───────────╯
📅 ${prettyTime()}

🎯 *Now 2D* : 🔴 *${num}*

📊 *SET*
🟢 *${set}*

💰 *VALUE*
🔵 *${value}*`;

  await send(msg);
}

async function postFinal(type, num, set, value) {
  const label = type === "morning" ? "🌅 MORNING" : "🌆 EVENING";

  const msg =
`╭───────────╮
│ ${label} │
╰───────────╯
📅 ${prettyTime()}

🎯 *Now 2D* : *${num}* ✅

📊 *SET*
🟢 *${set}*

💰 *VALUE*
🔵 *${value}*`;

  const sent = await send(msg);
  if (!sent) return;

  try {
    if (lastPinnedId) {
      await bot.unpinChatMessage(CHANNEL_ID, lastPinnedId);
    }
    await bot.pinChatMessage(CHANNEL_ID, sent.message_id, {
      disable_notification: true
    });
    lastPinnedId = sent.message_id;
  } catch {}
}

/* =====================
   🌐 SCRAPER
   ===================== */
async function fetch2D() {
  try {
    const res = await axios.get("https://mylucky2d3d.com/", {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
      }
    });

    const $ = cheerio.load(res.data);

    const pageText = $("body").text();

    // 🔴 LIVE BLOCK (big number + dynamic set/value)
    const liveNum = pageText.match(/\b\d{2}\b/)?.[0];
    const liveSet = pageText.match(/SET\s*([\d,.]+)/)?.[1];
    const liveValue = pageText.match(/VALUE\s*([\d,.]+)/)?.[1];

    // FINAL BLOCKS
    function getFinal(label) {
      let block = null;
      $("div").each((_, el) => {
        if ($(el).text().includes(label)) block = $(el);
      });
      if (!block) return null;

      const text = block.text();
      return {
        num: text.match(/\b\d{2}\b/)?.[0],
        set: text.match(/SET\s*([\d,.]+)/)?.[1],
        value: text.match(/VALUE\s*([\d,.]+)/)?.[1]
      };
    }

    const morningFinal = getFinal("12:01");
    const eveningFinal = getFinal("16:30");

    /* ===== MORNING ===== */
    if (isMorning() && !finalMorning) {
      if (morningFinal?.num) {
        finalMorning = true;
        await postFinal("morning", morningFinal.num, morningFinal.set, morningFinal.value);
      } else if (
        liveNum &&
        liveSet &&
        liveValue &&
        JSON.stringify({ liveNum, liveSet, liveValue }) !== lastLive
      ) {
        lastLive = JSON.stringify({ liveNum, liveSet, liveValue });
        await postLive("morning", liveNum, liveSet, liveValue);
      }
    }

    /* ===== EVENING ===== */
    if (isEvening() && !finalEvening) {
      if (eveningFinal?.num) {
        finalEvening = true;
        await postFinal("evening", eveningFinal.num, eveningFinal.set, eveningFinal.value);
      } else if (
        liveNum &&
        liveSet &&
        liveValue &&
        JSON.stringify({ liveNum, liveSet, liveValue }) !== lastLive
      ) {
        lastLive = JSON.stringify({ liveNum, liveSet, liveValue });
        await postLive("evening", liveNum, liveSet, liveValue);
      }
    }

  } catch (e) {
    console.error("Scrape error:", e.message);
  }
}

/* =====================
   🔁 LOOP
   ===================== */
setInterval(fetch2D, 30 * 1000);

/* =====================
   🌐 KEEP ALIVE
   ===================== */
http
  .createServer((_, res) => {
    res.writeHead(200);
    res.end("Bot running");
  })
  .listen(PORT, () => {
    console.log("✅ Bot running on port", PORT);
  });
