require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const ADMIN_ID = Number(process.env.ADMIN_ID);
const CHANNEL_ID = process.env.CHANNEL_ID;

let users = new Set();
let history = [];

let morningResult = null;
let eveningResult = null;

// ===== UTIL =====
function saveHistory(time, result) {
  history.unshift({
    time,
    result,
    date: new Date().toLocaleString("th-TH")
  });
  if (history.length > 20) history.pop();
}

function postAll(text) {
  // notify users
  users.forEach(id => {
    bot.sendMessage(id, text).catch(() => {});
  });

  // post to single channel
  bot.sendMessage(CHANNEL_ID, text).catch(() => {});
}

// ===== START =====
bot.onText(/\/start/, msg => {
  users.add(msg.chat.id);
  bot.sendMessage(
    msg.chat.id,
`🎯 Thai 2D Auto Bot

⏰ Market Time
🌅 Morning : 11:30
🌆 Evening : 16:30

🔔 Result ထွက်တာနဲ့ auto ပို့ပေးပါမယ်`
  );
});

// ===== RESULT =====
bot.onText(/\/2d/, msg => {
  bot.sendMessage(
    msg.chat.id,
`📊 Thai 2D Latest
🌅 Morning : ${morningResult ?? "❌"}
🌆 Evening : ${eveningResult ?? "❌"}`
  );
});

// ===== HISTORY =====
bot.onText(/\/history/, msg => {
  if (!history.length)
    return bot.sendMessage(msg.chat.id, "📊 No history yet");

  let text = "📜 Thai 2D History\n\n";
  history.forEach((h, i) => {
    text += `${i + 1}. ${h.time} → ${h.result} (${h.date})\n`;
  });

  bot.sendMessage(msg.chat.id, text);
});

// ===== ADMIN MANUAL SET =====
bot.onText(/\/set (morning|evening) (\d{2})/, (msg, m) => {
  if (msg.from.id !== ADMIN_ID) return;

  const time = m[1];
  const num = m[2];

  if (time === "morning") morningResult = num;
  if (time === "evening") eveningResult = num;

  saveHistory(time.toUpperCase(), num);

  postAll(
`🎉 Thai 2D ${time.toUpperCase()} Result
🎯 ${num}`
  );
});

// ===== AUTO FETCH (REAL API READY) =====
async function fetchThai2D() {
  try {
    // 🔁 Replace with real Thai 2D API if you have
    const res = await axios.get("https://example.com/thai2d.json");

    const now = new Date().toLocaleTimeString("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit"
    });

    // 🌅 Morning
    if (res.data.morning && res.data.morning !== morningResult) {
      morningResult = res.data.morning;
      saveHistory("Morning", morningResult);

      postAll(
`🌅 Thai 2D Morning Result
⏰ ${now}
🎯 ${morningResult}`
      );
    }

    // 🌆 Evening
    if (res.data.evening && res.data.evening !== eveningResult) {
      eveningResult = res.data.evening;
      saveHistory("Evening", eveningResult);

      postAll(
`🌆 Thai 2D Evening Result
⏰ ${now}
🎯 ${eveningResult}`
      );
    }

  } catch (err) {
    console.log("API fetch error");
  }
}

// ===== 30 SECONDS CHECK =====
setInterval(fetchThai2D, 30 * 1000);
