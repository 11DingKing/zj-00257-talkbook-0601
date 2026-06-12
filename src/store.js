const { v4: uuidv4 } = require("uuid");
const {
  format,
  addDays,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
  differenceInCalendarDays,
} = require("date-fns");

const TALK_REASONS = ["弹窗诱导", "强制跳转", "整改不到位"];
const PROMISE_STATUS = ["待整改", "整改中", "按期完成", "逾期未完成"];
const ESCALATION_TYPES = ["再次约谈", "通报批评"];

const state = {
  vendors: [],
  talks: [],
  promises: [],
  escalations: [],
};

function initSampleData() {
  const today = new Date();

  const vendor1 = {
    id: uuidv4(),
    name: "极速阅读科技有限公司",
    unifiedSocialCreditCode: "91330100MA12345678",
    legalPerson: "张伟",
    contactPhone: "13800000001",
    industry: "移动阅读",
    createdAt: format(addDays(today, -180), "yyyy-MM-dd HH:mm:ss"),
  };

  const vendor2 = {
    id: uuidv4(),
    name: "畅游网络科技有限公司",
    unifiedSocialCreditCode: "91330100MA23456789",
    legalPerson: "李娜",
    contactPhone: "13800000002",
    industry: "网络游戏",
    createdAt: format(addDays(today, -200), "yyyy-MM-dd HH:mm:ss"),
  };

  const vendor3 = {
    id: uuidv4(),
    name: "智享资讯传媒有限公司",
    unifiedSocialCreditCode: "91330100MA34567890",
    legalPerson: "王磊",
    contactPhone: "13800000003",
    industry: "资讯传媒",
    createdAt: format(addDays(today, -150), "yyyy-MM-dd HH:mm:ss"),
  };

  const vendor4 = {
    id: uuidv4(),
    name: "优品购物电子商务有限公司",
    unifiedSocialCreditCode: "91330100MA45678901",
    legalPerson: "刘芳",
    contactPhone: "13800000004",
    industry: "电子商务",
    createdAt: format(addDays(today, -100), "yyyy-MM-dd HH:mm:ss"),
  };

  state.vendors.push(vendor1, vendor2, vendor3, vendor4);

  const talk1v1 = {
    id: uuidv4(),
    vendorId: vendor1.id,
    reason: "弹窗诱导",
    participants: ["监管员A", "张伟", "技术总监C"],
    talkTime: format(addDays(today, -120), "yyyy-MM-dd HH:mm:ss"),
    remark: "首次发现弹窗诱导用户点击广告",
    createdAt: format(addDays(today, -120), "yyyy-MM-dd HH:mm:ss"),
  };
  state.talks.push(talk1v1);

  state.promises.push(
    {
      id: uuidv4(),
      talkId: talk1v1.id,
      vendorId: vendor1.id,
      content: "3日内移除所有诱导性弹窗广告",
      deadline: format(addDays(today, -117), "yyyy-MM-dd"),
      status: "按期完成",
      actualCompletionDate: format(addDays(today, -118), "yyyy-MM-dd"),
      createdAt: format(addDays(today, -120), "yyyy-MM-dd HH:mm:ss"),
    },
    {
      id: uuidv4(),
      talkId: talk1v1.id,
      vendorId: vendor1.id,
      content: "建立弹窗内容审核机制",
      deadline: format(addDays(today, -110), "yyyy-MM-dd"),
      status: "按期完成",
      actualCompletionDate: format(addDays(today, -112), "yyyy-MM-dd"),
      createdAt: format(addDays(today, -120), "yyyy-MM-dd HH:mm:ss"),
    },
    {
      id: uuidv4(),
      talkId: talk1v1.id,
      vendorId: vendor1.id,
      content: "对全体运营人员进行合规培训",
      deadline: format(addDays(today, -105), "yyyy-MM-dd"),
      status: "按期完成",
      actualCompletionDate: format(addDays(today, -106), "yyyy-MM-dd"),
      createdAt: format(addDays(today, -120), "yyyy-MM-dd HH:mm:ss"),
    },
  );

  const talk2v1 = {
    id: uuidv4(),
    vendorId: vendor1.id,
    reason: "强制跳转",
    participants: ["监管员B", "张伟", "产品经理D"],
    talkTime: format(addDays(today, -60), "yyyy-MM-dd HH:mm:ss"),
    remark: "用户反映阅读过程中被强制跳转到广告页面",
    createdAt: format(addDays(today, -60), "yyyy-MM-dd HH:mm:ss"),
  };
  state.talks.push(talk2v1);

  state.promises.push(
    {
      id: uuidv4(),
      talkId: talk2v1.id,
      vendorId: vendor1.id,
      content: "立即下线强制跳转功能",
      deadline: format(addDays(today, -58), "yyyy-MM-dd"),
      status: "按期完成",
      actualCompletionDate: format(addDays(today, -59), "yyyy-MM-dd"),
      createdAt: format(addDays(today, -60), "yyyy-MM-dd HH:mm:ss"),
    },
    {
      id: uuidv4(),
      talkId: talk2v1.id,
      vendorId: vendor1.id,
      content: "开展全量代码自查，清理隐藏跳转逻辑",
      deadline: format(addDays(today, -50), "yyyy-MM-dd"),
      status: "逾期未完成",
      actualCompletionDate: null,
      createdAt: format(addDays(today, -60), "yyyy-MM-dd HH:mm:ss"),
    },
    {
      id: uuidv4(),
      talkId: talk2v1.id,
      vendorId: vendor1.id,
      content: "提交整改报告并附技术方案",
      deadline: format(addDays(today, -55), "yyyy-MM-dd"),
      status: "按期完成",
      actualCompletionDate: format(addDays(today, -56), "yyyy-MM-dd"),
      createdAt: format(addDays(today, -60), "yyyy-MM-dd HH:mm:ss"),
    },
  );

  state.escalations.push({
    id: uuidv4(),
    vendorId: vendor1.id,
    promiseId: state.promises.find(
      (p) => p.content === "开展全量代码自查，清理隐藏跳转逻辑",
    ).id,
    talkId: talk2v1.id,
    type: "再次约谈",
    triggeredAt: format(addDays(today, -49), "yyyy-MM-dd HH:mm:ss"),
    remark: '承诺"开展全量代码自查，清理隐藏跳转逻辑"逾期未完成，触发再次约谈',
    handled: false,
  });

  const talk3v1 = {
    id: uuidv4(),
    vendorId: vendor1.id,
    reason: "整改不到位",
    participants: ["监管处长E", "监管员B", "张伟", "CTO F"],
    talkTime: format(addDays(today, -30), "yyyy-MM-dd HH:mm:ss"),
    remark: "前次约谈承诺逾期未完成，升级再次约谈",
    createdAt: format(addDays(today, -30), "yyyy-MM-dd HH:mm:ss"),
  };
  state.talks.push(talk3v1);

  state.promises.push(
    {
      id: uuidv4(),
      talkId: talk3v1.id,
      vendorId: vendor1.id,
      content: "7日内完成全部代码自查并提交自查报告",
      deadline: format(addDays(today, 3), "yyyy-MM-dd"),
      status: "整改中",
      actualCompletionDate: null,
      createdAt: format(addDays(today, -30), "yyyy-MM-dd HH:mm:ss"),
    },
    {
      id: uuidv4(),
      talkId: talk3v1.id,
      vendorId: vendor1.id,
      content: "引入第三方安全公司进行代码审计",
      deadline: format(addDays(today, 15), "yyyy-MM-dd"),
      status: "待整改",
      actualCompletionDate: null,
      createdAt: format(addDays(today, -30), "yyyy-MM-dd HH:mm:ss"),
    },
    {
      id: uuidv4(),
      talkId: talk3v1.id,
      vendorId: vendor1.id,
      content: "建立用户投诉快速响应通道（24小时内响应）",
      deadline: format(addDays(today, 0), "yyyy-MM-dd"),
      status: "整改中",
      actualCompletionDate: null,
      createdAt: format(addDays(today, -30), "yyyy-MM-dd HH:mm:ss"),
    },
  );

  const talk1v2 = {
    id: uuidv4(),
    vendorId: vendor2.id,
    reason: "弹窗诱导",
    participants: ["监管员A", "李娜", "运营总监G"],
    talkTime: format(addDays(today, -90), "yyyy-MM-dd HH:mm:ss"),
    remark: "游戏内频繁弹出诱导消费弹窗",
    createdAt: format(addDays(today, -90), "yyyy-MM-dd HH:mm:ss"),
  };
  state.talks.push(talk1v2);

  state.promises.push(
    {
      id: uuidv4(),
      talkId: talk1v2.id,
      vendorId: vendor2.id,
      content: "调整弹窗展示频率，每小时不超过1次",
      deadline: format(addDays(today, -87), "yyyy-MM-dd"),
      status: "按期完成",
      actualCompletionDate: format(addDays(today, -88), "yyyy-MM-dd"),
      createdAt: format(addDays(today, -90), "yyyy-MM-dd HH:mm:ss"),
    },
    {
      id: uuidv4(),
      talkId: talk1v2.id,
      vendorId: vendor2.id,
      content: "取消未成年人诱导消费弹窗",
      deadline: format(addDays(today, -85), "yyyy-MM-dd"),
      status: "按期完成",
      actualCompletionDate: format(addDays(today, -86), "yyyy-MM-dd"),
      createdAt: format(addDays(today, -90), "yyyy-MM-dd HH:mm:ss"),
    },
  );

  const talk2v2 = {
    id: uuidv4(),
    vendorId: vendor2.id,
    reason: "强制跳转",
    participants: ["监管员C", "李娜", "技术负责人H"],
    talkTime: format(addDays(today, -45), "yyyy-MM-dd HH:mm:ss"),
    remark: "游戏启动时强制跳转到广告应用商店",
    createdAt: format(addDays(today, -45), "yyyy-MM-dd HH:mm:ss"),
  };
  state.talks.push(talk2v2);

  state.promises.push(
    {
      id: uuidv4(),
      talkId: talk2v2.id,
      vendorId: vendor2.id,
      content: "移除启动页强制跳转逻辑",
      deadline: format(addDays(today, -43), "yyyy-MM-dd"),
      status: "按期完成",
      actualCompletionDate: format(addDays(today, -44), "yyyy-MM-dd"),
      createdAt: format(addDays(today, -45), "yyyy-MM-dd HH:mm:ss"),
    },
    {
      id: uuidv4(),
      talkId: talk2v2.id,
      vendorId: vendor2.id,
      content: "审查所有SDK合作方，清理违规跳转SDK",
      deadline: format(addDays(today, -35), "yyyy-MM-dd"),
      status: "逾期未完成",
      actualCompletionDate: null,
      createdAt: format(addDays(today, -45), "yyyy-MM-dd HH:mm:ss"),
    },
  );

  state.escalations.push({
    id: uuidv4(),
    vendorId: vendor2.id,
    promiseId: state.promises.find(
      (p) => p.content === "审查所有SDK合作方，清理违规跳转SDK",
    ).id,
    talkId: talk2v2.id,
    type: "通报批评",
    triggeredAt: format(addDays(today, -34), "yyyy-MM-dd HH:mm:ss"),
    remark: '承诺"审查所有SDK合作方，清理违规跳转SDK"逾期未完成，予以通报批评',
    handled: true,
  });

  const talk1v3 = {
    id: uuidv4(),
    vendorId: vendor3.id,
    reason: "弹窗诱导",
    participants: ["监管员B", "王磊", "总编辑I"],
    talkTime: format(addDays(today, -70), "yyyy-MM-dd HH:mm:ss"),
    remark: "资讯文章页大量诱导点击弹窗",
    createdAt: format(addDays(today, -70), "yyyy-MM-dd HH:mm:ss"),
  };
  state.talks.push(talk1v3);

  state.promises.push(
    {
      id: uuidv4(),
      talkId: talk1v3.id,
      vendorId: vendor3.id,
      content: "减少弹窗密度，每篇文章弹窗不超过1个",
      deadline: format(addDays(today, -67), "yyyy-MM-dd"),
      status: "按期完成",
      actualCompletionDate: format(addDays(today, -68), "yyyy-MM-dd"),
      createdAt: format(addDays(today, -70), "yyyy-MM-dd HH:mm:ss"),
    },
    {
      id: uuidv4(),
      talkId: talk1v3.id,
      vendorId: vendor3.id,
      content: "优化关闭按钮，确保易于点击",
      deadline: format(addDays(today, -65), "yyyy-MM-dd"),
      status: "按期完成",
      actualCompletionDate: format(addDays(today, -66), "yyyy-MM-dd"),
      createdAt: format(addDays(today, -70), "yyyy-MM-dd HH:mm:ss"),
    },
  );

  const talk2v3 = {
    id: uuidv4(),
    vendorId: vendor3.id,
    reason: "整改不到位",
    participants: ["监管员A", "监管员B", "王磊"],
    talkTime: format(addDays(today, -20), "yyyy-MM-dd HH:mm:ss"),
    remark: "群众举报弹窗问题依旧存在，整改落实不到位",
    createdAt: format(addDays(today, -20), "yyyy-MM-dd HH:mm:ss"),
  };
  state.talks.push(talk2v3);

  state.promises.push(
    {
      id: uuidv4(),
      talkId: talk2v3.id,
      vendorId: vendor3.id,
      content: "立即开展全面复查，3日内提交复查报告",
      deadline: format(addDays(today, -17), "yyyy-MM-dd"),
      status: "逾期未完成",
      actualCompletionDate: null,
      createdAt: format(addDays(today, -20), "yyyy-MM-dd HH:mm:ss"),
    },
    {
      id: uuidv4(),
      talkId: talk2v3.id,
      vendorId: vendor3.id,
      content: "建立总编辑内容责任制，弹窗内容需总编辑签字",
      deadline: format(addDays(today, 10), "yyyy-MM-dd"),
      status: "待整改",
      actualCompletionDate: null,
      createdAt: format(addDays(today, -20), "yyyy-MM-dd HH:mm:ss"),
    },
  );

  state.escalations.push({
    id: uuidv4(),
    vendorId: vendor3.id,
    promiseId: state.promises.find(
      (p) => p.content === "立即开展全面复查，3日内提交复查报告",
    ).id,
    talkId: talk2v3.id,
    type: "再次约谈",
    triggeredAt: format(addDays(today, -16), "yyyy-MM-dd HH:mm:ss"),
    remark: '承诺"立即开展全面复查，3日内提交复查报告"逾期未完成，触发再次约谈',
    handled: false,
  });

  const talk1v4 = {
    id: uuidv4(),
    vendorId: vendor4.id,
    reason: "弹窗诱导",
    participants: ["监管员C", "刘芳", "市场总监J"],
    talkTime: format(addDays(today, -25), "yyyy-MM-dd HH:mm:ss"),
    remark: "首页诱导点击优惠券弹窗，关闭按钮极小",
    createdAt: format(addDays(today, -25), "yyyy-MM-dd HH:mm:ss"),
  };
  state.talks.push(talk1v4);

  state.promises.push(
    {
      id: uuidv4(),
      talkId: talk1v4.id,
      vendorId: vendor4.id,
      content: "重新设计弹窗UI，确保关闭按钮清晰可辨",
      deadline: format(addDays(today, -22), "yyyy-MM-dd"),
      status: "按期完成",
      actualCompletionDate: format(addDays(today, -23), "yyyy-MM-dd"),
      createdAt: format(addDays(today, -25), "yyyy-MM-dd HH:mm:ss"),
    },
    {
      id: uuidv4(),
      talkId: talk1v4.id,
      vendorId: vendor4.id,
      content: "优化弹窗触发逻辑，避免频繁打扰用户",
      deadline: format(addDays(today, 8), "yyyy-MM-dd"),
      status: "整改中",
      actualCompletionDate: null,
      createdAt: format(addDays(today, -25), "yyyy-MM-dd HH:mm:ss"),
    },
  );

  return state;
}

function isPromiseOverdue(promise) {
  if (!promise.deadline) return false;
  if (promise.status === "按期完成" || promise.status === "逾期未完成") {
    return promise.status === "逾期未完成";
  }

  const todayStart = startOfDay(new Date());
  const deadlineDate = parseISO(promise.deadline);
  if (isNaN(deadlineDate.getTime())) return false;
  const deadlineStart = startOfDay(deadlineDate);

  return isBefore(deadlineStart, todayStart);
}

function autoCheckOverdue() {
  const todayStart = startOfDay(new Date());
  let newEscalations = [];

  const vendorPendingEscalationCount = {};
  const talkEscalationMap = {};

  state.talks.forEach((talk) => {
    talkEscalationMap[talk.id] = {
      hasEscalation: state.escalations.some((e) => e.talkId === talk.id),
      overduePromises: [],
    };
  });

  state.promises.forEach((promise) => {
    if (
      (promise.status === "待整改" || promise.status === "整改中") &&
      promise.deadline
    ) {
      const deadlineDate = parseISO(promise.deadline);
      if (isNaN(deadlineDate.getTime())) {
        return;
      }
      const deadlineStart = startOfDay(deadlineDate);

      const isOverdue = isBefore(deadlineStart, todayStart);

      if (isOverdue) {
        promise.status = "逾期未完成";

        if (talkEscalationMap[promise.talkId]) {
          talkEscalationMap[promise.talkId].overduePromises.push(promise);
        }
      }
    }
  });

  Object.keys(talkEscalationMap).forEach((talkId) => {
    const talkInfo = talkEscalationMap[talkId];
    if (talkInfo.overduePromises.length > 0 && !talkInfo.hasEscalation) {
      const firstOverduePromise = talkInfo.overduePromises[0];
      const vendorId = firstOverduePromise.vendorId;

      const vendorExistingEscalations =
        state.escalations.filter((e) => e.vendorId === vendorId).length +
        (vendorPendingEscalationCount[vendorId] || 0);

      const escalationType =
        vendorExistingEscalations >= 1 ? "通报批评" : "再次约谈";

      const overdueContents = talkInfo.overduePromises
        .map((p) => `"${p.content}"`)
        .join("、");

      const escalation = {
        id: uuidv4(),
        vendorId: vendorId,
        promiseId: firstOverduePromise.id,
        talkId: talkId,
        type: escalationType,
        triggeredAt: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
        remark: `约谈中 ${talkInfo.overduePromises.length} 条承诺逾期未完成（${overdueContents}），${vendorExistingEscalations >= 1 ? "该厂商已有逾期升级处置记录，升级为通报批评" : "触发再次约谈"}`,
        handled: false,
      };
      state.escalations.push(escalation);
      newEscalations.push(escalation);

      vendorPendingEscalationCount[vendorId] =
        (vendorPendingEscalationCount[vendorId] || 0) + 1;

      talkInfo.hasEscalation = true;
    }
  });

  return newEscalations;
}

initSampleData();
autoCheckOverdue();

module.exports = {
  state,
  TALK_REASONS,
  PROMISE_STATUS,
  ESCALATION_TYPES,
  autoCheckOverdue,
  isPromiseOverdue,
  uuidv4,
};
