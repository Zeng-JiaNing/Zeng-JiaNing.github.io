const express = require('express');
const Redis = require('ioredis');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Redis 连接
let redis;
try {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error('❌ 未找到 REDIS_URL 环境变量');
  } else {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      connectTimeout: 15000,
      family: 4,
    });
    redis.on('error', (err) => console.error('Redis 错误:', err.message));
    redis.on('connect', () => console.log('✅ Redis 已连接'));
  }
} catch (e) {
  console.error('Redis 初始化失败:', e.message);
}

// 内存备用
let inMemoryData = { validPasswords: [], usedPasswords: [] };

// GET /api/passwords
app.get('/api/passwords', async (req, res) => {
  try {
    let data;
    if (redis) {
      const raw = await redis.get('quiz_passwords');
      data = raw ? JSON.parse(raw) : inMemoryData;
    } else {
      data = inMemoryData;
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/passwords
app.post('/api/passwords', async (req, res) => {
  const { action, password, newPasswords, validPasswords, usedPasswords } = req.body;
  try {
    let data;
    if (redis) {
      const raw = await redis.get('quiz_passwords');
      data = raw ? JSON.parse(raw) : inMemoryData;
    } else {
      data = inMemoryData;
    }
    switch (action) {
      case 'batchGenerate':
        data.validPasswords = [...data.validPasswords, ...(newPasswords || [])];
        break;
      case 'addSingle':
        if (password && !data.validPasswords.includes(password)) {
          data.validPasswords.push(password);
        }
        break;
      case 'markUsed':
        if (password && !data.usedPasswords.includes(password)) {
          data.usedPasswords.push(password);
        }
        break;
      case 'resetUsed':
        data.usedPasswords = [];
        break;
      case 'clearAll':
        data = { validPasswords: [], usedPasswords: [] };
        break;
      case 'sync':
        data = { validPasswords: validPasswords || data.validPasswords, usedPasswords: usedPasswords || data.usedPasswords };
        break;
      default:
        return res.status(400).json({ error: '未知操作' });
    }
    if (redis) {
      await redis.set('quiz_passwords', JSON.stringify(data));
    } else {
      inMemoryData = data;
    }
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/validate
// ✅ 修复：仅验证，不标记，标记在答完题后由前端调用 markUsed
app.post('/api/validate', async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.json({ valid: false, message: '请输入口令' });
  }
  try {
    let data;
    if (redis) {
      const raw = await redis.get('quiz_passwords');
      data = raw ? JSON.parse(raw) : inMemoryData;
    } else {
      data = inMemoryData;
    }
    if (!data.validPasswords.includes(password)) {
      return res.json({ valid: false, message: '口令无效' });
    }
    if (data.usedPasswords.includes(password)) {
      return res.json({ valid: false, message: '口令已使用' });
    }
    // ⚠️ 关键修复：不在这里标记已用，避免中途退出导致口令被锁
    return res.json({ valid: true, message: '验证成功' });
  } catch (e) {
    res.status(500).json({ valid: false, message: e.message });
  }
});

// DELETE /api/passwords
app.delete('/api/passwords', async (req, res) => {
  try {
    inMemoryData = { validPasswords: [], usedPasswords: [] };
    if (redis) {
      await redis.set('quiz_passwords', JSON.stringify(inMemoryData));
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 服务启动成功，端口：${PORT}`);
});
