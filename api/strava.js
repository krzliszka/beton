// Vercel Serverless Function - Strava Rankings API v2 with Redis
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { getAllParticipants, isRedisAvailable } from './redis.js';

export default async function handler(req, res) {
  const { action = 'rankings' } = req.query;

  // Load config from file (for segments and settings)
  let config;
  try {
    const configPath = path.join(process.cwd(), 'api', 'config.public.json');
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    return res.status(500).json({ 
      error: 'Brak pliku config.public.json',
      hint: 'Utwórz api/config.public.json z segmentami i ustawieniami'
    });
  }

  // Add Strava credentials from env vars
  config.strava_app = {
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET
  };

  // Load participants from Redis (if available) or config.json
  let participants;
  if (isRedisAvailable()) {
    try {
      participants = await getAllParticipants();
      console.log(`✅ Loaded ${participants.length} participants from Redis`);
    } catch (err) {
      console.error('Redis read error:', err);
      // Fallback to config.json
      participants = config.participants || [];
    }
  } else {
    participants = config.participants || [];
  }

  // Add participants to config object for compatibility
  config.participants = participants;

  switch (action) {
    case 'rankings':
      return await getRankings(req, res, config);
    case 'segments':
      return res.status(200).json(config.segments);
    case 'participants':
      return res.status(200).json(participants.map(p => ({
        name: p.display_name,
        strava_id: p.strava_id
      })));
    default:
      return res.status(404).json({ error: 'Nieznana akcja' });
  }
}

// === Main Rankings Function ===
async function getRankings(req, res, config) {
  const cacheFile = path.join('/tmp', 'cache_rankings.json');
  const cacheTTL = config.settings.cache_ttl_minutes * 60 * 1000;

  // Check cache
  try {
    if (fs.existsSync(cacheFile)) {
      const stats = fs.statSync(cacheFile);
      const age = Date.now() - stats.mtimeMs;
      
      if (age < cacheTTL) {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        return res.status(200).json(cached);
      }
    }
  } catch (err) {
    console.log('Cache read error:', err);
  }

  // Fetch fresh data
  const results = [];

  for (const participant of config.participants) {
    const participantResults = {
      name: participant.display_name,
      strava_id: participant.strava_id,
      segments: [],
      totals: {
        general: 0,
        gory: 0,
        sprint: 0,
        general_points: 0,
        gory_points: 0,
        sprint_points: 0
      }
    };

    // Refresh token
    const accessToken = await refreshToken(participant.refresh_token, config);
    if (!accessToken) {
      console.error(`Failed to refresh token for ${participant.name}`);
      continue;
    }

    // Fetch segment results
    for (const segment of config.segments) {
      const segmentResult = await getSegmentResult(
        accessToken, 
        segment, 
        participant.strava_id, 
        config
      );

      if (segmentResult) {
        participantResults.segments.push(segmentResult);

        // Add to totals
        const time = segmentResult.time;
        const points = segmentResult.points;

        participantResults.totals.general += time;
        participantResults.totals.general_points += points;

        if (segment.type === 'GORY') {
          participantResults.totals.gory += time;
          participantResults.totals.gory_points += points;
        } else if (segment.type === 'SPRINT') {
          participantResults.totals.sprint += time;
          participantResults.totals.sprint_points += points;
        }
      }
    }

    results.push(participantResults);
  }

  // Create rankings
  const rankings = {
    general: sortByTime(results, 'general'),
    gory: sortByTime(filterByType(results, 'GORY'), 'gory'),
    sprint: sortByTime(filterByType(results, 'SPRINT'), 'sprint'),
    updated_at: new Date().toISOString()
  };

  // Save cache
  try {
    fs.writeFileSync(cacheFile, JSON.stringify(rankings, null, 2));
  } catch (err) {
    console.log('Cache write error:', err);
  }

  return res.status(200).json(rankings);
}

// === Get segment result for participant ===
async function getSegmentResult(accessToken, segment, athleteId, config) {
  const segmentId = segment.id;
  const { start, end } = config.settings.date_range;

  const url = `https://www.strava.com/api/v3/segments/${segmentId}/all_efforts?` + new URLSearchParams({
    athlete_id: athleteId,
    start_date_local: start,
    end_date_local: end,
    per_page: 200
  });

  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      console.error(`Segment ${segmentId} fetch failed:`, response.status);
      return null;
    }

    const efforts = await response.json();
    if (!efforts || efforts.length === 0) {
      return null;
    }

    // Find best effort
    const bestEffort = efforts.reduce((best, current) => 
      !best || current.elapsed_time < best.elapsed_time ? current : best
    );

    // Calculate points
    const time = bestEffort.elapsed_time;
    const basePoints = 1000;
    const multiplier = segment.multiplier || 1.0;
    const points = Math.round((basePoints * multiplier / time) * 100) / 100;

    return {
      segment_id: segmentId,
      segment_name: segment.name,
      time: time,
      points: points,
      date: bestEffort.start_date_local,
      effort_id: bestEffort.id
    };

  } catch (err) {
    console.error(`Error fetching segment ${segmentId}:`, err);
    return null;
  }
}

// === Refresh access token ===
async function refreshToken(refreshToken, config) {
  try {
    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.strava_app.client_id,
        client_secret: config.strava_app.client_secret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (response.ok) {
      const data = await response.json();
      return data.access_token;
    }
    
    return null;
  } catch (err) {
    console.error('Token refresh error:', err);
    return null;
  }
}

// === Helper functions ===
function sortByTime(results, category) {
  return results
    .filter(r => r.totals[category] > 0)
    .map(r => ({
      name: r.name,
      strava_id: r.strava_id,
      time: r.totals[category],
      points: r.totals[category + '_points'],
      segments_count: r.segments.length
    }))
    .sort((a, b) => a.time - b.time);
}

function filterByType(results, type) {
  return results.map(r => ({
    ...r,
    segments: r.segments.filter(s => s.segment_name.includes(type))
  })).filter(r => r.segments.length > 0);
}
