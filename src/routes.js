const express = require('express');
const { format } = require('date-fns');
const { state, TALK_REASONS, PROMISE_STATUS, ESCALATION_TYPES, autoCheckOverdue, uuidv4 } = require('./store');

const router = express.Router();

router.use((req, res, next) => {
  autoCheckOverdue();
  next();
});

router.get('/meta/reasons', (req, res) => {
  res.json({ code: 0, data: TALK_REASONS });
});

router.get('/meta/promise-statuses', (req, res) => {
  res.json({ code: 0, data: PROMISE_STATUS });
});

router.get('/meta/escalation-types', (req, res) => {
  res.json({ code: 0, data: ESCALATION_TYPES });
});

router.get('/vendors', (req, res) => {
  const { name, industry } = req.query;
  let result = [...state.vendors];
  if (name) {
    result = result.filter(v => v.name.includes(name));
  }
  if (industry) {
    result = result.filter(v => v.industry.includes(industry));
  }
  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ code: 0, data: result, total: result.length });
});

router.get('/vendors/:id', (req, res) => {
  const vendor = state.vendors.find(v => v.id === req.params.id);
  if (!vendor) {
    return res.status(404).json({ code: 1, message: '厂商不存在' });
  }
  res.json({ code: 0, data: vendor });
});

router.post('/vendors', (req, res) => {
  const { name, unifiedSocialCreditCode, legalPerson, contactPhone, industry } = req.body;
  if (!name || !unifiedSocialCreditCode) {
    return res.status(400).json({ code: 1, message: '厂商名称和统一社会信用代码必填' });
  }
  const exists = state.vendors.some(v => v.unifiedSocialCreditCode === unifiedSocialCreditCode);
  if (exists) {
    return res.status(400).json({ code: 1, message: '该统一社会信用代码已存在' });
  }
  const vendor = {
    id: uuidv4(),
    name,
    unifiedSocialCreditCode,
    legalPerson: legalPerson || '',
    contactPhone: contactPhone || '',
    industry: industry || '',
    createdAt: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
  };
  state.vendors.push(vendor);
  res.status(201).json({ code: 0, data: vendor });
});

router.put('/vendors/:id', (req, res) => {
  const idx = state.vendors.findIndex(v => v.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ code: 1, message: '厂商不存在' });
  }
  const { name, unifiedSocialCreditCode, legalPerson, contactPhone, industry } = req.body;
  if (unifiedSocialCreditCode && unifiedSocialCreditCode !== state.vendors[idx].unifiedSocialCreditCode) {
    const exists = state.vendors.some(v => v.unifiedSocialCreditCode === unifiedSocialCreditCode);
    if (exists) {
      return res.status(400).json({ code: 1, message: '该统一社会信用代码已存在' });
    }
  }
  state.vendors[idx] = {
    ...state.vendors[idx],
    ...(name !== undefined && { name }),
    ...(unifiedSocialCreditCode !== undefined && { unifiedSocialCreditCode }),
    ...(legalPerson !== undefined && { legalPerson }),
    ...(contactPhone !== undefined && { contactPhone }),
    ...(industry !== undefined && { industry }),
  };
  res.json({ code: 0, data: state.vendors[idx] });
});

router.delete('/vendors/:id', (req, res) => {
  const idx = state.vendors.findIndex(v => v.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ code: 1, message: '厂商不存在' });
  }
  const hasTalks = state.talks.some(t => t.vendorId === req.params.id);
  if (hasTalks) {
    return res.status(400).json({ code: 1, message: '该厂商存在约谈记录，无法删除' });
  }
  state.vendors.splice(idx, 1);
  res.json({ code: 0, message: '删除成功' });
});

router.get('/vendors/:id/history', (req, res) => {
  const vendor = state.vendors.find(v => v.id === req.params.id);
  if (!vendor) {
    return res.status(404).json({ code: 1, message: '厂商不存在' });
  }
  const talks = state.talks
    .filter(t => t.vendorId === req.params.id)
    .sort((a, b) => new Date(b.talkTime) - new Date(a.talkTime))
    .map(talk => {
      const talkPromises = state.promises.filter(p => p.talkId === talk.id);
      const talkEscalations = state.escalations.filter(e => e.talkId === talk.id);
      const completedOnTime = talkPromises.filter(p => p.status === '按期完成').length;
      const overdue = talkPromises.filter(p => p.status === '逾期未完成').length;
      return {
        ...talk,
        promises: talkPromises,
        escalations: talkEscalations,
        summary: {
          totalPromises: talkPromises.length,
          completedOnTime,
          overdue,
          inProgress: talkPromises.filter(p => p.status === '整改中').length,
          pending: talkPromises.filter(p => p.status === '待整改').length,
        },
      };
    });

  const allPromises = state.promises.filter(p => p.vendorId === req.params.id);
  const allEscalations = state.escalations.filter(e => e.vendorId === req.params.id);
  const totalPromises = allPromises.length;
  const onTimeCount = allPromises.filter(p => p.status === '按期完成').length;

  res.json({
    code: 0,
    data: {
      vendor,
      overview: {
        talkCount: talks.length,
        totalPromises,
        onTimeCompletionRate: totalPromises > 0 ? Number(((onTimeCount / totalPromises) * 100).toFixed(2)) : 0,
        escalationCount: allEscalations.length,
        pendingEscalationCount: allEscalations.filter(e => !e.handled).length,
      },
      talks,
    },
  });
});

router.get('/talks', (req, res) => {
  const { vendorId, reason } = req.query;
  let result = [...state.talks];
  if (vendorId) {
    result = result.filter(t => t.vendorId === vendorId);
  }
  if (reason) {
    result = result.filter(t => t.reason === reason);
  }
  result.sort((a, b) => new Date(b.talkTime) - new Date(a.talkTime));

  const data = result.map(talk => {
    const vendor = state.vendors.find(v => v.id === talk.vendorId);
    const talkPromises = state.promises.filter(p => p.talkId === talk.id);
    return {
      ...talk,
      vendorName: vendor ? vendor.name : '',
      promiseCount: talkPromises.length,
      overduePromiseCount: talkPromises.filter(p => p.status === '逾期未完成').length,
    };
  });

  res.json({ code: 0, data, total: data.length });
});

router.get('/talks/:id', (req, res) => {
  const talk = state.talks.find(t => t.id === req.params.id);
  if (!talk) {
    return res.status(404).json({ code: 1, message: '约谈记录不存在' });
  }
  const vendor = state.vendors.find(v => v.id === talk.vendorId);
  const talkPromises = state.promises.filter(p => p.talkId === talk.id);
  const talkEscalations = state.escalations.filter(e => e.talkId === talk.id);
  res.json({
    code: 0,
    data: {
      ...talk,
      vendor,
      promises: talkPromises,
      escalations: talkEscalations,
    },
  });
});

router.post('/talks', (req, res) => {
  const { vendorId, reason, participants, talkTime, remark, promises } = req.body;

  if (!vendorId || !reason || !participants || !talkTime || !promises || !Array.isArray(promises)) {
    return res.status(400).json({ code: 1, message: '参数不完整：vendorId、reason、participants、talkTime、promises 必填' });
  }
  if (!TALK_REASONS.includes(reason)) {
    return res.status(400).json({ code: 1, message: `约谈事由必须是：${TALK_REASONS.join('、')}` });
  }
  if (!Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({ code: 1, message: '参加人不能为空' });
  }
  if (promises.length === 0) {
    return res.status(400).json({ code: 1, message: '整改承诺不能为空' });
  }

  const vendor = state.vendors.find(v => v.id === vendorId);
  if (!vendor) {
    return res.status(404).json({ code: 1, message: '厂商不存在' });
  }

  for (let i = 0; i < promises.length; i++) {
    const p = promises[i];
    if (!p.content || !p.deadline) {
      return res.status(400).json({ code: 1, message: `第${i + 1}条整改承诺内容和完成期限必填` });
    }
  }

  const talkId = uuidv4();
  const talk = {
    id: talkId,
    vendorId,
    reason,
    participants,
    talkTime,
    remark: remark || '',
    createdAt: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
  };
  state.talks.push(talk);

  const createdPromises = promises.map(p => ({
    id: uuidv4(),
    talkId,
    vendorId,
    content: p.content,
    deadline: p.deadline,
    status: '待整改',
    actualCompletionDate: null,
    createdAt: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
  }));
  state.promises.push(...createdPromises);

  autoCheckOverdue();

  res.status(201).json({
    code: 0,
    data: {
      talk,
      promises: createdPromises,
    },
  });
});

router.get('/promises', (req, res) => {
  const { vendorId, talkId, status } = req.query;
  let result = [...state.promises];
  if (vendorId) result = result.filter(p => p.vendorId === vendorId);
  if (talkId) result = result.filter(p => p.talkId === talkId);
  if (status) result = result.filter(p => p.status === status);
  result.sort((a, b) => {
    const order = { '待整改': 0, '整改中': 1, '逾期未完成': 2, '按期完成': 3 };
    return (order[a.status] || 0) - (order[b.status] || 0);
  });

  const data = result.map(p => {
    const vendor = state.vendors.find(v => v.id === p.vendorId);
    const talk = state.talks.find(t => t.id === p.talkId);
    const escalation = state.escalations.find(e => e.promiseId === p.id);
    return {
      ...p,
      vendorName: vendor ? vendor.name : '',
      talkReason: talk ? talk.reason : '',
      talkTime: talk ? talk.talkTime : '',
      hasEscalation: !!escalation,
      escalationType: escalation ? escalation.type : null,
    };
  });

  res.json({ code: 0, data, total: data.length });
});

router.put('/promises/:id/status', (req, res) => {
  const { status, actualCompletionDate } = req.body;
  if (!PROMISE_STATUS.includes(status)) {
    return res.status(400).json({ code: 1, message: `状态必须是：${PROMISE_STATUS.join('、')}` });
  }

  const promise = state.promises.find(p => p.id === req.params.id);
  if (!promise) {
    return res.status(404).json({ code: 1, message: '承诺记录不存在' });
  }

  const validTransitions = {
    '待整改': ['整改中', '按期完成', '逾期未完成'],
    '整改中': ['按期完成', '逾期未完成', '待整改'],
    '按期完成': [],
    '逾期未完成': ['整改中', '按期完成'],
  };

  if (!validTransitions[promise.status].includes(status)) {
    return res.status(400).json({
      code: 1,
      message: `状态流转不合法：从"${promise.status}"不能变更为"${status}"`,
    });
  }

  promise.status = status;
  if (status === '按期完成') {
    promise.actualCompletionDate = actualCompletionDate || format(new Date(), 'yyyy-MM-dd');
  } else if (status !== '按期完成') {
    promise.actualCompletionDate = null;
  }

  if (status === '逾期未完成') {
    const alreadyEscalated = state.escalations.some(e => e.promiseId === promise.id);
    if (!alreadyEscalated) {
      const vendorTalkCount = state.talks.filter(t => t.vendorId === promise.vendorId).length;
      state.escalations.push({
        id: uuidv4(),
        vendorId: promise.vendorId,
        promiseId: promise.id,
        talkId: promise.talkId,
        type: vendorTalkCount >= 2 ? '通报批评' : '再次约谈',
        triggeredAt: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
        remark: `承诺"${promise.content}"逾期未完成，${vendorTalkCount >= 2 ? '厂商已被多次约谈，予以通报批评' : '触发再次约谈'}`,
        handled: false,
      });
    }
  }

  autoCheckOverdue();

  res.json({ code: 0, data: promise });
});

router.get('/escalations', (req, res) => {
  const { vendorId, type, handled } = req.query;
  let result = [...state.escalations];
  if (vendorId) result = result.filter(e => e.vendorId === vendorId);
  if (type) result = result.filter(e => e.type === type);
  if (handled !== undefined) {
    result = result.filter(e => e.handled === (handled === 'true' || handled === true));
  }
  result.sort((a, b) => new Date(b.triggeredAt) - new Date(a.triggeredAt));

  const data = result.map(e => {
    const vendor = state.vendors.find(v => v.id === e.vendorId);
    const promise = state.promises.find(p => p.id === e.promiseId);
    const talk = state.talks.find(t => t.id === e.talkId);
    return {
      ...e,
      vendorName: vendor ? vendor.name : '',
      promiseContent: promise ? promise.content : '',
      talkReason: talk ? talk.reason : '',
    };
  });

  res.json({ code: 0, data, total: data.length });
});

router.put('/escalations/:id/handle', (req, res) => {
  const { handled, handleRemark } = req.body;
  const escalation = state.escalations.find(e => e.id === req.params.id);
  if (!escalation) {
    return res.status(404).json({ code: 1, message: '升级处置记录不存在' });
  }
  escalation.handled = handled !== undefined ? handled : true;
  if (handleRemark !== undefined) {
    escalation.handleRemark = handleRemark;
  }
  escalation.handledAt = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
  res.json({ code: 0, data: escalation });
});

router.get('/stats/by-vendor', (req, res) => {
  const data = state.vendors.map(vendor => {
    const vendorTalks = state.talks.filter(t => t.vendorId === vendor.id);
    const vendorPromises = state.promises.filter(p => p.vendorId === vendor.id);
    const vendorEscalations = state.escalations.filter(e => e.vendorId === vendor.id);

    const talkCount = vendorTalks.length;
    const totalPromises = vendorPromises.length;
    const onTimeCount = vendorPromises.filter(p => p.status === '按期完成').length;
    const overdueCount = vendorPromises.filter(p => p.status === '逾期未完成').length;

    const reasonStats = {};
    TALK_REASONS.forEach(r => {
      reasonStats[r] = vendorTalks.filter(t => t.reason === r).length;
    });

    return {
      vendorId: vendor.id,
      vendorName: vendor.name,
      industry: vendor.industry,
      talkCount,
      totalPromises,
      onTimeCount,
      overdueCount,
      onTimeCompletionRate: totalPromises > 0 ? Number(((onTimeCount / totalPromises) * 100).toFixed(2)) : 0,
      escalationCount: vendorEscalations.length,
      reTalkCount: vendorEscalations.filter(e => e.type === '再次约谈').length,
     通报Count: vendorEscalations.filter(e => e.type === '通报批评').length,
      reasonBreakdown: reasonStats,
      lastTalkTime: vendorTalks.length > 0
        ? vendorTalks.reduce((max, t) => new Date(t.talkTime) > new Date(max) ? t.talkTime : max, vendorTalks[0].talkTime)
        : null,
    };
  }).sort((a, b) => b.talkCount - a.talkCount);

  res.json({
    code: 0,
    data,
    summary: {
      totalVendors: state.vendors.length,
      totalTalks: state.talks.length,
      totalPromises: state.promises.length,
      overallOnTimeRate: state.promises.length > 0
        ? Number(((state.promises.filter(p => p.status === '按期完成').length / state.promises.length) * 100).toFixed(2))
        : 0,
      totalEscalations: state.escalations.length,
    },
  });
});

router.get('/stats/by-reason', (req, res) => {
  const data = TALK_REASONS.map(reason => {
    const talksByReason = state.talks.filter(t => t.reason === reason);
    const vendorsInvolved = new Set(talksByReason.map(t => t.vendorId)).size;
    const promisesByReason = state.promises.filter(p => {
      const talk = state.talks.find(t => t.id === p.talkId);
      return talk && talk.reason === reason;
    });
    const escalationsByReason = state.escalations.filter(e => {
      const talk = state.talks.find(t => t.id === e.talkId);
      return talk && talk.reason === reason;
    });

    const onTimeCount = promisesByReason.filter(p => p.status === '按期完成').length;
    const overdueCount = promisesByReason.filter(p => p.status === '逾期未完成').length;

    return {
      reason,
      talkCount: talksByReason.length,
      vendorsInvolved,
      totalPromises: promisesByReason.length,
      onTimeCount,
      overdueCount,
      onTimeCompletionRate: promisesByReason.length > 0
        ? Number(((onTimeCount / promisesByReason.length) * 100).toFixed(2))
        : 0,
      escalationCount: escalationsByReason.length,
      reTalkCount: escalationsByReason.filter(e => e.type === '再次约谈').length,
     通报Count: escalationsByReason.filter(e => e.type === '通报批评').length,
    };
  });

  res.json({
    code: 0,
    data,
    summary: {
      totalTalks: state.talks.length,
      totalPromises: state.promises.length,
      overallOnTimeRate: state.promises.length > 0
        ? Number(((state.promises.filter(p => p.status === '按期完成').length / state.promises.length) * 100).toFixed(2))
        : 0,
    },
  });
});

router.get('/stats/overview', (req, res) => {
  const totalTalks = state.talks.length;
  const totalPromises = state.promises.length;
  const statusBreakdown = {};
  PROMISE_STATUS.forEach(s => {
    statusBreakdown[s] = state.promises.filter(p => p.status === s).length;
  });

  const totalEscalations = state.escalations.length;
  const escalationBreakdown = {};
  ESCALATION_TYPES.forEach(t => {
    escalationBreakdown[t] = state.escalations.filter(e => e.type === t).length;
  });
  escalationBreakdown['未处理'] = state.escalations.filter(e => !e.handled).length;

  const reasonBreakdown = {};
  TALK_REASONS.forEach(r => {
    reasonBreakdown[r] = state.talks.filter(t => t.reason === r).length;
  });

  const multiTalkVendors = state.vendors
    .map(v => ({
      vendor: v,
      count: state.talks.filter(t => t.vendorId === v.id).length,
    }))
    .filter(x => x.count >= 2)
    .sort((a, b) => b.count - a.count)
    .map(x => ({
      vendorId: x.vendor.id,
      vendorName: x.vendor.name,
      industry: x.vendor.industry,
      talkCount: x.count,
    }));

  const today = new Date();
  const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const last30Talks = state.talks.filter(t => new Date(t.talkTime) >= last30Days).length;
  const last30Escalations = state.escalations.filter(e => new Date(e.triggeredAt) >= last30Days).length;

  const approachingDeadline = state.promises
    .filter(p => p.status === '待整改' || p.status === '整改中')
    .filter(p => {
      const deadline = new Date(p.deadline);
      const diffDays = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 7;
    })
    .map(p => {
      const vendor = state.vendors.find(v => v.id === p.vendorId);
      const deadline = new Date(p.deadline);
      const daysLeft = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
      return {
        id: p.id,
        content: p.content,
        deadline: p.deadline,
        daysLeft,
        status: p.status,
        vendorName: vendor ? vendor.name : '',
        vendorId: p.vendorId,
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  res.json({
    code: 0,
    data: {
      totalVendors: state.vendors.length,
      totalTalks,
      totalPromises,
      statusBreakdown,
      totalEscalations,
      escalationBreakdown,
      reasonBreakdown,
      multiTalkVendors,
      recentActivity: {
        last30DaysTalks: last30Talks,
        last30DaysEscalations: last30Escalations,
      },
      approachingDeadline,
      overallOnTimeRate: totalPromises > 0
        ? Number(((state.promises.filter(p => p.status === '按期完成').length / totalPromises) * 100).toFixed(2))
        : 0,
    },
  });
});

module.exports = router;
