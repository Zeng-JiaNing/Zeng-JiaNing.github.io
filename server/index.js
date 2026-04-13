const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
// 允许所有设备跨域访问（关键！多设备必须加）
app.use(cors({ origin: '*' }));
app.use(express.json());

// 数据文件（所有设备共享这一个文件）
const DATA_FILE = path.join(__dirname, 'passwords.json');

// 初始化数据文件（第一次运行自动创建）
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    validPasswords: [], // 有效口令列表
    usedPasswords: []   // 已使用口令列表
  }, null, 2));
}

// 读取共享数据（所有设备读的是同一个文件）
function readSharedData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

// 保存共享数据（所有设备改的是同一个文件）
function writeSharedData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ===================== 接口：获取所有口令（多设备共享） =====================
app.get('/api/passwords', (req, res) => {
  res.json(readSharedData());
});

// ===================== 接口：操作口令（新增/标记已用/重置等） =====================
app.post('/api/passwords', (req, res) => {
  const { action, password, newPasswords } = req.body;
  let data = readSharedData();

  switch (action) {
    case 'batchGenerate': // 批量生成口令
      data.validPasswords = [...data.validPasswords, ...(newPasswords || [])];
      break;
    case 'addSingle': // 新增单个口令
      if (password && !data.validPasswords.includes(password)) {
        data.validPasswords.push(password);
      }
      break;
    case 'markUsed': // 标记口令为已使用
      if (password && !data.usedPasswords.includes(password)) {
        data.usedPasswords.push(password);
      }
      break;
    case 'resetUsed': // 重置已使用口令
      data.usedPasswords = [];
      break;
    case 'clearAll': // 清空所有口令
      data = { validPasswords: [], usedPasswords: [] };
      break;
    default:
      return res.status(400).json({ error: '未知操作' });
  }

  writeSharedData(data);
  res.json({ success: true, data });
});

// ===================== 接口：验证口令（核心！多设备共用验证逻辑） =====================
app.post('/api/validate', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.json({ valid: false, message: '请输入口令' });
  }

  let data = readSharedData();
  // 验证口令是否有效
  if (!data.validPasswords.includes(password)) {
    return res.json({ valid: false, message: '口令无效' });
  }
  // 验证口令是否已使用
  if (data.usedPasswords.includes(password)) {
    return res.json({ valid: false, message: '口令已使用' });
  }

  // 标记为已使用（所有设备都能看到这个口令已用）
  data.usedPasswords.push(password);
  writeSharedData(data);
  res.json({ valid: true, message: '验证成功' });
});

// ===================== 接口：清空所有口令 =====================
app.delete('/api/passwords', (req, res) => {
  writeSharedData({ validPasswords: [], usedPasswords: [] });
  res.json({ success: true });
});

// 启动服务（Railway 自动分配端口）
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ 多设备共享服务已启动！端口：${PORT}`);
  console.log(`✅ 所有设备访问这个地址，都会共享同一套口令数据！`);
});