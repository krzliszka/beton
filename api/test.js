// Vercel Serverless Function - Simple Test
export default async function handler(req, res) {
  // Find Redis-related env vars
  const redisVars = Object.keys(process.env)
    .filter(k => k.includes('KV') || k.includes('UPSTASH') || k.includes('REDIS'))
    .map(k => `${k} = ${process.env[k] ? '✅ set (' + process.env[k].substring(0, 20) + '...)' : '❌ empty'}`);

  return res.status(200).json({ 
    message: 'Vercel API działa!',
    version: 'v4-redis-debug',
    redis_env_vars: redisVars,
    timestamp: new Date().toISOString() 
  });
}
