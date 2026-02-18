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
  'Łukasz','Bartek','Tomek','Stefka','Julka',
  'Natalia','Emilka','Olaf','Benek','Dybi','Zabs0n',
  'Maćko','Kuba'
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

  if (from === 'Stefka') {
    return res.status(403).json({ error: 'DZIECI I RYBY....' });
  }

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

  // Aktualizuj ranking po głosie
  await updateHeroRanking(today);

  return res.status(200).json({
    success: true,
    message: `🏆 ${from} głosuje na ${hero} jako Hero of the Day!`
  });
}

// 📊 GET STATS
async function getStats(req, res) {
  const now = Date.now();
  if (statsCache.data && (now - statsCache.timestamp < CACHE_TTL)) {
    return res.status(200).json(statsCache.data);
  }
  const today = getToday();
  const from = req.query.from || null;
  // --- HERO TODAY ---
  let heroToday = {};
  let heroRanking = [];
  const rankingRaw = await redis('GET', `hero:ranking:${today}`);
  if (rankingRaw) {
    try {
      heroRanking = JSON.parse(rankingRaw);
      heroRanking.forEach(([name, count]) => { heroToday[name] = count; });
    } catch {}
  }
  // --- CLOUD RANKING ---
  let cloudToday = {};
  let cloudRanking = [];
  const cloudRankingRaw = await redis('GET', `cloud:ranking:${today}`);
  if (cloudRankingRaw) {
    try {
      cloudRanking = JSON.parse(cloudRankingRaw);
      cloudRanking.forEach(([name, count]) => { cloudToday[name] = count; });
    } catch {}
  }
  // --- SPIOCH RANKING ---
  let spiochToday = {};
  let spiochRanking = [];
  const spiochRankingRaw = await redis('GET', `spioch:ranking:${today}`);
  if (spiochRankingRaw) {
    try {
      spiochRanking = JSON.parse(spiochRankingRaw);
      spiochRanking.forEach(([name, count]) => { spiochToday[name] = count; });
    } catch {}
  }
  // --- MY VOTE ---
  let myVote = null;
  if (from && isValidParticipant(from)) {
    myVote = await redis('GET', `hero:vote:${from}:${today}`);
  }
  // --- ALL-TIME HERO TROPHIES & HISTORY (ograniczone do 15 dni, jak poprzednio) ---
  const heroTrophies = {};
  const heroHistory = [];
  const MAX_STATS_DAYS = 15;
  for (let i = 1; i <= MAX_STATS_DAYS; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
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
      const winners = Object.entries(dayVotes)
        .filter(([_, v]) => v === dayBestVotes)
        .map(([name]) => name);
      winners.forEach(w => {
        heroTrophies[w] = (heroTrophies[w] || 0) + 1;
      });
      const totalVotes = Object.values(dayVotes).reduce((a, b) => a + b, 0);
      heroHistory.push({
        date: dateStr,
        winner: winners.join(', '),
        votes: dayBestVotes,
        totalVotes: totalVotes
      });
    }
  }
  const statsData = {
    date: today,
    hero: {
      today: heroToday,
      ranking: heroRanking,
      myVote: myVote,
      trophies: heroTrophies,
      history: heroHistory
    },
    clouds: {
      today: cloudToday,
      ranking: cloudRanking
    },
    spioch: {
      today: spiochToday,
      ranking: spiochRanking
    }
  };
  statsCache.data = statsData;
  statsCache.timestamp = Date.now();
  return res.status(200).json(statsData);
}

// --- CACHE SETUP ---
const statsCache = {
  data: null,
  timestamp: 0
};
const CACHE_TTL = 5 * 60 * 1000; // 5 minut

// --- AGREGACJA I CZYSZCZENIE RANKINGÓW HERO, CHMURKI, SPIOCH ---
async function updateHeroRanking(today) {
  const heroToday = {};
  for (const p of PARTICIPANTS) {
    const count = await redis('GET', `hero:count:${today}:${p}`);
    if (count && parseInt(count) > 0) {
      heroToday[p] = parseInt(count);
    }
  }
  const sorted = Object.entries(heroToday).sort((a,b) => b[1]-a[1]).slice(0, 10);
  // 30 dni = 2592000 sekund
  await redis('SET', `hero:ranking:${today}`, JSON.stringify(sorted), 'EX', '2592000');
}

async function updateCloudRanking(today) {
  // Załóżmy, że chmurki są w Redis jako cloud:count:{today}:{name}
  const cloudToday = {};
  for (const p of PARTICIPANTS) {
    const count = await redis('GET', `cloud:count:${today}:${p}`);
    if (count && parseInt(count) > 0) {
      cloudToday[p] = parseInt(count);
    }
  }
  const sorted = Object.entries(cloudToday).sort((a,b) => b[1]-a[1]).slice(0, 10);
  await redis('SET', `cloud:ranking:${today}`, JSON.stringify(sorted), 'EX', '2592000');
}

async function updateSpiochRanking(today) {
  // Załóżmy, że spiochy są w Redis jako spioch:count:{today}:{name}
  const spiochToday = {};
  for (const p of PARTICIPANTS) {
    const count = await redis('GET', `spioch:count:${today}:${p}`);
    if (count && parseInt(count) > 0) {
      spiochToday[p] = parseInt(count);
    }
  }
  const sorted = Object.entries(spiochToday).sort((a,b) => b[1]-a[1]).slice(0, 10);
  await redis('SET', `spioch:ranking:${today}`, JSON.stringify(sorted), 'EX', '2592000');
}
