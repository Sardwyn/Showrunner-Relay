
// kick-chat-watcher.js
require('dotenv').config();
const puppeteer = require('puppeteer');
const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');

//---------------------------------------------
// CONFIG
//---------------------------------------------
const KICK_CHANNEL = 'scraplet';
const LOGIN_URL = 'https://kick.com/login';
const CHANNEL_URL = `https://kick.com/${KICK_CHANNEL}`;
const TRIGGER = '!zoltar give me a prediction';

let latestPrediction = null;

//---------------------------------------------
// EXPRESS SERVER for Unreal
//---------------------------------------------
const app = express();
app.use(bodyParser.json());

app.get('/zoltar', (req, res) => {
  if (latestPrediction) {
    res.json({ prediction: latestPrediction });
    latestPrediction = null;
  } else {
    res.status(204).send();
  }
});

const server = http.createServer(app);
server.listen(8080, () => {
  console.log('🟢 Relay running at http://localhost:8080');
});

//---------------------------------------------
// Launch Puppeteer and Watch Chat
//---------------------------------------------
(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(LOGIN_URL);

  // Log in
  await page.type('input[name="username"]', process.env.KICK_USER);
  await page.type('input[name="password"]', process.env.KICK_PASS);
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  console.log('✅ Logged in');

  await page.goto(CHANNEL_URL, { waitUntil: 'networkidle2' });
  console.log('📺 Watching chat on channel:', KICK_CHANNEL);

  const seenMessages = new Set();

  setInterval(async () => {
    try {
      const messages = await page.$$eval('[data-chat-entry-message]', nodes =>
        nodes.map(n => ({
          username: n.querySelector('[data-chat-entry-username]')?.textContent.trim(),
          content: n.querySelector('[data-chat-entry-message-text]')?.textContent.trim(),
          id: n.getAttribute('data-id'),
        }))
      );

      for (const msg of messages) {
        if (msg && msg.id && !seenMessages.has(msg.id)) {
          seenMessages.add(msg.id);
          console.log(`[${msg.username}]: ${msg.content}`);

          if (msg.content.toLowerCase().includes(TRIGGER.toLowerCase())) {
            latestPrediction = generatePrediction(msg.username);
            console.log(`🔮 Prediction for ${msg.username}: ${latestPrediction}`);
          }
        }
      }
    } catch (err) {
      console.error('Chat read error:', err.message);
    }
  }, 3000);
})();

//---------------------------------------------
// Zoltar's Prophecy
//---------------------------------------------
function generatePrediction(user) {
  const predictions = [
    `${user}, chaos is your co-pilot today.`,
    `Zoltar sees great distractions—and great rewards ahead, ${user}.`,
    `Beware the muted mic, ${user}. Your moment approaches.`,
    `You will surprise even yourself soon, ${user}.`,
    `Fortune favors the brave... and the caffeinated, ${user}.`,
  ];
  return predictions[Math.floor(Math.random() * predictions.length)];
}
