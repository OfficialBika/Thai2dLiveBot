/**
 * Myanmar 2D Live + Final Bot (REAL FINAL)
 * Hosting : Render Free (Webhook)
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
  return new Date(Date.now() + 6.5 * 60 * 60 * 1000);
}

function getMyanmarPrettyDateTime() {
  return getMMTDate()
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
   📌 STATE
   ========================= */
let lastMorningLive = null;
let lastEveningLive = null;
let finalMorning = null;
let finalEvening = null;
let lastPinnedMessageId = null;

/* =========================
   🤖 COMMANDS
   ========================= */
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
`🎯 Myanmar 2D Live Bot

⏰ Market Time (Myanmar)
🌅 Morning : 11:45 – Final
🌆 Evening : 3:59 – Final

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

// Debug test
bot.onText(/\/testpost/, async (msg) => {
  try {
    await bot.sendMessage(CHANNEL_ID, "✅ Test post OK");
    bot.sendMessage(msg.chat.id, "✅ Channel post OK");
  } catch (e) {
    bot.sendMessage(msg.chat.id, "❌ Channel post failed");
  }
});

/* =========================
   📤 POST HELPERS
   ========================= */
async function sendChannel(msg) {
  try {
    return await bot.sendMessage(CHANNEL_ID, msg, { parse_mode: "Markdown" });
  } catch (e) {
    console.error("Send error:", e.message);
    return null;
  }
}

async function postLive(type, num) {
  const label = type === "morning" ? "🌅 MORNING" : "🌆 EVENING";

  const msg =
`╭───────────╮
│ ${label} │
╰───────────╯
📅 ${getMyanmarPrettyDateTime()}

🎯 *Now 2D* : 🔴 *${num}*`;

  await sendChannel(msg);
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

  const sent = await sendChannel(msg);
  if (!sent) return;

  try {
    if (lastPinnedMessageId) {
      await bot.unpinChatMessage(CHANNEL_ID, lastPinnedMessageId);
    }
    await bot.pinChatMessage(CHANNEL_ID, sent.message_id, {
      disable_notification: true
    });
    lastPinnedMessageId = sent.message_id;
  } catch {}
}

/* =========================
   🌐 SCRAPER (thaistock2d.com)
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
    const pageText = $("body").text();

    // 🔴 LIVE = Big number (top)
    const bigNum = pageText.match(/\b\d{2}\b/)?.[0];

    // Final cards
    function getFinal(timeLabel) {
      let block = null;
      $("div").each((_, el) => {
        if ($(el).text().includes(timeLabel)) block = $(el);
      });
      if (!block) return null;

      const text = block.text();
      return {
        num: text.match(/\b\d{2}\b/)?.[0],
        set: text.match(/Set\s*([\d,.]+)/)?.[1],
        value: text.match(/Value\s*([\d,.]+)/)?.[1]
      };
    }

    const morningFinal = getFinal("12:01 PM");
    const eveningFinal = getFinal("04:30 PM");

    /* ===== MORNING ===== */
    if (!finalMorning) {
      if (morningFinal?.num) {
        finalMorning = morningFinal.num;
        await postFinal("morning", morningFinal.num, morningFinal.set, morningFinal.value);
      } else if (bigNum && bigNum !== lastMorningLive) {
        lastMorningLive = bigNum;
        await postLive("morning", bigNum);
      }
    }

    /* ===== EVENING ===== */
    if (finalMorning && !finalEvening) {
      if (eveningFinal?.num) {
        finalEvening = eveningFinal.num;
        await postFinal("evening", eveningFinal.num, eveningFinal.set, eveningFinal.value);
      } else if (bigNum && bigNum !== lastEveningLive) {
        lastEveningLive = bigNum;
        await postLive("evening", bigNum);
      }
    }

  } catch (e) {
    console.error("Scrape error:", e.message);
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
    console.log("✅ Bot running on port", PORT);
  });
