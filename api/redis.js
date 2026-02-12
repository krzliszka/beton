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
  // Get all participant IDs
  const ids = await redis('SMEMBERS', 'participants:ids');
  
  if (!ids || ids.length === 0) {
    return [];
  }

  // Fetch all participant data
  const participants = [];
  for (const id of ids) {
    const participant = await getParticipant(id);
    if (participant) {
      participants.push(participant);
    }
  }

  return participants;
}

// Check if Redis is available
export function isRedisAvailable() {
  return !!(REDIS_URL && REDIS_TOKEN);
}
