/**
 * Myanmar 2D Live + Final Bot (mylucky2d3d.com)
 * Hosting : Render Free Web Service (WEBHOOK)
 */

const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const cheerio = require("cheerio");
const http = require("http");

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PORT = process.env.PORT || 3000;

const PUBLIC_URL = process.env.PUBLIC_URL; // e.g. https://thai2dlivebot.onrender.com
const WEBHOOK_PATH = "/webhook";

if (!BOT_TOKEN || !CHANNEL_ID || !PUBLIC_URL) {
  console.error("❌ Missing ENV: BOT_TOKEN or CHANNEL_ID or PUBLIC_URL");
  process.exit(1);
}

const WEBHOOK_URL = `${PUBLIC_URL.replace(/\/$/, "")}${WEBHOOK_PATH}`;

// ===== BOT (WEBHOOK MODE) =====
const bot = new TelegramBot(BOT_TOKEN);
bot.setWebHook(WEBHOOK_URL)
  .then(() => console.log("✅ Webhook set:", WEBHOOK_URL))
  .catch((e) => console.error("❌ setWebHook error:", e.message));

/* =====================
   🇲🇲 MYANMAR TIME (UTC+6:30)
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
   ⏰ TIME WINDOWS (MMT)
   ===================== */
const MORNING_START = 11 * 60;        // 11:00
const MORNING_END = 12 * 60 + 20;     // 12:20 buffer
const EVENING_START = 15 * 60;        // 15:00
const EVENING_END = 16 * 60 + 45;     // 16:45 buffer

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
let lastMorningLiveKey = null;
let lastEveningLiveKey = null;
let finalMorningDone = false;
let finalEveningDone = false;
let lastPinnedId = null;

/* =====================
   🤖 COMMANDS
   ===================== */
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
`🎯 Myanmar 2D Live Bot

⏰ Market Time (Myanmar)
🌅 Morning : 11:00 – Final
🌆 Evening : 3:00 – Final

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

bot.onText(/\/testpost|\/test/, async (msg) => {
  try {
    await bot.sendMessage(CHANNEL_ID, "✅ Test post OK");
    await bot.sendMessage(msg.chat.id, "✅ Channel post OK");
  } catch {
    await bot.sendMessage(msg.chat.id, "❌ Channel post failed");
  }
});

bot.onText(/\/history/, async (msg) => {
  await bot.sendMessage(msg.chat.id, "📊 History: (မထည့်သေးပါ) — လိုချင်ရင် DB ထည့်ပြီးရေးပေးမယ် ✅");
});

/* =====================
   📤 POST HELPERS
   ===================== */
async function sendChannel(msg) {
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
🟢 *${set || "-"}*

💰 *VALUE*
🔵 *${value || "-"}*`;

  await sendChannel(msg);
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
🟢 *${set || "-"}*

💰 *VALUE*
🔵 *${value || "-"}*`;

  const sent = await sendChannel(msg);
  if (!sent) return;

  try {
    if (lastPinnedId) {
      await bot.unpinChatMessage(CHANNEL_ID, lastPinnedId).catch(() => {});
    }
    await bot.pinChatMessage(CHANNEL_ID, sent.message_id, {
      disable_notification: true
    });
    lastPinnedId = sent.message_id;
  } catch (e) {
    console.error("Pin error:", e.message);
  }
}

/* =====================
   🌐 SCRAPER HELPERS
   ===================== */
function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

/**
 * ✅ Live big number extraction for mylucky2d3d.com
 * We take the LAST 2-digit number right before "Updated:" line.
 * This avoids grabbing date "09" or time "12".
 */
function extractLiveBig2D(pageText) {
  const t = cleanText(pageText);
  const idx = t.toLowerCase().indexOf("updated:");
  if (idx === -1) return null;

  const before = t.slice(0, idx).trim();
  // take last 2-digit in this substring
  const matches = before.match(/\b\d{2}\b/g);
  if (!matches || !matches.length) return null;
  return matches[matches.length - 1]; // ✅ usually 81
}

/**
 * Find card block containing time label like "12:01" or "16:30"
 * and parse num/set/value from that block.
 */
function extractCardByTime($, timeLabel) {
  let block = null;
  $("div").each((_, el) => {
    const txt = $(el).text();
    if (txt && txt.includes(timeLabel)) block = $(el);
  });
  if (!block) return null;

  const text = cleanText(block.text());
  const nums = text.match(/\b\d{2}\b/g);
  const num = nums ? nums[nums.length - 1] : null; // safer: last 2-digit inside block
  const set = text.match(/SET\s*([\d,.]+)/i)?.[1] || null;
  const value = text.match(/VALUE\s*([\d,.]+)/i)?.[1] || null;

  return { num, set, value };
}

/* =====================
   🌐 MAIN FETCH
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
    const pageText = cleanText($("body").text());

    // ✅ Live Big 2D (81)
    const liveNum = extractLiveBig2D(pageText);

    // ✅ Morning/Evening cards for SET/VALUE + Final detection
    const morningCard = extractCardByTime($, "12:01"); // Morning final card block
    const eveningCard = extractCardByTime($, "16:30"); // Evening final card block

    // For LIVE set/value: use corresponding card (they can change during live as you said)
    const morningLiveSet = morningCard?.set || null;
    const morningLiveValue = morningCard?.value || null;

    const eveningLiveSet = eveningCard?.set || null;
    const eveningLiveValue = eveningCard?.value || null;

    // ===== MORNING =====
    if (isMorning() && !finalMorningDone) {
      // Final morning: when 12:01 card has num+set+value
      if (morningCard?.num && morningCard?.set && morningCard?.value) {
        // If you want FINAL to trigger only near end, keep as is.
        // This is safest: when card is fully populated.
        finalMorningDone = true;
        await postFinal("morning", morningCard.num, morningCard.set, morningCard.value);
      } else if (liveNum) {
        const key = `${liveNum}|${morningLiveSet || "-"}|${morningLiveValue || "-"}`;
        if (key !== lastMorningLiveKey) {
          lastMorningLiveKey = key;
          await postLive("morning", liveNum, morningLiveSet, morningLiveValue);
        }
      }
    }

    // ===== EVENING =====
    if (isEvening() && !finalEveningDone) {
      if (eveningCard?.num && eveningCard?.set && eveningCard?.value && eveningCard.num !== "--") {
        finalEveningDone = true;
        await postFinal("evening", eveningCard.num, eveningCard.set, eveningCard.value);
      } else if (liveNum) {
        const key = `${liveNum}|${eveningLiveSet || "-"}|${eveningLiveValue || "-"}`;
        if (key !== lastEveningLiveKey) {
          lastEveningLiveKey = key;
          await postLive("evening", liveNum, eveningLiveSet, eveningLiveValue);
        }
      }
    }

  } catch (e) {
    console.error("Scrape error:", e.message);
  }
}

// ===== LOOP (30s) =====
setInterval(fetch2D, 30 * 1000);

/* =====================
   🌐 HTTP SERVER (Webhook Receiver)
   ===================== */
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
