// Vercel Serverless Function - Simple Test
export default async function handler(req, res) {
  return res.status(200).json({ 
    message: 'Vercel API działa!',
    version: 'v3-debug',
    timestamp: new Date().toISOString() 
  });
}
