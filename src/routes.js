const express = require("express");
const { format, addDays, parseISO, startOfDay, isBefore } = require("date-fns");
const {
  state,
  TALK_REASONS,
  PROMISE_STATUS,
  ESCALATION_TYPES,
  TALK_DRAFT_STATUS,
  NOTICE_STATUS,
  autoCheckOverdue,
  getFirstTimePassRate,
  createEscalationActions,
  getSecondaryEscalationStats,
  getTalkChain,
  uuidv4,
} = require("./store");

const router = express.Router();

router.use((req, res, next) => {
  autoCheckOverdue();
  next();
});

router.get("/meta/reasons", (req, res) => {
  res.json({ code: 0, data: TALK_REASONS });
});

router.get("/meta/promise-statuses", (req, res) => {
  res.json({ code: 0, data: PROMISE_STATUS });
});

router.get("/meta/escalation-types", (req, res) => {
  res.json({ code: 0, data: ESCALATION_TYPES });
});

router.get("/vendors", (req, res) => {
  const { name, industry } = req.query;
  let result = [...state.vendors];
  if (name) {
    result = result.filter((v) => v.name.includes(name));
  }
  if (industry) {
    result = result.filter((v) => v.industry.includes(industry));
  }
  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ code: 0, data: result, total: result.length });
});

router.get("/vendors/:id", (req, res) => {
  const vendor = state.vendors.find((v) => v.id === req.params.id);
  if (!vendor) {
    return res.status(404).json({ code: 1, message: "厂商不存在" });
  }
  res.json({ code: 0, data: vendor });
});

router.post("/vendors", (req, res) => {
  const { name, unifiedSocialCreditCode, legalPerson, contactPhone, industry } =
    req.body;
  if (!name || !unifiedSocialCreditCode) {
    return res
      .status(400)
      .json({ code: 1, message: "厂商名称和统一社会信用代码必填" });
  }
  const exists = state.vendors.some(
    (v) => v.unifiedSocialCreditCode === unifiedSocialCreditCode,
  );
  if (exists) {
    return res
      .status(400)
      .json({ code: 1, message: "该统一社会信用代码已存在" });
  }
  const vendor = {
    id: uuidv4(),
    name,
    unifiedSocialCreditCode,
    legalPerson: legalPerson || "",
    contactPhone: contactPhone || "",
    industry: industry || "",
    createdAt: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
  };
  state.vendors.push(vendor);
  res.status(201).json({ code: 0, data: vendor });
});

router.put("/vendors/:id", (req, res) => {
  const idx = state.vendors.findIndex((v) => v.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ code: 1, message: "厂商不存在" });
  }
  const { name, unifiedSocialCreditCode, legalPerson, contactPhone, industry } =
    req.body;
  if (
    unifiedSocialCreditCode &&
    unifiedSocialCreditCode !== state.vendors[idx].unifiedSocialCreditCode
  ) {
    const exists = state.vendors.some(
      (v) => v.unifiedSocialCreditCode === unifiedSocialCreditCode,
    );
    if (exists) {
      return res
        .status(400)
        .json({ code: 1, message: "该统一社会信用代码已存在" });
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

router.delete("/vendors/:id", (req, res) => {
  const idx = state.vendors.findIndex((v) => v.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ code: 1, message: "厂商不存在" });
  }
  const hasTalks = state.talks.some((t) => t.vendorId === req.params.id);
  if (hasTalks) {
    return res
      .status(400)
      .json({ code: 1, message: "该厂商存在约谈记录，无法删除" });
  }
  state.vendors.splice(idx, 1);
  res.json({ code: 0, message: "删除成功" });
});

router.get("/vendors/:id/history", (req, res) => {
  const vendor = state.vendors.find((v) => v.id === req.params.id);
  if (!vendor) {
    return res.status(404).json({ code: 1, message: "厂商不存在" });
  }
  const talks = state.talks
    .filter((t) => t.vendorId === req.params.id)
    .sort((a, b) => new Date(b.talkTime) - new Date(a.talkTime))
    .map((talk) => {
      const talkPromises = state.promises
        .filter((p) => p.talkId === talk.id)
        .map((p) => ({
          ...p,
          evidenceCount: state.evidenceSubmissions.filter(
            (e) => e.promiseId === p.id,
          ).length,
          verificationCount: state.verificationRecords.filter(
            (v) => v.promiseId === p.id,
          ).length,
          latestVerification: (() => {
            const records = state.verificationRecords
              .filter((v) => v.promiseId === p.id)
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            return records.length > 0 ? records[0] : null;
          })(),
        }));
      const talkEscalations = state.escalations.filter(
        (e) => e.talkId === talk.id,
      );
      const completedOnTime = talkPromises.filter(
        (p) => p.status === "按期完成",
      ).length;
      const overdue = talkPromises.filter(
        (p) => p.status === "逾期未完成",
      ).length;
      const pendingVerify = talkPromises.filter(
        (p) => p.status === "待核验",
      ).length;
      return {
        ...talk,
        promises: talkPromises,
        escalations: talkEscalations,
        summary: {
          totalPromises: talkPromises.length,
          completedOnTime,
          overdue,
          pendingVerify,
          inProgress: talkPromises.filter((p) => p.status === "整改中").length,
          pending: talkPromises.filter((p) => p.status === "待整改").length,
        },
      };
    });

  const allPromises = state.promises.filter(
    (p) => p.vendorId === req.params.id,
  );
  const allEscalations = state.escalations.filter(
    (e) => e.vendorId === req.params.id,
  );
  const totalPromises = allPromises.length;
  const onTimeCount = allPromises.filter((p) => p.status === "按期完成").length;
  const ftp = getFirstTimePassRate(allPromises);

  res.json({
    code: 0,
    data: {
      vendor,
      overview: {
        talkCount: talks.length,
        totalPromises,
        onTimeCompletionRate:
          totalPromises > 0
            ? Number(((onTimeCount / totalPromises) * 100).toFixed(2))
            : 0,
        firstTimePassRate: ftp.rate,
        firstTimePassDetail: ftp,
        escalationCount: allEscalations.length,
        pendingEscalationCount: allEscalations.filter((e) => !e.handled).length,
        pendingVerificationCount: allPromises.filter(
          (p) => p.status === "待核验",
        ).length,
      },
      talks,
    },
  });
});

router.get("/talks", (req, res) => {
  const { vendorId, reason } = req.query;
  let result = [...state.talks];
  if (vendorId) {
    result = result.filter((t) => t.vendorId === vendorId);
  }
  if (reason) {
    result = result.filter((t) => t.reason === reason);
  }
  result.sort((a, b) => new Date(b.talkTime) - new Date(a.talkTime));

  const data = result.map((talk) => {
    const vendor = state.vendors.find((v) => v.id === talk.vendorId);
    const talkPromises = state.promises.filter((p) => p.talkId === talk.id);
    return {
      ...talk,
      vendorName: vendor ? vendor.name : "",
      promiseCount: talkPromises.length,
      overduePromiseCount: talkPromises.filter((p) => p.status === "逾期未完成")
        .length,
      pendingVerifyCount: talkPromises.filter((p) => p.status === "待核验")
        .length,
    };
  });

  res.json({ code: 0, data, total: data.length });
});

router.post("/talks", (req, res) => {
  const { vendorId, reason, participants, talkTime, remark, promises } =
    req.body;

  if (
    !vendorId ||
    !reason ||
    !participants ||
    !talkTime ||
    !promises ||
    !Array.isArray(promises)
  ) {
    return res.status(400).json({
      code: 1,
      message:
        "参数不完整：vendorId、reason、participants、talkTime、promises 必填",
    });
  }
  if (!TALK_REASONS.includes(reason)) {
    return res
      .status(400)
      .json({ code: 1, message: `约谈事由必须是：${TALK_REASONS.join("、")}` });
  }
  if (!Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({ code: 1, message: "参加人不能为空" });
  }
  if (promises.length === 0) {
    return res.status(400).json({ code: 1, message: "整改承诺不能为空" });
  }

  const vendor = state.vendors.find((v) => v.id === vendorId);
  if (!vendor) {
    return res.status(404).json({ code: 1, message: "厂商不存在" });
  }

  for (let i = 0; i < promises.length; i++) {
    const p = promises[i];
    if (!p.content || !p.deadline) {
      return res
        .status(400)
        .json({ code: 1, message: `第${i + 1}条整改承诺内容和完成期限必填` });
    }
  }

  const talkId = uuidv4();
  const talk = {
    id: talkId,
    vendorId,
    reason,
    participants,
    talkTime,
    remark: remark || "",
    createdAt: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
  };
  state.talks.push(talk);

  const createdPromises = promises.map((p) => ({
    id: uuidv4(),
    talkId,
    vendorId,
    content: p.content,
    deadline: p.deadline,
    status: "待整改",
    actualCompletionDate: null,
    createdAt: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
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

router.get("/promises", (req, res) => {
  const { vendorId, talkId, status } = req.query;
  let result = [...state.promises];
  if (vendorId) result = result.filter((p) => p.vendorId === vendorId);
  if (talkId) result = result.filter((p) => p.talkId === talkId);
  if (status) result = result.filter((p) => p.status === status);
  result.sort((a, b) => {
    const order = {
      待整改: 0,
      整改中: 1,
      待核验: 2,
      逾期未完成: 3,
      按期完成: 4,
    };
    return (order[a.status] || 0) - (order[b.status] || 0);
  });

  const data = result.map((p) => {
    const vendor = state.vendors.find((v) => v.id === p.vendorId);
    const talk = state.talks.find((t) => t.id === p.talkId);
    const escalation = state.escalations.find((e) => e.promiseId === p.id);
    const evidenceList = state.evidenceSubmissions.filter(
      (e) => e.promiseId === p.id,
    );
    const verificationList = state.verificationRecords.filter(
      (v) => v.promiseId === p.id,
    );
    const latestVerification =
      verificationList.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      )[0] || null;
    return {
      ...p,
      vendorName: vendor ? vendor.name : "",
      talkReason: talk ? talk.reason : "",
      talkTime: talk ? talk.talkTime : "",
      hasEscalation: !!escalation,
      escalationType: escalation ? escalation.type : null,
      evidenceCount: evidenceList.length,
      verificationCount: verificationList.length,
      latestVerificationResult: latestVerification
        ? latestVerification.result
        : null,
      latestVerificationRemark: latestVerification
        ? latestVerification.remark
        : null,
    };
  });

  res.json({ code: 0, data, total: data.length });
});

function buildPromiseTimeline(promise, evidences, verifications, escalation) {
  const events = [];
  events.push({
    type: "create",
    time: promise.createdAt,
    title: "承诺创建",
    content: `约谈登记，承诺内容：${promise.content}，完成期限：${promise.deadline}`,
  });
  evidences
    .slice()
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .forEach((e) => {
      events.push({
        type: "evidence",
        time: e.submitTime,
        title: "提交佐证材料",
        content: e.description,
        materials: e.materials,
        submitter: e.submitter,
      });
    });
  verifications
    .slice()
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .forEach((v) => {
      events.push({
        type: v.result === "通过" ? "verify-pass" : "verify-reject",
        time: v.verifyTime,
        title: v.result === "通过" ? "核验通过" : "核验不通过",
        content: v.remark,
        verifier: v.verifier,
      });
    });
  if (escalation) {
    events.push({
      type: "escalation",
      time: escalation.triggeredAt,
      title: `升级处置：${escalation.type}`,
      content: escalation.remark,
    });
  }
  if (promise.actualCompletionDate) {
    events.push({
      type: "complete",
      time: promise.actualCompletionDate + " 00:00:00",
      title: "承诺按期完成",
      content: `实际完成日期：${promise.actualCompletionDate}`,
    });
  }
  return events.sort((a, b) => new Date(a.time) - new Date(b.time));
}

router.post("/promises/:id/evidence", (req, res) => {
  const promise = state.promises.find((p) => p.id === req.params.id);
  if (!promise) {
    return res.status(404).json({ code: 1, message: "承诺记录不存在" });
  }

  const { submitter, description, materials } = req.body;

  if (!submitter || !description) {
    return res.status(400).json({
      code: 1,
      message: "参数不完整：submitter（提交人）、description（整改说明）必填",
    });
  }

  if (promise.status === "按期完成") {
    return res.status(400).json({
      code: 1,
      message: "该承诺已按期完成，无需再提交佐证材料",
    });
  }

  const submission = {
    id: uuidv4(),
    promiseId: promise.id,
    vendorId: promise.vendorId,
    submitter,
    submitTime: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
    description,
    materials: Array.isArray(materials) ? materials : [],
    createdAt: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
  };
  state.evidenceSubmissions.push(submission);

  if (promise.status === "待整改" || promise.status === "整改中") {
    promise.status = "待核验";
  } else if (promise.status === "逾期未完成") {
    promise.status = "待核验";
  }

  autoCheckOverdue();

  res.status(201).json({
    code: 0,
    data: {
      submission,
      promise,
    },
  });
});

router.post("/promises/:id/verify", (req, res) => {
  const promise = state.promises.find((p) => p.id === req.params.id);
  if (!promise) {
    return res.status(404).json({ code: 1, message: "承诺记录不存在" });
  }

  const { result, verifier, remark, evidenceSubmissionId } = req.body;

  if (!result || !verifier) {
    return res.status(400).json({
      code: 1,
      message: "参数不完整：result（通过/不通过）、verifier（核验人）必填",
    });
  }

  if (result !== "通过" && result !== "不通过") {
    return res.status(400).json({
      code: 1,
      message: 'result 只能是 "通过" 或 "不通过"',
    });
  }

  if (promise.status !== "待核验") {
    return res.status(400).json({
      code: 1,
      message: `当前承诺状态为"${promise.status}"，只有"待核验"状态才能执行核验操作`,
    });
  }

  let submissionId = evidenceSubmissionId;
  if (!submissionId) {
    const latest = state.evidenceSubmissions
      .filter((e) => e.promiseId === promise.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    if (latest) submissionId = latest.id;
  }

  const verification = {
    id: uuidv4(),
    promiseId: promise.id,
    evidenceSubmissionId: submissionId || null,
    result,
    verifier,
    verifyTime: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
    remark:
      remark || (result === "通过" ? "核验通过，整改符合要求" : "核验不通过"),
    createdAt: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
  };
  state.verificationRecords.push(verification);

  if (result === "通过") {
    const now = new Date();
    const deadlineDate = parseISO(promise.deadline);
    const todayStart = startOfDay(now);
    const deadlineStart = startOfDay(deadlineDate);

    if (
      promise.status === "待核验" &&
      (isBefore(deadlineStart, todayStart) || isNaN(deadlineDate.getTime()))
    ) {
    } else {
      promise.status = "按期完成";
      promise.actualCompletionDate = format(now, "yyyy-MM-dd");
    }
  } else {
    promise.status = "整改中";
    promise.actualCompletionDate = null;
  }

  autoCheckOverdue();

  res.json({
    code: 0,
    data: {
      verification,
      promise,
    },
  });
});

router.put("/promises/:id/status", (req, res) => {
  const { status, actualCompletionDate } = req.body;
  if (!PROMISE_STATUS.includes(status)) {
    return res
      .status(400)
      .json({ code: 1, message: `状态必须是：${PROMISE_STATUS.join("、")}` });
  }

  const promise = state.promises.find((p) => p.id === req.params.id);
  if (!promise) {
    return res.status(404).json({ code: 1, message: "承诺记录不存在" });
  }

  const validTransitions = {
    待整改: ["整改中", "待核验", "按期完成", "逾期未完成"],
    整改中: ["待核验", "按期完成", "逾期未完成", "待整改"],
    待核验: ["整改中", "按期完成", "逾期未完成"],
    按期完成: [],
    逾期未完成: ["整改中", "待核验", "按期完成"],
  };

  if (!validTransitions[promise.status].includes(status)) {
    return res.status(400).json({
      code: 1,
      message: `状态流转不合法：从"${promise.status}"不能变更为"${status}"`,
    });
  }

  promise.status = status;
  if (status === "按期完成") {
    promise.actualCompletionDate =
      actualCompletionDate || format(new Date(), "yyyy-MM-dd");
  } else if (status !== "按期完成") {
    promise.actualCompletionDate = null;
  }

  if (status === "逾期未完成") {
    const talkHasEscalation = state.escalations.some(
      (e) => e.talkId === promise.talkId,
    );
    if (!talkHasEscalation) {
      const vendorExistingEscalations = state.escalations.filter(
        (e) => e.vendorId === promise.vendorId,
      ).length;
      const escalationType =
        vendorExistingEscalations >= 1 ? "通报批评" : "再次约谈";
      const escalation = {
        id: uuidv4(),
        vendorId: promise.vendorId,
        promiseId: promise.id,
        talkId: promise.talkId,
        type: escalationType,
        triggeredAt: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
        remark: `承诺"${promise.content}"逾期未完成，${vendorExistingEscalations >= 1 ? "该厂商已有逾期升级处置记录，升级为通报批评" : "触发再次约谈"}`,
        handled: false,
        generatedTalkDraftId: null,
        generatedNoticeId: null,
      };
      state.escalations.push(escalation);

      const overduePromises = state.promises.filter(
        (p) => p.talkId === promise.talkId && p.status === "逾期未完成",
      );
      createEscalationActions(escalation, overduePromises);
    }
  }

  autoCheckOverdue();

  res.json({ code: 0, data: promise });
});

router.get("/escalations", (req, res) => {
  const { vendorId, type, handled } = req.query;
  let result = [...state.escalations];
  if (vendorId) result = result.filter((e) => e.vendorId === vendorId);
  if (type) result = result.filter((e) => e.type === type);
  if (handled !== undefined) {
    result = result.filter(
      (e) => e.handled === (handled === "true" || handled === true),
    );
  }
  result.sort((a, b) => new Date(b.triggeredAt) - new Date(a.triggeredAt));

  const data = result.map((e) => {
    const vendor = state.vendors.find((v) => v.id === e.vendorId);
    const promise = state.promises.find((p) => p.id === e.promiseId);
    const talk = state.talks.find((t) => t.id === e.talkId);
    const talkDraft = state.talkDrafts.find(
      (d) => d.id === e.generatedTalkDraftId,
    );
    const notice = state.noticeQueue.find((n) => n.id === e.generatedNoticeId);
    return {
      ...e,
      vendorName: vendor ? vendor.name : "",
      promiseContent: promise ? promise.content : "",
      talkReason: talk ? talk.reason : "",
      talkDraft: talkDraft || null,
      notice: notice || null,
    };
  });

  res.json({ code: 0, data, total: data.length });
});

router.put("/escalations/:id/handle", (req, res) => {
  const { handled, handleRemark } = req.body;
  const escalation = state.escalations.find((e) => e.id === req.params.id);
  if (!escalation) {
    return res.status(404).json({ code: 1, message: "升级处置记录不存在" });
  }
  escalation.handled = handled !== undefined ? handled : true;
  if (handleRemark !== undefined) {
    escalation.handleRemark = handleRemark;
  }
  escalation.handledAt = format(new Date(), "yyyy-MM-dd HH:mm:ss");
  res.json({ code: 0, data: escalation });
});

router.get("/stats/by-vendor", (req, res) => {
  const data = state.vendors
    .map((vendor) => {
      const vendorTalks = state.talks.filter((t) => t.vendorId === vendor.id);
      const vendorPromises = state.promises.filter(
        (p) => p.vendorId === vendor.id,
      );
      const vendorEscalations = state.escalations.filter(
        (e) => e.vendorId === vendor.id,
      );
      const ftp = getFirstTimePassRate(vendorPromises);

      const talkCount = vendorTalks.length;
      const totalPromises = vendorPromises.length;
      const onTimeCount = vendorPromises.filter(
        (p) => p.status === "按期完成",
      ).length;
      const overdueCount = vendorPromises.filter(
        (p) => p.status === "逾期未完成",
      ).length;
      const pendingVerifyCount = vendorPromises.filter(
        (p) => p.status === "待核验",
      ).length;

      const reasonStats = {};
      TALK_REASONS.forEach((r) => {
        reasonStats[r] = vendorTalks.filter((t) => t.reason === r).length;
      });

      return {
        vendorId: vendor.id,
        vendorName: vendor.name,
        industry: vendor.industry,
        talkCount,
        totalPromises,
        onTimeCount,
        overdueCount,
        pendingVerifyCount,
        onTimeCompletionRate:
          totalPromises > 0
            ? Number(((onTimeCount / totalPromises) * 100).toFixed(2))
            : 0,
        firstTimePassRate: ftp.rate,
        firstTimePassDetail: ftp,
        escalationCount: vendorEscalations.length,
        reTalkCount: vendorEscalations.filter((e) => e.type === "再次约谈")
          .length,
        通报Count: vendorEscalations.filter((e) => e.type === "通报批评")
          .length,
        reasonBreakdown: reasonStats,
        lastTalkTime:
          vendorTalks.length > 0
            ? vendorTalks.reduce(
                (max, t) =>
                  new Date(t.talkTime) > new Date(max) ? t.talkTime : max,
                vendorTalks[0].talkTime,
              )
            : null,
      };
    })
    .sort((a, b) => b.talkCount - a.talkCount);

  const overallFtp = getFirstTimePassRate();
  res.json({
    code: 0,
    data,
    summary: {
      totalVendors: state.vendors.length,
      totalTalks: state.talks.length,
      totalPromises: state.promises.length,
      overallOnTimeRate:
        state.promises.length > 0
          ? Number(
              (
                (state.promises.filter((p) => p.status === "按期完成").length /
                  state.promises.length) *
                100
              ).toFixed(2),
            )
          : 0,
      overallFirstTimePassRate: overallFtp.rate,
      overallFirstTimePassDetail: overallFtp,
      totalEscalations: state.escalations.length,
      totalPendingVerification: state.promises.filter(
        (p) => p.status === "待核验",
      ).length,
    },
  });
});

router.get("/stats/by-reason", (req, res) => {
  const data = TALK_REASONS.map((reason) => {
    const talksByReason = state.talks.filter((t) => t.reason === reason);
    const vendorsInvolved = new Set(talksByReason.map((t) => t.vendorId)).size;
    const promisesByReason = state.promises.filter((p) => {
      const talk = state.talks.find((t) => t.id === p.talkId);
      return talk && talk.reason === reason;
    });
    const escalationsByReason = state.escalations.filter((e) => {
      const talk = state.talks.find((t) => t.id === e.talkId);
      return talk && talk.reason === reason;
    });
    const ftp = getFirstTimePassRate(promisesByReason);

    const onTimeCount = promisesByReason.filter(
      (p) => p.status === "按期完成",
    ).length;
    const overdueCount = promisesByReason.filter(
      (p) => p.status === "逾期未完成",
    ).length;
    const pendingVerifyCount = promisesByReason.filter(
      (p) => p.status === "待核验",
    ).length;

    return {
      reason,
      talkCount: talksByReason.length,
      vendorsInvolved,
      totalPromises: promisesByReason.length,
      onTimeCount,
      overdueCount,
      pendingVerifyCount,
      onTimeCompletionRate:
        promisesByReason.length > 0
          ? Number(((onTimeCount / promisesByReason.length) * 100).toFixed(2))
          : 0,
      firstTimePassRate: ftp.rate,
      firstTimePassDetail: ftp,
      escalationCount: escalationsByReason.length,
      reTalkCount: escalationsByReason.filter((e) => e.type === "再次约谈")
        .length,
      通报Count: escalationsByReason.filter((e) => e.type === "通报批评")
        .length,
    };
  });

  const overallFtp = getFirstTimePassRate();
  res.json({
    code: 0,
    data,
    summary: {
      totalTalks: state.talks.length,
      totalPromises: state.promises.length,
      overallOnTimeRate:
        state.promises.length > 0
          ? Number(
              (
                (state.promises.filter((p) => p.status === "按期完成").length /
                  state.promises.length) *
                100
              ).toFixed(2),
            )
          : 0,
      overallFirstTimePassRate: overallFtp.rate,
      overallFirstTimePassDetail: overallFtp,
      totalPendingVerification: state.promises.filter(
        (p) => p.status === "待核验",
      ).length,
    },
  });
});

router.get("/stats/overview", (req, res) => {
  const totalTalks = state.talks.length;
  const totalPromises = state.promises.length;
  const statusBreakdown = {};
  PROMISE_STATUS.forEach((s) => {
    statusBreakdown[s] = state.promises.filter((p) => p.status === s).length;
  });

  const totalEscalations = state.escalations.length;
  const escalationBreakdown = {};
  ESCALATION_TYPES.forEach((t) => {
    escalationBreakdown[t] = state.escalations.filter(
      (e) => e.type === t,
    ).length;
  });
  escalationBreakdown["未处理"] = state.escalations.filter(
    (e) => !e.handled,
  ).length;

  const reasonBreakdown = {};
  TALK_REASONS.forEach((r) => {
    reasonBreakdown[r] = state.talks.filter((t) => t.reason === r).length;
  });

  const multiTalkVendors = state.vendors
    .map((v) => ({
      vendor: v,
      count: state.talks.filter((t) => t.vendorId === v.id).length,
    }))
    .filter((x) => x.count >= 2)
    .sort((a, b) => b.count - a.count)
    .map((x) => ({
      vendorId: x.vendor.id,
      vendorName: x.vendor.name,
      industry: x.vendor.industry,
      talkCount: x.count,
    }));

  const today = new Date();
  const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const last30Talks = state.talks.filter(
    (t) => new Date(t.talkTime) >= last30Days,
  ).length;
  const last30Escalations = state.escalations.filter(
    (e) => new Date(e.triggeredAt) >= last30Days,
  ).length;
  const last30Verifications = state.verificationRecords.filter(
    (v) => new Date(v.createdAt) >= last30Days,
  ).length;
  const last30Pass = state.verificationRecords.filter(
    (v) => new Date(v.createdAt) >= last30Days && v.result === "通过",
  ).length;

  const approachingDeadline = state.promises
    .filter(
      (p) =>
        p.status === "待整改" || p.status === "整改中" || p.status === "待核验",
    )
    .filter((p) => {
      const deadline = new Date(p.deadline);
      const diffDays = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 7;
    })
    .map((p) => {
      const vendor = state.vendors.find((v) => v.id === p.vendorId);
      const deadline = new Date(p.deadline);
      const daysLeft = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
      const evidenceCount = state.evidenceSubmissions.filter(
        (e) => e.promiseId === p.id,
      ).length;
      return {
        id: p.id,
        content: p.content,
        deadline: p.deadline,
        daysLeft,
        status: p.status,
        vendorName: vendor ? vendor.name : "",
        vendorId: p.vendorId,
        evidenceCount,
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const ftp = getFirstTimePassRate();

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
        last30DaysVerifications: last30Verifications,
        last30DaysVerificationPassRate:
          last30Verifications > 0
            ? Number(((last30Pass / last30Verifications) * 100).toFixed(2))
            : 0,
      },
      approachingDeadline,
      overallOnTimeRate:
        totalPromises > 0
          ? Number(
              (
                (state.promises.filter((p) => p.status === "按期完成").length /
                  totalPromises) *
                100
              ).toFixed(2),
            )
          : 0,
      firstTimePassRate: ftp.rate,
      firstTimePassDetail: ftp,
      totalEvidenceSubmissions: state.evidenceSubmissions.length,
      totalVerifications: state.verificationRecords.length,
      pendingVerificationCount: statusBreakdown["待核验"] || 0,
      secondaryEscalationStats: getSecondaryEscalationStats(),
    },
  });
});

router.get("/meta/talk-draft-statuses", (req, res) => {
  res.json({ code: 0, data: TALK_DRAFT_STATUS });
});

router.get("/meta/notice-statuses", (req, res) => {
  res.json({ code: 0, data: NOTICE_STATUS });
});

router.get("/talk-drafts", (req, res) => {
  const { vendorId, status, sourceEscalationId } = req.query;
  let result = [...state.talkDrafts];
  if (vendorId) result = result.filter((d) => d.vendorId === vendorId);
  if (status) result = result.filter((d) => d.status === status);
  if (sourceEscalationId)
    result = result.filter((d) => d.sourceEscalationId === sourceEscalationId);
  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const data = result.map((d) => {
    const vendor = state.vendors.find((v) => v.id === d.vendorId);
    const escalation = state.escalations.find(
      (e) => e.id === d.sourceEscalationId,
    );
    const linkedPromises = state.promises.filter((p) =>
      (d.linkedPromiseIds || []).includes(p.id),
    );
    return {
      ...d,
      vendorName: vendor ? vendor.name : "",
      escalation: escalation || null,
      linkedPromises: linkedPromises.map((p) => ({
        id: p.id,
        content: p.content,
        deadline: p.deadline,
        status: p.status,
      })),
    };
  });

  res.json({ code: 0, data, total: data.length });
});

router.get("/talk-drafts/:id", (req, res) => {
  const draft = state.talkDrafts.find((d) => d.id === req.params.id);
  if (!draft) {
    return res.status(404).json({ code: 1, message: "约谈草稿不存在" });
  }
  const vendor = state.vendors.find((v) => v.id === draft.vendorId);
  const escalation = state.escalations.find(
    (e) => e.id === draft.sourceEscalationId,
  );
  const linkedPromises = state.promises.filter((p) =>
    (draft.linkedPromiseIds || []).includes(p.id),
  );
  res.json({
    code: 0,
    data: {
      ...draft,
      vendor,
      escalation: escalation || null,
      linkedPromises,
    },
  });
});

router.put("/talk-drafts/:id", (req, res) => {
  const draft = state.talkDrafts.find((d) => d.id === req.params.id);
  if (!draft) {
    return res.status(404).json({ code: 1, message: "约谈草稿不存在" });
  }
  const { reason, participants, talkTime, remark, status } = req.body;

  if (status !== undefined && !TALK_DRAFT_STATUS.includes(status)) {
    return res.status(400).json({
      code: 1,
      message: `状态必须是：${TALK_DRAFT_STATUS.join("、")}`,
    });
  }
  if (reason !== undefined && !TALK_REASONS.includes(reason)) {
    return res
      .status(400)
      .json({ code: 1, message: `约谈事由必须是：${TALK_REASONS.join("、")}` });
  }

  if (reason !== undefined) draft.reason = reason;
  if (participants !== undefined) draft.participants = participants;
  if (talkTime !== undefined) draft.talkTime = talkTime;
  if (remark !== undefined) draft.remark = remark;
  if (status !== undefined) draft.status = status;

  res.json({ code: 0, data: draft });
});

router.post("/talk-drafts/:id/confirm", (req, res) => {
  const draft = state.talkDrafts.find((d) => d.id === req.params.id);
  if (!draft) {
    return res.status(404).json({ code: 1, message: "约谈草稿不存在" });
  }
  if (draft.status === "已取消") {
    return res.status(400).json({ code: 1, message: "该草稿已取消，无法确认" });
  }

  const { promises } = req.body;
  if (!promises || !Array.isArray(promises) || promises.length === 0) {
    return res.status(400).json({ code: 1, message: "整改承诺不能为空" });
  }
  for (let i = 0; i < promises.length; i++) {
    const p = promises[i];
    if (!p.content || !p.deadline) {
      return res
        .status(400)
        .json({ code: 1, message: `第${i + 1}条整改承诺内容和完成期限必填` });
    }
  }

  const vendor = state.vendors.find((v) => v.id === draft.vendorId);
  if (!vendor) {
    return res.status(404).json({ code: 1, message: "厂商不存在" });
  }

  const talkId = uuidv4();
  const talk = {
    id: talkId,
    vendorId: draft.vendorId,
    reason: draft.reason,
    participants: draft.participants,
    talkTime: draft.talkTime,
    remark: draft.remark,
    sourceEscalationId: draft.sourceEscalationId,
    linkedPromiseIds: draft.linkedPromiseIds || [],
    createdAt: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
  };
  state.talks.push(talk);

  const createdPromises = promises.map((p) => ({
    id: uuidv4(),
    talkId,
    vendorId: draft.vendorId,
    content: p.content,
    deadline: p.deadline,
    status: "待整改",
    actualCompletionDate: null,
    createdAt: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
  }));
  state.promises.push(...createdPromises);

  draft.status = "已确认";
  draft.confirmedTalkId = talkId;

  const escalation = state.escalations.find(
    (e) => e.id === draft.sourceEscalationId,
  );
  if (escalation) {
    escalation.handled = true;
    escalation.handledAt = format(new Date(), "yyyy-MM-dd HH:mm:ss");
  }

  autoCheckOverdue();

  res.status(201).json({
    code: 0,
    data: {
      talk,
      promises: createdPromises,
      draft,
    },
  });
});

router.put("/talk-drafts/:id/cancel", (req, res) => {
  const draft = state.talkDrafts.find((d) => d.id === req.params.id);
  if (!draft) {
    return res.status(404).json({ code: 1, message: "约谈草稿不存在" });
  }
  if (draft.status === "已确认") {
    return res.status(400).json({ code: 1, message: "该草稿已确认，无法取消" });
  }
  draft.status = "已取消";
  res.json({ code: 0, data: draft });
});

router.get("/notice-queue", (req, res) => {
  const { vendorId, status, sourceEscalationId } = req.query;
  let result = [...state.noticeQueue];
  if (vendorId) result = result.filter((n) => n.vendorId === vendorId);
  if (status) result = result.filter((n) => n.status === status);
  if (sourceEscalationId)
    result = result.filter((n) => n.sourceEscalationId === sourceEscalationId);
  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const data = result.map((n) => {
    const vendor = state.vendors.find((v) => v.id === n.vendorId);
    const promise = state.promises.find((p) => p.id === n.promiseId);
    const talk = state.talks.find((t) => t.id === n.talkId);
    const escalation = state.escalations.find(
      (e) => e.id === n.sourceEscalationId,
    );
    const linkedPromises = state.promises.filter((p) =>
      (n.linkedPromiseIds || []).includes(p.id),
    );
    return {
      ...n,
      vendorName: vendor ? vendor.name : "",
      promiseContent: promise ? promise.content : "",
      talkReason: talk ? talk.reason : "",
      escalation: escalation || null,
      linkedPromises: linkedPromises.map((p) => ({
        id: p.id,
        content: p.content,
        deadline: p.deadline,
        status: p.status,
      })),
    };
  });

  res.json({ code: 0, data, total: data.length });
});

router.get("/notice-queue/:id", (req, res) => {
  const notice = state.noticeQueue.find((n) => n.id === req.params.id);
  if (!notice) {
    return res.status(404).json({ code: 1, message: "通报记录不存在" });
  }
  const vendor = state.vendors.find((v) => v.id === notice.vendorId);
  const promise = state.promises.find((p) => p.id === notice.promiseId);
  const talk = state.talks.find((t) => t.id === notice.talkId);
  const escalation = state.escalations.find(
    (e) => e.id === notice.sourceEscalationId,
  );
  const linkedPromises = state.promises.filter((p) =>
    (notice.linkedPromiseIds || []).includes(p.id),
  );
  res.json({
    code: 0,
    data: {
      ...notice,
      vendor,
      promise,
      talk,
      escalation: escalation || null,
      linkedPromises,
    },
  });
});

router.put("/notice-queue/:id", (req, res) => {
  const notice = state.noticeQueue.find((n) => n.id === req.params.id);
  if (!notice) {
    return res.status(404).json({ code: 1, message: "通报记录不存在" });
  }
  const { title, content, status } = req.body;

  if (status !== undefined && !NOTICE_STATUS.includes(status)) {
    return res
      .status(400)
      .json({ code: 1, message: `状态必须是：${NOTICE_STATUS.join("、")}` });
  }

  if (title !== undefined) notice.title = title;
  if (content !== undefined) notice.content = content;
  if (status !== undefined) {
    notice.status = status;
    if (status === "已通报" && !notice.noticedAt) {
      notice.noticedAt = format(new Date(), "yyyy-MM-dd HH:mm:ss");
    }
  }

  res.json({ code: 0, data: notice });
});

router.post("/notice-queue/:id/issue", (req, res) => {
  const notice = state.noticeQueue.find((n) => n.id === req.params.id);
  if (!notice) {
    return res.status(404).json({ code: 1, message: "通报记录不存在" });
  }
  if (notice.status === "已取消") {
    return res.status(400).json({ code: 1, message: "该通报已取消，无法发布" });
  }
  if (notice.status === "已通报") {
    return res.status(400).json({ code: 1, message: "该通报已发布" });
  }

  notice.status = "已通报";
  notice.noticedAt = format(new Date(), "yyyy-MM-dd HH:mm:ss");

  const escalation = state.escalations.find(
    (e) => e.id === notice.sourceEscalationId,
  );
  if (escalation) {
    escalation.handled = true;
    escalation.handledAt = format(new Date(), "yyyy-MM-dd HH:mm:ss");
  }

  res.json({ code: 0, data: notice });
});

router.put("/notice-queue/:id/cancel", (req, res) => {
  const notice = state.noticeQueue.find((n) => n.id === req.params.id);
  if (!notice) {
    return res.status(404).json({ code: 1, message: "通报记录不存在" });
  }
  if (notice.status === "已通报") {
    return res.status(400).json({ code: 1, message: "该通报已发布，无法取消" });
  }
  notice.status = "已取消";
  res.json({ code: 0, data: notice });
});

router.get("/talks/:id/chain", (req, res) => {
  const talk = state.talks.find((t) => t.id === req.params.id);
  if (!talk) {
    return res.status(404).json({ code: 1, message: "约谈记录不存在" });
  }

  const chain = getTalkChain(req.params.id);
  const chainWithDetails = chain.map((item) => {
    const vendor = state.vendors.find((v) => v.id === item.talk.vendorId);
    const prevTalk = item.escalation
      ? state.talks.find((t) => t.id === item.escalation.talkId)
      : null;
    return {
      talk: {
        ...item.talk,
        vendorName: vendor ? vendor.name : "",
      },
      escalation: item.escalation || null,
      linkedPromises: item.linkedPromises,
      prevTalk: prevTalk
        ? {
            id: prevTalk.id,
            reason: prevTalk.reason,
            talkTime: prevTalk.talkTime,
          }
        : null,
    };
  });

  res.json({ code: 0, data: chainWithDetails });
});

router.get("/stats/secondary-escalation", (req, res) => {
  const stats = getSecondaryEscalationStats();
  res.json({ code: 0, data: stats });
});

router.get("/promises/:id/talk-chain", (req, res) => {
  const promise = state.promises.find((p) => p.id === req.params.id);
  if (!promise) {
    return res.status(404).json({ code: 1, message: "承诺记录不存在" });
  }

  const chain = getTalkChain(promise.talkId);
  const chainWithDetails = chain.map((item) => {
    const vendor = state.vendors.find((v) => v.id === item.talk.vendorId);
    return {
      talk: {
        ...item.talk,
        vendorName: vendor ? vendor.name : "",
      },
      escalation: item.escalation || null,
      linkedPromises: item.linkedPromises,
    };
  });

  const relatedEscalations = state.escalations
    .filter(
      (e) =>
        e.promiseId === promise.id ||
        (e.linkedPromiseIds && e.linkedPromiseIds.includes(promise.id)),
    )
    .sort((a, b) => new Date(a.triggeredAt) - new Date(b.triggeredAt));

  res.json({
    code: 0,
    data: {
      promise,
      talkChain: chainWithDetails,
      relatedEscalations,
    },
  });
});

router.get("/talks/:id", (req, res) => {
  const talk = state.talks.find((t) => t.id === req.params.id);
  if (!talk) {
    return res.status(404).json({ code: 1, message: "约谈记录不存在" });
  }
  const vendor = state.vendors.find((v) => v.id === talk.vendorId);
  const talkPromises = state.promises
    .filter((p) => p.talkId === talk.id)
    .map((p) => ({
      ...p,
      evidenceSubmissions: state.evidenceSubmissions
        .filter((e) => e.promiseId === p.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      verificationRecords: state.verificationRecords
        .filter((v) => v.promiseId === p.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    }));
  const talkEscalations = state.escalations.filter((e) => e.talkId === talk.id);
  const sourceEscalation = talk.sourceEscalationId
    ? state.escalations.find((e) => e.id === talk.sourceEscalationId)
    : null;
  const linkedPromises = talk.linkedPromiseIds
    ? state.promises.filter((p) => talk.linkedPromiseIds.includes(p.id))
    : [];
  const talkChain = getTalkChain(talk.id);
  res.json({
    code: 0,
    data: {
      ...talk,
      vendor,
      promises: talkPromises,
      escalations: talkEscalations,
      sourceEscalation: sourceEscalation || null,
      linkedPromises,
      talkChain,
    },
  });
});

router.get("/promises/:id", (req, res) => {
  const promise = state.promises.find((p) => p.id === req.params.id);
  if (!promise) {
    return res.status(404).json({ code: 1, message: "承诺记录不存在" });
  }
  const vendor = state.vendors.find((v) => v.id === promise.vendorId);
  const talk = state.talks.find((t) => t.id === promise.talkId);
  const evidenceSubmissions = state.evidenceSubmissions
    .filter((e) => e.promiseId === promise.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const verificationRecords = state.verificationRecords
    .filter((v) => v.promiseId === promise.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const escalation = state.escalations.find((e) => e.promiseId === promise.id);
  const talkChain = getTalkChain(promise.talkId);
  const linkedInTalks = state.talks
    .filter(
      (t) => t.linkedPromiseIds && t.linkedPromiseIds.includes(promise.id),
    )
    .map((t) => ({
      id: t.id,
      reason: t.reason,
      talkTime: t.talkTime,
      sourceEscalationId: t.sourceEscalationId,
    }));

  const submissionWithVerification = evidenceSubmissions.map((sub) => ({
    ...sub,
    verification:
      verificationRecords.find((v) => v.evidenceSubmissionId === sub.id) ||
      null,
  }));

  res.json({
    code: 0,
    data: {
      ...promise,
      vendorName: vendor ? vendor.name : "",
      vendorIndustry: vendor ? vendor.industry : "",
      talkReason: talk ? talk.reason : "",
      talkTime: talk ? talk.talkTime : "",
      talkRemark: talk ? talk.remark : "",
      escalation: escalation || null,
      evidenceSubmissions: submissionWithVerification,
      verificationRecords,
      timeline: buildPromiseTimeline(
        promise,
        evidenceSubmissions,
        verificationRecords,
        escalation,
      ),
      talkChain,
      linkedInTalks,
    },
  });
});

module.exports = router;
