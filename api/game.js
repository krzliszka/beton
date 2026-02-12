// Vercel Serverless Function - Game API (Clouds & Hero of the Day)
import fetch from 'node-fetch';

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

// Redis helper
async function redis(command, ...args) {
  const encodedArgs = args.map(a => encodeURIComponent(a));
  const response = await fetch(`${REDIS_URL}/${command}/${encodedArgs.join('/')}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  const data = await response.json();
  return data.result;
}

// Participants list (must match HTML participant-name!)
const PARTICIPANTS = [
  'Rajmund','Krzysiek','Dzonson','Asia','Zuza','Tommy G',
  'Łukasz','G','Bartek','Tomek','Stefka','Julka',
  'Natalia','Emilka','Olaf','Benek','Dybi','Zabs0n',
  'Maćko','Turkish Hairlines','Mati','Kuba'
];

function getToday() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
}

function isValidParticipant(name) {
  return PARTICIPANTS.includes(name);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Support action from query string OR from body
  let action = req.query.action;
  if (!action && req.body && req.body.action) {
    action = req.body.action;
  }

  try {
    switch (action) {
      case 'voteHero':
        return await voteHero(req, res);
      case 'stats':
        return await getStats(req, res);
      default:
        return res.status(400).json({ error: 'Nieznana akcja. Użyj: voteHero, stats' });
    }
  } catch (err) {
    console.error('Game API error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// 🏆 VOTE HERO
async function voteHero(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Użyj POST' });

  const { from, hero } = req.body || {};

  if (!from || !hero) return res.status(400).json({ error: 'Podaj from i hero' });
  if (!isValidParticipant(from)) return res.status(400).json({ error: `Nieznany uczestnik: ${from}` });
  if (!isValidParticipant(hero)) return res.status(400).json({ error: `Nieznany uczestnik: ${hero}` });
  if (from === hero) return res.status(400).json({ error: 'Nie możesz głosować na siebie!' });

  const today = getToday();
  const voteKey = `hero:vote:${from}:${today}`;

  const existingVote = await redis('GET', voteKey);
  if (existingVote) {
    return res.status(400).json({
      error: `Już głosowałeś dzisiaj! Twój głos: ${existingVote}`,
      voted_for: existingVote
    });
  }

  await redis('SET', voteKey, hero, 'EX', '172800');
  await redis('INCR', `hero:count:${today}:${hero}`);
  await redis('SADD', `hero:voters:${today}`, from);

  return res.status(200).json({
    success: true,
    message: `🏆 ${from} głosuje na ${hero} jako Hero of the Day!`
  });
}

// 📊 GET STATS
async function getStats(req, res) {
  const today = getToday();
  const from = req.query.from || null;

  // --- HERO TODAY ---
  const heroToday = {};
  for (const p of PARTICIPANTS) {
    const count = await redis('GET', `hero:count:${today}:${p}`);
    if (count && parseInt(count) > 0) {
      heroToday[p] = parseInt(count);
    }
  }

  // --- MY VOTE ---
  let myVote = null;
  if (from && isValidParticipant(from)) {
    myVote = await redis('GET', `hero:vote:${from}:${today}`);
  }

  // --- ALL-TIME HERO TROPHIES ---
  const heroTrophies = {};
  const heroHistory = [];

  for (let i = 1; i <= 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

    // Collect all votes for the day
    const dayVotes = {};
    let dayBestVotes = 0;

    for (const p of PARTICIPANTS) {
      const count = await redis('GET', `hero:count:${dateStr}:${p}`);
      const votes = parseInt(count) || 0;
      if (votes > 0) {
        dayVotes[p] = votes;
        if (votes > dayBestVotes) dayBestVotes = votes;
      }
    }

    if (dayBestVotes > 0) {
      // Find ALL winners (tied for first place)
      const winners = Object.entries(dayVotes)
        .filter(([_, v]) => v === dayBestVotes)
        .map(([name]) => name);

      // Each winner gets a trophy
      winners.forEach(w => {
        heroTrophies[w] = (heroTrophies[w] || 0) + 1;
      });

      // Total votes that day (for history display)
      const totalVotes = Object.values(dayVotes).reduce((a, b) => a + b, 0);

      heroHistory.push({
        date: dateStr,
        winner: winners.join(', '),
        votes: dayBestVotes,
        totalVotes: totalVotes
      });
    }
  }

  return res.status(200).json({
    date: today,
    hero: {
      today: heroToday,
      myVote: myVote,
      trophies: heroTrophies,
      history: heroHistory
    }
  });
}
