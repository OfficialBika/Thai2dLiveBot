/**
 * Thai 2D Live + Final Bot (WEBHOOK VERSION)
 * Hosting : Render Free Web Service
 */

const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const cheerio = require("cheerio");
const http = require("http");

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PORT = process.env.PORT || 3000;
const WEBHOOK_PATH = "/webhook";
const WEBHOOK_URL = `https://thai2dlivebot.onrender.com${WEBHOOK_PATH}`;

const bot = new TelegramBot(BOT_TOKEN);

// ===== SET WEBHOOK =====
bot.setWebHook(WEBHOOK_URL);

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(
    chatId,
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
        inline_keyboard: [
          [
            {
              text: "🔔 Join 2D Live Channel",
              url: "https://t.me/Live2DSet"
            }
          ]
        ]
      }
    }
  );
});

// ===== STATE =====
let lastMorningLive = null;
let lastEveningLive = null;
let finalMorning = null;
let finalEvening = null;
let lastPinnedMessageId = null;
let lastErrorAt = 0;

// ===== TIME (MYANMAR) =====
function getMyanmarPrettyDateTime() {
  return new Date()
    .toLocaleString("en-US", {
      timeZone: "Asia/Yangon",
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
  const d = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Yangon" })
  );
  return d.getHours() * 60 + d.getMinutes();
}

// ===== TIME WINDOWS =====
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

// ===== POST HELPERS =====
async function postLive(type, num, set, value) {
  const label = type === "morning" ? "🌅 MORNING" : "🌆 EVENING";

  const msg =
`╭───────────╮
│ ${label} │
╰───────────╯
📅 ${getMyanmarPrettyDateTime()}

🎯 *Now 2D* : 🔴 *${num}*

📊 *SET*
🟢 *${set}*

💰 *VALUE*
🔵 *${value}*`;

  await bot.sendMessage(CHANNEL_ID, msg, { parse_mode: "Markdown" });
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
🟢 *${set}*

💰 *VALUE*
🔵 *${value}*`;

  const sent = await bot.sendMessage(CHANNEL_ID, msg, {
    parse_mode: "Markdown"
  });

  if (lastPinnedMessageId) {
    await bot.unpinChatMessage(CHANNEL_ID, lastPinnedMessageId).catch(() => {});
  }

  await bot.pinChatMessage(CHANNEL_ID, sent.message_id, {
    disable_notification: true
  });

  lastPinnedMessageId = sent.message_id;
}

// ===== SCRAPER =====
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
      console.log("Scrape error:", e.message);
    }
  }
}

// ===== LOOP =====
setInterval(fetchThai2D, 30 * 1000);

// ===== HTTP SERVER (WEBHOOK) =====
http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url === WEBHOOK_PATH) {
      let body = "";
      req.on("data", chunk => (body += chunk));
      req.on("end", () => {
        try {
          const update = JSON.parse(body);
          bot.processUpdate(update);
        } catch {}
        res.writeHead(200);
        res.end("OK");
      });
    } else {
      res.writeHead(200);
      res.end("Bot is running");
    }
  })
  .listen(PORT);
