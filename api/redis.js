// Redis Helper Functions - Upstash REST API
import fetch from 'node-fetch';

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

// Execute Redis command via REST API
async function redis(command, ...args) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error('Redis not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.');
  }

  const response = await fetch(`${REDIS_URL}/${command}/${args.join('/')}`, {
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Redis error: ${error}`);
  }

  const data = await response.json();
  return data.result;
}

// Save participant to Redis
export async function saveParticipant(participant) {
  const key = `participant:${participant.strava_id}`;
  
  // Save participant data
  await redis('SET', key, JSON.stringify(participant));
  
  // Add to set of all participant IDs
  await redis('SADD', 'participants:ids', participant.strava_id);
  
  console.log(`✅ Saved participant ${participant.strava_id} to Redis`);
}

// Get single participant
export async function getParticipant(stravaId) {
  const key = `participant:${stravaId}`;
  const data = await redis('GET', key);
  return data ? JSON.parse(data) : null;
}

// Get all participants
export async function getAllParticipants() {
  if (cache.has('allParticipants')) {
    console.log('Using cached participants data');
    return cache.get('allParticipants');
  }

  // Get all participant IDs
  const ids = await redis('SMEMBERS', 'participants:ids');
  
  if (!ids || ids.length === 0) {
    return [];
  }

  // Use MGET to fetch all participant data in one call
  const keys = ids.map(id => `participant:${id}`);
  const data = await redis('MGET', ...keys);

  // Parse and filter non-null results
  const participants = data.map(item => (item ? JSON.parse(item) : null)).filter(Boolean);

  // Cache the result for 5 minutes
  cache.set('allParticipants', participants);
  setTimeout(() => cache.delete('allParticipants'), 5 * 60 * 1000);

  return participants;
}

// Check if Redis is available
export function isRedisAvailable() {
  return !!(REDIS_URL && REDIS_TOKEN);
}

// Add in-memory caching for frequently accessed data
const cache = new Map();
