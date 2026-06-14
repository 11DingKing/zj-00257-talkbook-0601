const { v4: uuidv4 } = require("uuid");
const {
  format,
  addDays,
  parseISO,
  startOfDay,
} = require("date-fns");

const TALK_REASONS = ["弹窗诱导", "强制跳转", "整改不到位"];
const PROMISE_STATUS = ["待整改", "整改中", "待核验", "按期完成", "逾期未完成"];
const ESCALATION_TYPES = ["再次约谈", "通报批评"];

function createFreshState() {
  return {
    vendors: [],
    talks: [],
    promises: [],
    escalations: [],
    evidenceSubmissions: [],
    verificationRecords: [],
    talkDrafts: [],
    noticeQueue: [],
  };
}

function isPromiseOverdue(promise, today = new Date()) {
  if (!promise.deadline) return false;
  if (promise.status === "按期完成" || promise.status === "逾期未完成") {
    return promise.status === "逾期未完成";
  }

  const todayStart = startOfDay(today);
  const deadlineDate = parseISO(promise.deadline);
  if (isNaN(deadlineDate.getTime())) return false;
  const deadlineStart = startOfDay(deadlineDate);

  return deadlineStart.getTime() < todayStart.getTime();
}

function getFirstTimePassRate(state, promisesFiltered = null) {
  const targetPromises = promisesFiltered || state.promises;
  const verifiedPromises = targetPromises.filter((p) => {
    const records = state.verificationRecords.filter(
      (r) => r.promiseId === p.id,
    );
    return records.length > 0 && records.some((r) => r.result === "通过");
  });

  if (verifiedPromises.length === 0) return { rate: 0, total: 0, firstPass: 0 };

  let firstPassCount = 0;
  verifiedPromises.forEach((p) => {
    const records = state.verificationRecords
      .filter((r) => r.promiseId === p.id)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (records.length > 0 && records[0].result === "通过") {
      firstPassCount++;
    }
  });

  return {
    rate: Number(((firstPassCount / verifiedPromises.length) * 100).toFixed(2)),
    total: verifiedPromises.length,
    firstPass: firstPassCount,
  };
}

function autoCheckOverdue(state, today = new Date()) {
  const todayStart = startOfDay(today);
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
      (promise.status === "待整改" ||
        promise.status === "整改中" ||
        promise.status === "待核验") &&
      promise.deadline
    ) {
      const deadlineDate = parseISO(promise.deadline);
      if (isNaN(deadlineDate.getTime())) {
        return;
      }
      const deadlineStart = startOfDay(deadlineDate);

      const isOverdue = deadlineStart.getTime() < todayStart.getTime();

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
        triggeredAt: format(today, "yyyy-MM-dd HH:mm:ss"),
        remark: `约谈中 ${talkInfo.overduePromises.length} 条承诺逾期未完成（${overdueContents}），${vendorExistingEscalations >= 1 ? "该厂商已有逾期升级处置记录，升级为通报批评" : "触发再次约谈"}`,
        handled: false,
        generatedTalkDraftId: null,
        generatedNoticeId: null,
      };
      state.escalations.push(escalation);
      newEscalations.push(escalation);

      const overduePromiseIds = talkInfo.overduePromises.map((p) => p.id);

      if (escalationType === "再次约谈") {
        const originalTalk = state.talks.find((t) => t.id === talkId);
        const talkDraft = {
          id: uuidv4(),
          vendorId: vendorId,
          reason: "整改不到位",
          participants: originalTalk
            ? [...new Set([...originalTalk.participants, "监管处长"])].filter(
                Boolean,
              )
            : ["监管员", "厂商联系人"],
          talkTime: format(addDays(today, 7), "yyyy-MM-dd HH:mm:ss"),
          remark: `前次约谈 ${talkInfo.overduePromises.length} 条承诺逾期未完成，升级再次约谈：${overdueContents}`,
          sourceEscalationId: escalation.id,
          linkedPromiseIds: overduePromiseIds,
          status: "草稿",
          createdAt: format(today, "yyyy-MM-dd HH:mm:ss"),
        };
        state.talkDrafts.push(talkDraft);
        escalation.generatedTalkDraftId = talkDraft.id;
      } else if (escalationType === "通报批评") {
        const vendor = state.vendors.find((v) => v.id === vendorId);
        const originalTalk = state.talks.find((t) => t.id === talkId);
        const notice = {
          id: uuidv4(),
          vendorId: vendorId,
          promiseId: firstOverduePromise.id,
          talkId: talkId,
          title: `关于对${vendor ? vendor.name : "该厂商"}予以通报批评的通知`,
          content: `${vendor ? vendor.name : "该厂商"}在约谈中作出的${overdueContents}承诺逾期未完成，经多次约谈督促后仍未整改到位，现予以通报批评。`,
          status: "待通报",
          sourceEscalationId: escalation.id,
          linkedPromiseIds: overduePromiseIds,
          createdAt: format(today, "yyyy-MM-dd HH:mm:ss"),
          noticedAt: null,
        };
        state.noticeQueue.push(notice);
        escalation.generatedNoticeId = notice.id;
      }

      vendorPendingEscalationCount[vendorId] =
        (vendorPendingEscalationCount[vendorId] || 0) + 1;

      talkInfo.hasEscalation = true;
    }
  });

  return newEscalations;
}

function getTalkChain(state, talkId) {
  const chain = [];
  let currentTalkId = talkId;
  const visited = new Set();

  while (currentTalkId && !visited.has(currentTalkId)) {
    visited.add(currentTalkId);
    const talk = state.talks.find((t) => t.id === currentTalkId);
    if (!talk) break;

    const escalation = state.escalations.find(
      (e) => e.id === talk.sourceEscalationId,
    );
    const prevTalkId = escalation ? escalation.talkId : null;

    chain.unshift({
      talk,
      escalation,
      linkedPromises: state.promises.filter((p) =>
        (talk.linkedPromiseIds || []).includes(p.id),
      ),
    });

    currentTalkId = prevTalkId;
  }

  return chain;
}

function createVendor(state, overrides = {}) {
  const vendor = {
    id: uuidv4(),
    name: overrides.name || "测试厂商科技有限公司",
    unifiedSocialCreditCode: overrides.unifiedSocialCreditCode || `91${Date.now()}${Math.floor(Math.random() * 1000000)}`,
    legalPerson: overrides.legalPerson || "测试法人",
    contactPhone: overrides.contactPhone || "13800000000",
    industry: overrides.industry || "互联网",
    createdAt: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
    ...overrides,
  };
  state.vendors.push(vendor);
  return vendor;
}

function createTalk(state, vendorId, overrides = {}) {
  const talk = {
    id: uuidv4(),
    vendorId,
    reason: overrides.reason || "弹窗诱导",
    participants: overrides.participants || ["监管员A", "厂商联系人"],
    talkTime: overrides.talkTime || format(new Date(), "yyyy-MM-dd HH:mm:ss"),
    remark: overrides.remark || "",
    sourceEscalationId: overrides.sourceEscalationId || null,
    linkedPromiseIds: overrides.linkedPromiseIds || [],
    createdAt: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
  };
  state.talks.push(talk);
  return talk;
}

function createPromise(state, talkId, vendorId, overrides = {}) {
  const promise = {
    id: uuidv4(),
    talkId,
    vendorId,
    content: overrides.content || "测试整改承诺内容",
    deadline: overrides.deadline || format(addDays(new Date(), 7), "yyyy-MM-dd"),
    status: overrides.status || "待整改",
    actualCompletionDate: overrides.actualCompletionDate || null,
    createdAt: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
  };
  state.promises.push(promise);
  return promise;
}

function createTalkWithPromises(state, vendorId, promisesConfig, talkOverrides = {}) {
  const talk = createTalk(state, vendorId, talkOverrides);
  const promises = promisesConfig.map((pc) =>
    createPromise(state, talk.id, vendorId, pc),
  );
  return { talk, promises };
}

function submitEvidence(state, promiseId, submissionDate, overrides = {}) {
  const submission = {
    id: uuidv4(),
    promiseId,
    vendorId: overrides.vendorId || null,
    submitter: overrides.submitter || "厂商联系人",
    submitTime: format(submissionDate, "yyyy-MM-dd HH:mm:ss"),
    description: overrides.description || "整改说明材料",
    materials: overrides.materials || [
      { name: "整改说明.pdf", type: "pdf", size: 1024 },
    ],
    createdAt: format(submissionDate, "yyyy-MM-dd HH:mm:ss"),
  };
  state.evidenceSubmissions.push(submission);
  return submission;
}

function createVerification(state, promiseId, submissionId, result, verifyDate, overrides = {}) {
  const verification = {
    id: uuidv4(),
    promiseId,
    evidenceSubmissionId: submissionId,
    result,
    verifier: overrides.verifier || "监管员A",
    verifyTime: format(verifyDate, "yyyy-MM-dd HH:mm:ss"),
    remark: overrides.remark || (result === "通过" ? "核验通过" : "核验不通过"),
    createdAt: format(verifyDate, "yyyy-MM-dd HH:mm:ss"),
  };
  state.verificationRecords.push(verification);
  return verification;
}

module.exports = {
  createFreshState,
  isPromiseOverdue,
  getFirstTimePassRate,
  autoCheckOverdue,
  getTalkChain,
  createVendor,
  createTalk,
  createPromise,
  createTalkWithPromises,
  submitEvidence,
  createVerification,
  TALK_REASONS,
  PROMISE_STATUS,
  ESCALATION_TYPES,
  uuidv4,
};
