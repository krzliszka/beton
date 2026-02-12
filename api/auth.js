// Vercel Serverless Function - OAuth Callback
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  const { code, error } = req.query;

  // Load config from environment variables or file
  let config;
  let configPath = null;
  
  if (process.env.STRAVA_CLIENT_ID) {
    config = {
      strava_app: {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET
      },
      participants: []
    };
  } else {
    try {
      configPath = path.join(process.cwd(), 'api', 'config.json');
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      return res.status(500).json({ 
        error: 'Brak konfiguracji. Ustaw STRAVA_CLIENT_ID i STRAVA_CLIENT_SECRET w Vercel.'
      });
    }
  }

  // Error handling
  if (error) {
    return res.status(400).send(errorPage('Dostęp został odmówiony. Spróbuj ponownie.'));
  }

  // No code - show auth instructions
  if (!code) {
    const clientId = config.strava_app.client_id;
    const redirectUri = `https://${req.headers.host}/api/auth`;
    
    const authUrl = `https://www.strava.com/oauth/authorize?` + new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      approval_prompt: 'auto',
      scope: 'read,activity:read'
    });

    return res.status(200).send(instructionsPage(authUrl));
  }

  // Exchange code for tokens
  try {
    const redirectUri = `https://${req.headers.host}/api/auth`;
    const tokenData = await exchangeCodeForTokens(code, config, redirectUri);
    if (!tokenData) {
      return res.status(400).send(errorPage('Nie udało się pobrać tokenów.'));
    }

    // Get user profile
    const userProfile = await getUserProfile(tokenData.access_token);
    if (!userProfile) {
      return res.status(400).send(errorPage('Nie udało się pobrać profilu użytkownika.'));
    }

    // Add participant to config
    const participant = {
      strava_id: userProfile.id,
      name: `${userProfile.firstname} ${userProfile.lastname}`,
      display_name: userProfile.firstname,
      refresh_token: tokenData.refresh_token,
      added_at: new Date().toISOString()
    };

    // Check if exists
    const existingIndex = config.participants.findIndex(p => p.strava_id === userProfile.id);
    
    if (existingIndex >= 0) {
      config.participants[existingIndex] = participant;
    } else {
      config.participants.push(participant);
    }

    // Save config - only works with local config.json
    if (configPath) {
      try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      } catch (writeErr) {
        console.warn('Cannot save config (Vercel filesystem is read-only):', writeErr.message);
      }
    }

    return res.status(200).send(successPage(userProfile, participant));

  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).send(errorPage('Wystąpił błąd podczas autoryzacji.'));
  }
}

// === Helper Functions ===

async function exchangeCodeForTokens(code, config, redirectUri) {
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.strava_app.client_id,
      client_secret: config.strava_app.client_secret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    })
  });

  if (response.ok) {
    return await response.json();
  }
  
  // Log error for debugging
  const errorText = await response.text();
  console.error('Strava token exchange failed:', response.status, errorText);
  return null;
}

async function getUserProfile(accessToken) {
  const response = await fetch('https://www.strava.com/api/v3/athlete', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (response.ok) {
    return await response.json();
  }
  return null;
}

// === HTML Pages ===

function instructionsPage(authUrl) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Autoryzacja Strava - #BETON</title>
  <style>
    body { 
      background: #1a1a1a; 
      color: #fff; 
      font-family: 'Space Mono', monospace; 
      text-align: center; 
      padding: 50px;
      margin: 0;
    }
    .container { max-width: 600px; margin: 0 auto; }
    h1 { color: #006633; font-size: 3rem; margin-bottom: 1rem; }
    p { font-size: 1.1rem; line-height: 1.6; }
    .btn { 
      background: #006633; 
      color: white; 
      padding: 15px 40px; 
      text-decoration: none; 
      font-size: 18px; 
      border-radius: 8px;
      display: inline-block;
      margin: 30px 0;
      transition: all 0.3s;
    }
    .btn:hover { background: #004422; transform: translateY(-2px); }
  </style>
</head>
<body>
  <div class='container'>
    <h1>#BETON</h1>
    <h2>Rywalizacja Rowerowa</h2>
    <p>Aby dołączyć do rywalizacji, połącz swoje konto Strava.</p>
    <a href='${authUrl}' class='btn'>🚴 Połącz ze Stravą</a>
    <p><small>Aplikacja pobierze tylko dostęp do odczytu Twoich aktywności.</small></p>
  </div>
</body>
</html>`;
}

function successPage(userProfile, participant) {
  const participantJson = JSON.stringify(participant, null, 2);
  
  return `<!DOCTYPE html>
<html>
<head>
  <title>Sukces! - #BETON</title>
  <style>
    body { 
      background: #1a1a1a; 
      color: #fff; 
      font-family: 'Space Mono', monospace; 
      text-align: center; 
      padding: 50px;
      margin: 0;
    }
    .container { max-width: 700px; margin: 0 auto; }
    .success { color: #00ff88; font-size: 2rem; margin: 20px 0; }
    h1 { color: #006633; }
    .code-box {
      background: #2a2a2a;
      border: 1px solid #006633;
      border-radius: 8px;
      padding: 15px;
      margin: 20px 0;
      text-align: left;
      overflow-x: auto;
    }
    pre { margin: 0; font-size: 0.9rem; color: #00ff88; }
    .note { color: #888; font-size: 0.9rem; margin-top: 20px; }
  </style>
</head>
<body>
  <div class='container'>
    <h1>✅ Połączono!</h1>
    <div class='success'>Witaj, ${userProfile.firstname}!</div>
    <p>Twoje konto Strava zostało połączone z rywalizacją #BETON.</p>
    
    <h3>📋 Dodaj do api/config.json:</h3>
    <div class='code-box'>
      <pre>${participantJson}</pre>
    </div>
    
    <p class='note'>Skopiuj powyższy JSON i dodaj do tablicy "participants" w pliku api/config.json</p>
    <p><a href='/' style='color: #006633;'>← Wróć do strony głównej</a></p>
  </div>
</body>
</html>`;
}

function errorPage(message) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Błąd - #BETON</title>
  <style>
    body { 
      background: #1a1a1a; 
      color: #fff; 
      font-family: 'Space Mono', monospace; 
      text-align: center; 
      padding: 50px;
      margin: 0;
    }
    .container { max-width: 600px; margin: 0 auto; }
    .error { color: #ff4444; font-size: 1.5rem; margin: 20px 0; }
  </style>
</head>
<body>
  <div class='container'>
    <h1>❌ Błąd</h1>
    <div class='error'>${message}</div>
    <p><a href='/api/auth' style='color: #006633;'>← Spróbuj ponownie</a></p>
  </div>
</body>
</html>`;
}
