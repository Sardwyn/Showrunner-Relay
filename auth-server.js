// auth-server.js — OAuth 2.1 (PKCE) for Kick (id.kick.com)
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const qs = require('qs');
const fs = require('fs');

const app = express();
const PORT = Number(process.env.AUTH_PORT || 3030);
const AUTHORIZE_URL = 'https://id.kick.com/oauth/authorize';
const TOKEN_URL = 'https://id.kick.com/oauth/token'; // also used for refresh
const SCOPE = process.env.KICK_OAUTH_SCOPE || 'events:subscribe';

const storeTokens = (t) => fs.writeFileSync('./tokens.json', JSON.stringify(t, null, 2));

const b64url = b => b.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const newVerifier = () => b64url(crypto.randomBytes(32));
const challenge = v => b64url(crypto.createHash('sha256').update(v).digest());

// Step 1: Redirect user to Kick login
app.get('/auth/kick/start', (_req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const verifier = newVerifier();
  const code_challenge = challenge(verifier);
  fs.writeFileSync('./pkce.json', JSON.stringify({ state, verifier }));

  const url = `${AUTHORIZE_URL}?response_type=code` +
    `&client_id=${encodeURIComponent(process.env.KICK_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPE)}` +
    `&state=${state}` +
    `&code_challenge=${code_challenge}` +
    `&code_challenge_method=S256`;

  res.redirect(url);
});

// Step 2: Callback -> token
app.get('/auth/kick/callback', async (req, res) => {
  const { code, state } = req.query;
  const pkce = JSON.parse(fs.readFileSync('./pkce.json', 'utf8'));
  if (!code || !state || state !== pkce.state) return res.status(400).send('Bad state/code');

  try {
    const { data } = await axios.post(
      TOKEN_URL,
      qs.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.KICK_CLIENT_ID,
        client_secret: process.env.KICK_CLIENT_SECRET,
        redirect_uri: process.env.REDIRECT_URI,
        code_verifier: pkce.verifier,
        code
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    storeTokens(data);
    res.send(`<h2>✅ Tokens saved.</h2><pre>${JSON.stringify(data, null, 2)}</pre>`);
  } catch (e) {
    console.error('Token exchange failed:', e?.response?.status, e?.response?.data || e?.message);
    res.status(500).send('OAuth failed');
  }
});

app.listen(PORT, () => console.log(`🟢 Auth server on http://localhost:${PORT}`));
