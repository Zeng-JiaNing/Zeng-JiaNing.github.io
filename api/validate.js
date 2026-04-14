import Redis from 'ioredis';

function createRedisClient() {
  const url = process.env.REDIS_URL || '';
  
  // Upstash 需要 SSL
  if (url.includes('upstash.io')) {
    return new Redis(url, {
      tls: { rejectUnauthorized: false },
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      commandTimeout: 5000
    });
  }
  
  // Railway TCP Proxy 使用普通连接
  if (url.includes('railway.app') || url.includes('rlwy.net')) {
    return new Redis(url, {
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      commandTimeout: 5000
    });
  }
  
  // 默认使用 SSL
  if (url.startsWith('redis://')) {
    const sslUrl = url.replace('redis://', 'rediss://');
    return new Redis(sslUrl, {
      tls: { rejectUnauthorized: false },
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      commandTimeout: 5000
    });
  }
  
  return new Redis(url, {
    tls: { rejectUnauthorized: false },
    maxRetriesPerRequest: 3,
    connectTimeout: 10000,
    commandTimeout: 5000
  });
}

const redis = createRedisClient();

redis.on('error', (err) => {
  console.error('Redis错误:', err.message);
});

export default async function handler(req, res) {
  const { method, body } = req;
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { password } = body;
    
    if (!password) {
      return res.status(400).json({ valid: false, message: '请输入口令' });
    }
    
    let data = await redis.get('passwords');
    if (!data) {
      data = { validPasswords: [], usedPasswords: [] };
      await redis.set('passwords', JSON.stringify(data));
    } else {
      data = JSON.parse(data);
    }
    
    // 仅检查，不标记——标记操作在答完题后通过 /api/passwords 接口完成
    if (!data.validPasswords.includes(password)) {
      return res.status(200).json({ valid: false, message: '口令无效' });
    }
    
    if (data.usedPasswords.includes(password)) {
      return res.status(200).json({ valid: false, message: '口令已使用' });
    }
    
    // ⚠️ 不在这里标记已用，避免中途退出导致口令被锁定
    return res.status(200).json({ valid: true, message: '验证成功' });
  } catch (error) {
    console.error('API错误:', error.message);
    return res.status(500).json({ valid: false, message: error.message });
  }
}
