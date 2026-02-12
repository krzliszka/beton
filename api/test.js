// Vercel Serverless Function - Simple Test
import { saveParticipant, getAllParticipants, isRedisAvailable } from './redis.js';

export default async function handler(req, res) {
  // Test Redis write/read
  let redisTest = 'not tested';
  if (isRedisAvailable()) {
    try {
      // Try to save test participant
      const testParticipant = {
        strava_id: 99999999,
        name: "Test User",
        display_name: "Test",
        refresh_token: "test_token",
        added_at: new Date().toISOString()
      };
      
      await saveParticipant(testParticipant);
      
      // Try to read all participants
      const participants = await getAllParticipants();
      
      redisTest = {
        write: '✅ success',
        read: '✅ success',
        count: participants.length,
        participants: participants
      };
    } catch (err) {
      redisTest = {
        error: err.message,
        stack: err.stack
      };
    }
  } else {
    redisTest = '❌ Redis not available';
  }

  // Find Redis-related env vars
  const redisVars = Object.keys(process.env)
    .filter(k => k.includes('KV') || k.includes('UPSTASH') || k.includes('REDIS'))
    .map(k => `${k} = ${process.env[k] ? '✅ set (' + process.env[k].substring(0, 20) + '...)' : '❌ empty'}`);

  return res.status(200).json({ 
    message: 'Vercel API działa!',
    version: 'v5-redis-test',
    redis_available: isRedisAvailable(),
    redis_test: redisTest,
    redis_env_vars: redisVars,
    timestamp: new Date().toISOString() 
  });
}
