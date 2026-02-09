/**
 * Myanmar 2D Live + Final Bot (WEBHOOK – FINAL FIX)
 * Hosting : Render Free Web Service
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

/* =========================
   🇲🇲 MYANMAR TIME (UTC+6:30)
   ========================= */
function getMMTDate() {
  const now = new Date();
  return new Date(now.getTime() + 6.5 * 60 * 60 * 1000);
}

function minutesNowMMT() {
  const d = getMMTDate();
  return d.getHours() * 60 + d.getMinutes();
}

function getMyanmarPrettyDateTime() {
  const d = getMMTDate();
  return d
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

/* =========================
   ⏰ TIME WINDOWS
   ========================= */
function isMorningWindow() {
  const m = minutesNowMMT();
  return m >= 11 * 60 + 45 && m <= 12 * 60 + 2;
}

function isEveningWindow() {
  const m = minutesNowMMT();
  return m >= 15 * 60 + 59 && m <= 16 * 60 + 31;
}

function isFinalMoment(type) {
  const m = minutesNowMMT();
  if (type === "morning") return m >= 12 * 60;
  if (type === "evening") return m >= 16 * 60 + 25;
  return false;
}

/* =========================
   📌 STATE
   ========================= */
let lastMorningLive = null;
let lastEveningLive = null;
let finalMorning = null;
let finalEvening = null;
let lastPinnedMessageId = null;
let lastErrorAt = 0;

/* =========================
   🤖 COMMANDS
   ========================= */
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
`🎯 Myanmar 2D Live Bot

⏰ Market Time (Myanmar)
🌅 Morning : 11:45 – 12:02
🌆 Evening : 3:59 – 4:31

🔴 Live numbers = Red dot
✅ Final result = Check + Pin

2D ဂဏန်း တိုက်ရိုက်ကြည့်ရန်
Channel ကို join ပါ 👇`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: "🔔 Join 2D Live Channel", url: "https://t.me/Live2DSet" }
        ]]
      }
    }
  );
});

// debug (လိုအပ်ရင်သာ သုံး)
bot.onText(/\/testpost/, async (msg) => {
  try {
    await bot.sendMessage(CHANNEL_ID, "✅ Test post OK");
    bot.sendMessage(msg.chat.id, "✅ Channel post OK");
  } catch (e) {
    bot.sendMessage(msg.chat.id, "❌ Channel post failed");
    console.error("Channel error:", e.message);
  }
});

/* =========================
   📤 POST HELPERS
   ========================= */
async function safeSendChannel(msg) {
  try {
    return await bot.sendMessage(CHANNEL_ID, msg, { parse_mode: "Markdown" });
  } catch (e) {
    console.error("❌ sendMessage error:", e.message);
    return null;
  }
}

async function postLive(type, num, set, value) {
  const label = type === "morning" ? "🌅 MORNING" : "🌆 EVENING";

  const msg =
`╭───────────╮
│ ${label} │
╰───────────╯
📅 ${getMyanmarPrettyDateTime()}

🎯 *Now 2D* : 🔴 *${num}*

📊 *SET*
🟢 *${set || "-"}*

💰 *VALUE*
🔵 *${value || "-"}*`;

  await safeSendChannel(msg);
}

async function postFinal(type, num, set, value) {
  const label = type === "morning" ? "🌅 MORNING" : "🌆 EVENING";

  const msg =
`╭───────────╮
│ ${label} │
╰───────────╯
📅 ${getMyanmarPrettyDateTime()}

🎯 *Now 2D* : *${num}* ✅

📊 *SET*
🟢 *${set || "-"}*

💰 *VALUE*
🔵 *${value || "-"}*`;

  const sent = await safeSendChannel(msg);
  if (!sent) return;

  try {
    if (lastPinnedMessageId) {
      await bot.unpinChatMessage(CHANNEL_ID, lastPinnedMessageId);
    }
    await bot.pinChatMessage(CHANNEL_ID, sent.message_id, {
      disable_notification: true
    });
    lastPinnedMessageId = sent.message_id;
  } catch (e) {
    console.error("❌ pin error:", e.message);
  }
}

/* =========================
   🌐 SCRAPER
   ========================= */
async function fetchThai2D() {
  try {
    const res = await axios.get("https://www.thaistock2d.com/", {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
      }
    });

    const $ = cheerio.load(res.data);

    const nums = [];
    $(".live-result .number").each((i, el) => {
      const t = $(el).text().trim();
      if (/^\d{2}$/.test(t)) nums.push(t);
    });

    const sets = [];
    const values = [];
    $(".live-result .set").each((i, el) => sets.push($(el).text().trim()));
    $(".live-result .value").each((i, el) => values.push($(el).text().trim()));

    const morningNum = nums[0];
    const eveningNum = nums[1];

    if (morningNum && isMorningWindow()) {
      if (!finalMorning && isFinalMoment("morning")) {
        finalMorning = morningNum;
        await postFinal("morning", morningNum, sets[0], values[0]);
      } else if (morningNum !== lastMorningLive) {
        lastMorningLive = morningNum;
        await postLive("morning", morningNum, sets[0], values[0]);
      }
    }

    if (eveningNum && isEveningWindow()) {
      if (!finalEvening && isFinalMoment("evening")) {
        finalEvening = eveningNum;
        await postFinal("evening", eveningNum, sets[1], values[1]);
      } else if (eveningNum !== lastEveningLive) {
        lastEveningLive = eveningNum;
        await postLive("evening", eveningNum, sets[1], values[1]);
      }
    }
  } catch (e) {
    const t = Date.now();
    if (t - lastErrorAt > 120000) {
      lastErrorAt = t;
      console.error("Scrape error:", e.message);
    }
  }
}

/* =========================
   🔁 LOOP
   ========================= */
setInterval(fetchThai2D, 30 * 1000);

/* =========================
   🌐 WEBHOOK SERVER
   ========================= */
http
  .createServer((req, res) => {
    if (req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          bot.processUpdate(JSON.parse(body));
        } catch {}
        res.writeHead(200);
        res.end("OK");
      });
    } else {
      res.writeHead(200);
      res.end("Bot is running");
    }
  })
  .listen(PORT, () => {
    console.log("✅ Server running on port", PORT);
  });
