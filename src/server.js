const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const { autoCheckOverdue } = require('./store');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api', routes);

app.get('/health', (req, res) => {
  res.json({
    code: 0,
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: '厂商约谈台账管理服务运行正常',
  });
});

app.get('/', (req, res) => {
  res.json({
    code: 0,
    name: '厂商约谈台账管理系统 API',
    version: '1.0.0',
    docs: {
      'GET /health': '健康检查',
      'GET /api/meta/reasons': '约谈事由枚举',
      'GET /api/meta/promise-statuses': '承诺状态枚举',
      'GET /api/meta/escalation-types': '升级处置类型枚举',
      '厂商管理': {
        'GET /api/vendors': '厂商列表（支持 name, industry 查询）',
        'GET /api/vendors/:id': '厂商详情',
        'POST /api/vendors': '新增厂商',
        'PUT /api/vendors/:id': '修改厂商',
        'DELETE /api/vendors/:id': '删除厂商',
        'GET /api/vendors/:id/history': '厂商约谈历史（历次约谈+承诺+升级处置串联）',
      },
      '约谈管理': {
        'GET /api/talks': '约谈列表（支持 vendorId, reason 过滤）',
        'GET /api/talks/:id': '约谈详情',
        'POST /api/talks': '登记约谈（含整改承诺逐条录入）',
      },
      '承诺跟踪': {
        'GET /api/promises': '承诺列表（支持 vendorId, talkId, status 过滤）',
        'PUT /api/promises/:id/status': '更新承诺状态（状态流转）',
      },
      '升级处置': {
        'GET /api/escalations': '升级处置列表（支持 vendorId, type, handled 过滤）',
        'PUT /api/escalations/:id/handle': '标记处置已处理',
      },
      '统计分析': {
        'GET /api/stats/overview': '总览统计',
        'GET /api/stats/by-vendor': '按厂商统计（约谈次数/按期完成率/升级处置数）',
        'GET /api/stats/by-reason': '按事由统计（约谈次数/按期完成率/升级处置数）',
      },
    },
  });
});

app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({
    code: 1,
    message: '服务器内部错误',
    error: err.message,
  });
});

setInterval(() => {
  try {
    const newEscalations = autoCheckOverdue();
    if (newEscalations.length > 0) {
      console.log(`[自动检查] ${new Date().toLocaleString()} 触发 ${newEscalations.length} 条逾期升级处置`);
    }
  } catch (e) {
    console.error('[自动检查错误]', e);
  }
}, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log('========================================');
  console.log('  厂商约谈台账管理系统后端服务启动成功');
  console.log(`  服务地址: http://localhost:${PORT}`);
  console.log(`  API 根路径: http://localhost:${PORT}/api`);
  console.log(`  健康检查: http://localhost:${PORT}/health`);
  console.log('========================================');
  console.log('');
  console.log('已预置示例数据：');
  console.log('  - 4 家厂商（其中 3 家被多次约谈）');
  console.log('  - 极速阅读科技：3 次约谈，1 次再次约谈升级处置');
  console.log('  - 畅游网络科技：2 次约谈，1 次通报批评升级处置');
  console.log('  - 智享资讯传媒：2 次约谈，1 次再次约谈升级处置');
  console.log('  - 优品购物电商：1 次约谈');
  console.log('');
  autoCheckOverdue();
});
