import Redis from 'ioredis';

let redis = null;

function createRedisClient() {
  const url = process.env.REDIS_URL || '';
  console.log('Connecting to Redis...');
  
  try {
    // Upstash 需要 SSL
    if (url.includes('upstash.io')) {
      redis = new Redis(url, {
        tls: { rejectUnauthorized: false },
        connectTimeout: 5000,
        commandTimeout: 5000,
        maxRetriesPerRequest: 1
      });
    } else {
      redis = new Redis(url);
    }
    
    redis.on('error', (err) => {
      console.error('Redis error:', err.message);
      redis = null;
    });
    
    redis.on('connect', () => {
      console.log('Redis connected');
    });
    
    return redis;
  } catch (e) {
    console.error('Redis init failed:', e.message);
    return null;
  }
}

// 内存备用
let inMemoryData = { validPasswords: [], usedPasswords: [] };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // 延迟初始化 Redis
  if (!redis && process.env.REDIS_URL) {
    createRedisClient();
  }
  
  try {
    let data = inMemoryData;
    
    // 尝试从 Redis 读取
    if (redis) {
      try {
        const raw = await redis.get('passwords');
        if (raw) data = JSON.parse(raw);
      } catch (e) {
        console.error('Redis read error:', e.message);
      }
    }
    
    switch (req.method) {
      case 'GET':
        return res.status(200).json(data);
        
      case 'POST':
        const { action } = req.body;
        
        if (action === 'batchGenerate') {
          const { newPasswords } = req.body;
          data.validPasswords = [...data.validPasswords, ...(newPasswords || [])];
        } else if (action === 'addSingle') {
          const { password } = req.body;
          if (password && !data.validPasswords.includes(password)) {
            data.validPasswords.push(password);
          }
        } else if (action === 'markUsed') {
          const { password } = req.body;
          if (password && !data.usedPasswords.includes(password)) {
            data.usedPasswords.push(password);
          }
        } else if (action === 'resetUsed') {
          data.usedPasswords = [];
        } else if (action === 'clearAll') {
          data.validPasswords = [];
          data.usedPasswords = [];
        } else if (action === 'sync') {
          data.validPasswords = req.body.validPasswords || data.validPasswords;
          data.usedPasswords = req.body.usedPasswords || data.usedPasswords;
        }
        
        // 保存到 Redis
        if (redis) {
          try {
            await redis.set('passwords', JSON.stringify(data));
          } catch (e) {
            console.error('Redis write error:', e.message);
          }
        }
        inMemoryData = data;
        return res.status(200).json({ success: true, data });
        
      case 'DELETE':
        data = { validPasswords: [], usedPasswords: [] };
        if (redis) {
          try {
            await redis.set('passwords', JSON.stringify(data));
          } catch (e) {}
        }
        inMemoryData = data;
        return res.status(200).json({ success: true });
        
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('API error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}