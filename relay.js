// relay.js — Kick → Unreal Zoltar Prediction Relay
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require("cors");
const http = require('http');
const { createClient } = require('@retconned/kick-js');

const KICK_CHANNEL = 'scraplet';
const ZOLTAR_TRIGGER = '!zoltar give me a prediction';

const app = express();

// --- add near the top of relay.js ---
const crypto = require('crypto');
const axios = require('axios');

// capture raw body for signature verification
app.post('/kick-webhook',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
        try {
            // 1) verify signature
            const msgId = req.header('Kick-Event-Message-Id') || '';
            const ts = req.header('Kick-Event-Message-Timestamp') || '';
            const sigB64 = req.header('Kick-Event-Signature') || '';
            const eventType = req.header('Kick-Event-Type');

            // concatenate per docs: messageId.timestamp.rawBody
            const raw = req.body.toString('utf8');
            const payloadForSig = `${msgId}.${ts}.${raw}`;

            // fetch Kick public key (cache it in memory after first fetch)
            if (!global._kickPubKeyPem) {
                const { data } = await axios.get('https://api.kick.com/public/v1/public-key');
                global._kickPubKeyPem = data?.public_key || data || `
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq/+l1WnlRrGSolDMA+A8
6rAhMbQGmQ2SapVcGM3zq8ANXjnhDWocMqfWcTd95btDydITa10kDvHzw9WQOqp2
MZI7ZyrfzJuz5nhTPCiJwTwnEtWft7nV14BYRDHvlfqPUaZ+1KR4OCaO/wWIk/rQ
L/TjY0M70gse8rlBkbo2a8rKhu69RQTRsoaf4DVhDPEeSeI5jVrRDGAMGL3cGuyY
6CLKGdjVEM78g3JfYOvDU/RvfqD7L89TZ3iN94jrmWdGz34JNlEI5hqK8dd7C5EF
BEbZ5jgB8s8ReQV8H+MkuffjdAj3ajDDX3DOJMIut1lBrUVD1AaSrGCKHooWoL2e
twIDAQAB
-----END PUBLIC KEY-----`;
            }

            const verifier = crypto.createVerify('RSA-SHA256');
            verifier.update(payloadForSig);
            verifier.end();

            const ok = verifier.verify(global._kickPubKeyPem, Buffer.from(sigB64, 'base64'));
            if (!ok) {
                console.warn('Webhook signature verification failed');
                return res.status(401).send('bad signature');
            }

            // 2) process event
            const body = JSON.parse(raw);

            if (eventType === 'chat.message.sent') {
                const content = String(body?.content || '');
                const username = body?.sender?.username || 'unknown';
                if (content.toLowerCase().includes((process.env.ZOLTAR_TRIGGER || '!zoltar give me a prediction').toLowerCase())) {
                    latestPrediction = generatePrediction(username);
                    console.log(`🔮 (webhook) Prediction for ${username}: ${latestPrediction}`);
                }
            }

            // acknowledge
            return res.sendStatus(200);
        } catch (e) {
            console.error('Webhook error:', e?.message || e);
            return res.sendStatus(500);
        }
    }
);

app.use(bodyParser.json());

app.use(cors({
    origin: '*', // For development, allow all. You can lock this down later.
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));

//---------------------------------------------
// EXPRESS SERVER SETUP
//---------------------------------------------
const server = http.createServer(app);
server.listen(3030, () => {
    console.log('🟢 Relay server running at http://localhost:3030');
});

//---------------------------------------------
// UNREAL CUE SYSTEM
//---------------------------------------------
let latestCue = null;
const cueLog = [];

app.post('/cue', (req, res) => {
    console.log('[DEBUG] Incoming body:', req.body);

    const { cue, data } = req.body || {};
    if (!cue) {
        return res.status(400).send('Missing cue');
    }

    latestCue = { cue, data: data || {}, timestamp: Date.now() };
    cueLog.push(latestCue);

    console.log(`🎬 [Cue Received] ${cue}`, data);
    res.sendStatus(200);
});

app.get('/cue', (req, res) => {
    if (latestCue) {
        res.json(latestCue);
        latestCue = null;
    } else {
        res.status(204).send();
    }
});

app.get('/cue-log', (req, res) => {
    res.json(cueLog);
});


//---------------------------------------------
// ZOLTAR PREDICTIONS
//---------------------------------------------
let latestPrediction = null;

app.get('/zoltar', (req, res) => {
    if (latestPrediction) {
        res.json({ prediction: latestPrediction });
        latestPrediction = null;
    } else {
        res.status(204).send();
    }
});

function generatePrediction(user) {
    const options = [
        `${user}, you will soon outwit a great distraction.`,
        `Zoltar says: chaos leads to clarity, ${user}.`,
        `${user}, beware the quiet moments—they hold your fate.`,
        `A bold choice will pay off, ${user}. Trust it.`,
        `Laughter brings fortune to your doorstep, ${user}.`,
    ];
    return options[Math.floor(Math.random() * options.length)];
}

//---------------------------------------------
// KICK CHAT LISTENER
//---------------------------------------------
(async () => {
    const client = createClient(KICK_CHANNEL, { logger: true });

    try {
        await client.login({
            type: 'login',
            credentials: {
                username: process.env.KICK_USER,
                password: process.env.KICK_PASS,
                otp_secret: process.env.KICK_OTP_SECRET,
            },
        });

        client.on('ready', () => {
            console.log(`✅ Chat bot logged in as ${client.user?.username}`);
        });

        client.on('ChatMessage', (msg) => {
            const username = msg.sender.username;
            const content = msg.content;

            console.log(`[${username}]: ${content}`);

            if (content.toLowerCase().includes(ZOLTAR_TRIGGER.toLowerCase())) {
                latestPrediction = generatePrediction(username);
                console.log(`🔮 Prediction for ${username}: ${latestPrediction}`);
            }
        });
    } catch (err) {
        console.error('❌ Failed to connect to Kick:', err.message || err);
    }
})();
