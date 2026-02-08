/**
 * Thai 2D Hybrid Auto Bot
 * Source: https://www.thaistock2d.com/
 * Hosting: Render Free Web Service
 */

const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const cheerio = require("cheerio");
const http = require("http");

// ===== BOT INIT =====
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const ADMIN_ID = Number(process.env.ADMIN_ID);
const CHANNEL_ID = process.env.CHANNEL_ID;

// ===== STATE =====
let users = new Set();
let history = [];

let morningResult = null;
let eveningResult = null;
let lastScrapeErrorAt = 0;

// ===== UTIL FUNCTIONS =====
function saveHistory(time, result) {
  history.unshift({
    time,
    result,
    date: new Date().toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok"
    })
  });
  if (history.length > 20) history.pop();
}

function genSet(num) {
  let arr = [];
  for (let i = 0; i <= 9; i++) arr.push(`${num}${i}`);
  return arr.join(" ");
}

function genFormula(num) {
  return num.split("").reverse().join("");
}

function genPower(num) {
  return [...new Set(num.split(""))].join(" ");
}

function postAll(text) {
  // notify users
  users.forEach(id => {
    bot.sendMessage(id, text).catch(() => {});
  });

  // post to channel
  bot.sendMessage(CHANNEL_ID, text).catch(() => {});
}

// ===== BOT COMMANDS =====
bot.onText(/\/start/, msg => {
  users.add(msg.chat.id);
  bot.sendMessage(
    msg.chat.id,
`🎯 Thai 2D Hybrid Auto Bot

⏰ Market Time
🌅 Morning : 11:30
🌆 Evening : 16:30

✅ Auto scrape
✅ Auto SET / Formula / Power
❌ Manual မလို`
  );
});

bot.onText(/\/2d/, msg => {
  bot.sendMessage(
    msg.chat.id,
`📊 Latest Thai 2D

🌅 Morning : ${morningResult ?? "❌"}
🌆 Evening : ${eveningResult ?? "❌"}`
  );
});

bot.onText(/\/history/, msg => {
  if (!history.length)
    return bot.sendMessage(msg.chat.id, "📊 No history yet");

  let text = "📜 Thai 2D History\n\n";
  history.forEach((h, i) => {
    text += `${i + 1}. ${h.time} → ${h.result} (${h.date})\n`;
  });
  bot.sendMessage(msg.chat.id, text);
});

// ===== CORE: SCRAPE thaistock2d.com =====
async function fetchThai2D() {
  try {
    const url = "https://www.thaistock2d.com/";

    const res = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8"
      }
    });

    const $ = cheerio.load(res.data);

    // thaistock2d live result selectors
    const results = [];
    $(".live-result .number").each((i, el) => {
      const num = $(el).text().trim();
      if (/^\d{2}$/.test(num)) results.push(num);
    });

    const scrapedMorning = results[0] || null;
    const scrapedEvening = results[1] || null;

    const now = new Date().toLocaleTimeString("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit"
    });

    // ===== MORNING =====
    if (scrapedMorning && scrapedMorning !== morningResult) {
      morningResult = scrapedMorning;
      saveHistory("Morning", morningResult);

      postAll(
`🌅 Thai 2D Morning Result
⏰ ${now}
🎯 ${morningResult}

🧮 SET
${genSet(morningResult)}

🔢 Formula
${genFormula(morningResult)}

⚡ Power
${genPower(morningResult)}`
      );
    }

    // ===== EVENING =====
    if (scrapedEvening && scrapedEvening !== eveningResult) {
      eveningResult = scrapedEvening;
      saveHistory("Evening", eveningResult);

      postAll(
`🌆 Thai 2D Evening Result

⏰ ${now}

🎯 ${eveningResult}

🧮 SET
${genSet(eveningResult)}

🔢 Formula
${genFormula(eveningResult)}

⚡ Power
${genPower(eveningResult)}`
      );
    }

  } catch (err) {
    const t = Date.now();
    if (t - lastScrapeErrorAt > 120000) {
      lastScrapeErrorAt = t;
      console.log("thaistock2d scrape error:", err.message);
    }
  }
}

// ===== AUTO CHECK EVERY 30s =====
setInterval(fetchThai2D, 30 * 1000);

// ===== KEEP ALIVE (Render Free) =====
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Thai 2D Bot is running");
}).listen(process.env.PORT || 3000);
