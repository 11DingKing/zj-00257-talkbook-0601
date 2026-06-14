const { format, addDays } = require("date-fns");
const { v4: uuidv4 } = require("uuid");
const {
  createFreshState,
  createVendor,
  createTalkWithPromises,
  getTalkChain,
  autoCheckOverdue,
} = require("./setup");

describe("同一厂商多次约谈串联（Vendor Talk Chain）", () => {
  let state;

  beforeEach(() => {
    state = createFreshState();
  });

  describe("getTalkChain 基础链路回溯", () => {
    test("单次独立约谈（无前序）的链路只包含自身", () => {
      const vendor = createVendor(state);
      const { talk } = createTalkWithPromises(state, vendor.id, [
        {
          content: "首次约谈承诺",
          deadline: format(addDays(new Date(), 7), "yyyy-MM-dd"),
        },
      ]);

      const chain = getTalkChain(state, talk.id);

      expect(chain).toHaveLength(1);
      expect(chain[0].talk.id).toBe(talk.id);
      expect(chain[0].escalation).toBeUndefined();
      expect(chain[0].linkedPromises).toHaveLength(0);
    });

    test("两次约谈通过升级处置正确串联：约谈1 → 逾期升级 → 约谈2", () => {
      const today = new Date();
      const vendor = createVendor(state);

      const result1 = createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "移除诱导弹窗",
            deadline: format(addDays(today, -30), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        {
          reason: "弹窗诱导",
          talkTime: format(addDays(today, -40), "yyyy-MM-dd HH:mm:ss"),
          remark: "首次约谈",
        },
      );
      const talk1 = result1.talk;
      const promise1 = result1.promises[0];

      autoCheckOverdue(state, today);

      const escalation1 = state.escalations[0];
      expect(escalation1).toBeDefined();
      expect(escalation1.type).toBe("再次约谈");

      const result2 = createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "深度整改并提交自查报告",
            deadline: format(addDays(today, 7), "yyyy-MM-dd"),
            status: "待整改",
          },
        ],
        {
          reason: "整改不到位",
          talkTime: format(addDays(today, -20), "yyyy-MM-dd HH:mm:ss"),
          remark: "因前次逾期升级再次约谈",
          sourceEscalationId: escalation1.id,
          linkedPromiseIds: [promise1.id],
        },
      );
      const talk2 = result2.talk;

      const chain = getTalkChain(state, talk2.id);

      expect(chain).toHaveLength(2);
      expect(chain[0].talk.id).toBe(talk1.id);
      expect(chain[0].escalation).toBeUndefined();
      expect(chain[1].talk.id).toBe(talk2.id);
      expect(chain[1].escalation).not.toBeUndefined();
      expect(chain[1].escalation.id).toBe(escalation1.id);
      expect(chain[1].escalation.talkId).toBe(talk1.id);
      expect(chain[1].linkedPromises.map((p) => p.id)).toContain(promise1.id);
    });

    test("三次约谈完整链路：约谈1→升级→约谈2→再升级→约谈3", () => {
      const today = new Date();
      const vendor = createVendor(state);

      const result1 = createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "优化弹窗频率",
            deadline: format(addDays(today, -100), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        {
          reason: "弹窗诱导",
          talkTime: format(addDays(today, -110), "yyyy-MM-dd HH:mm:ss"),
          remark: "第1次约谈",
        },
      );
      const talk1 = result1.talk;
      const promise1 = result1.promises[0];

      autoCheckOverdue(state, addDays(today, -90));
      const escalation1 = state.escalations.find((e) => e.talkId === talk1.id);

      const result2 = createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "全面清理违规逻辑",
            deadline: format(addDays(today, -60), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        {
          reason: "整改不到位",
          talkTime: format(addDays(today, -80), "yyyy-MM-dd HH:mm:ss"),
          remark: "第2次约谈（升级再次约谈）",
          sourceEscalationId: escalation1.id,
          linkedPromiseIds: [promise1.id],
        },
      );
      const talk2 = result2.talk;
      const promise2 = result2.promises[0];

      autoCheckOverdue(state, addDays(today, -50));
      const escalation2 = state.escalations.find((e) => e.talkId === talk2.id);

      const result3 = createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "建立长效合规机制",
            deadline: format(addDays(today, 10), "yyyy-MM-dd"),
            status: "待整改",
          },
        ],
        {
          reason: "整改不到位",
          talkTime: format(addDays(today, -40), "yyyy-MM-dd HH:mm:ss"),
          remark: "第3次约谈（再次升级）",
          sourceEscalationId: escalation2.id,
          linkedPromiseIds: [promise2.id],
        },
      );
      const talk3 = result3.talk;

      const chain = getTalkChain(state, talk3.id);

      expect(chain).toHaveLength(3);
      expect(chain[0].talk.id).toBe(talk1.id);
      expect(chain[1].talk.id).toBe(talk2.id);
      expect(chain[2].talk.id).toBe(talk3.id);

      expect(chain[0].escalation).toBeUndefined();
      expect(chain[1].escalation.id).toBe(escalation1.id);
      expect(chain[2].escalation.id).toBe(escalation2.id);

      expect(chain[1].linkedPromises.map((p) => p.id)).toContain(promise1.id);
      expect(chain[2].linkedPromises.map((p) => p.id)).toContain(promise2.id);
    });

    test("从链路中间的约谈查询，只回溯到最早起点，不包含后续约谈", () => {
      const today = new Date();
      const vendor = createVendor(state);

      const result1 = createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "整改承诺1",
            deadline: format(addDays(today, -100), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        {
          reason: "弹窗诱导",
          talkTime: format(addDays(today, -110), "yyyy-MM-dd HH:mm:ss"),
        },
      );
      const talk1 = result1.talk;
      const promise1 = result1.promises[0];

      autoCheckOverdue(state, addDays(today, -90));
      const escalation1 = state.escalations[0];

      const result2 = createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "整改承诺2",
            deadline: format(addDays(today, -50), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        {
          reason: "整改不到位",
          talkTime: format(addDays(today, -80), "yyyy-MM-dd HH:mm:ss"),
          sourceEscalationId: escalation1.id,
          linkedPromiseIds: [promise1.id],
        },
      );
      const talk2 = result2.talk;
      const promise2 = result2.promises[0];

      autoCheckOverdue(state, addDays(today, -40));
      const escalation2 = state.escalations[1];

      const result3 = createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "整改承诺3",
            deadline: format(addDays(today, 10), "yyyy-MM-dd"),
            status: "待整改",
          },
        ],
        {
          reason: "整改不到位",
          talkTime: format(addDays(today, -30), "yyyy-MM-dd HH:mm:ss"),
          sourceEscalationId: escalation2.id,
          linkedPromiseIds: [promise2.id],
        },
      );
      const talk3 = result3.talk;

      const chainFromTalk2 = getTalkChain(state, talk2.id);
      expect(chainFromTalk2).toHaveLength(2);
      expect(chainFromTalk2[0].talk.id).toBe(talk1.id);
      expect(chainFromTalk2[1].talk.id).toBe(talk2.id);
      expect(chainFromTalk2.map((c) => c.talk.id)).not.toContain(talk3.id);
    });
  });

  describe("厂商约谈历史聚合查询", () => {
    test("同一厂商多次约谈都能按 vendorId 正确聚合", () => {
      const today = new Date();
      const vendor = createVendor(state, { name: "屡教不改科技有限公司" });
      const otherVendor = createVendor(state, { name: "其他厂商" });

      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "承诺1",
            deadline: format(addDays(today, 7), "yyyy-MM-dd"),
          },
        ],
        {
          reason: "弹窗诱导",
          talkTime: format(addDays(today, -100), "yyyy-MM-dd HH:mm:ss"),
        },
      );
      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "承诺2",
            deadline: format(addDays(today, 7), "yyyy-MM-dd"),
          },
        ],
        {
          reason: "强制跳转",
          talkTime: format(addDays(today, -60), "yyyy-MM-dd HH:mm:ss"),
        },
      );
      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "承诺3",
            deadline: format(addDays(today, 7), "yyyy-MM-dd"),
          },
        ],
        {
          reason: "整改不到位",
          talkTime: format(addDays(today, -20), "yyyy-MM-dd HH:mm:ss"),
        },
      );
      createTalkWithPromises(
        state,
        otherVendor.id,
        [
          {
            content: "其他承诺",
            deadline: format(addDays(today, 7), "yyyy-MM-dd"),
          },
        ],
        {
          reason: "弹窗诱导",
          talkTime: format(addDays(today, -10), "yyyy-MM-dd HH:mm:ss"),
        },
      );

      const vendorTalks = state.talks.filter((t) => t.vendorId === vendor.id);
      expect(vendorTalks).toHaveLength(3);
      expect(state.talks).toHaveLength(4);
    });

    test("厂商约谈历史按时间倒序排列（最新在前）", () => {
      const today = new Date();
      const vendor = createVendor(state);

      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "承诺",
            deadline: format(addDays(today, 7), "yyyy-MM-dd"),
          },
        ],
        {
          talkTime: format(addDays(today, -100), "yyyy-MM-dd HH:mm:ss"),
          remark: "T1最早",
        },
      );
      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "承诺",
            deadline: format(addDays(today, 7), "yyyy-MM-dd"),
          },
        ],
        {
          talkTime: format(addDays(today, -30), "yyyy-MM-dd HH:mm:ss"),
          remark: "T2中间",
        },
      );
      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "承诺",
            deadline: format(addDays(today, 7), "yyyy-MM-dd"),
          },
        ],
        {
          talkTime: format(addDays(today, -5), "yyyy-MM-dd HH:mm:ss"),
          remark: "T3最新",
        },
      );

      const vendorTalks = state.talks
        .filter((t) => t.vendorId === vendor.id)
        .sort((a, b) => new Date(b.talkTime) - new Date(a.talkTime));

      expect(vendorTalks[0].remark).toBe("T3最新");
      expect(vendorTalks[1].remark).toBe("T2中间");
      expect(vendorTalks[2].remark).toBe("T1最早");
    });

    test("厂商所有承诺聚合：历次约谈的承诺都挂在同一厂商下", () => {
      const today = new Date();
      const vendor = createVendor(state);

      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "承诺1-1",
            deadline: format(addDays(today, 7), "yyyy-MM-dd"),
          },
          {
            content: "承诺1-2",
            deadline: format(addDays(today, 14), "yyyy-MM-dd"),
          },
        ],
        { talkTime: format(addDays(today, -50), "yyyy-MM-dd HH:mm:ss") },
      );
      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "承诺2-1",
            deadline: format(addDays(today, 5), "yyyy-MM-dd"),
          },
          {
            content: "承诺2-2",
            deadline: format(addDays(today, 10), "yyyy-MM-dd"),
          },
          {
            content: "承诺2-3",
            deadline: format(addDays(today, 20), "yyyy-MM-dd"),
          },
        ],
        { talkTime: format(addDays(today, -20), "yyyy-MM-dd HH:mm:ss") },
      );

      const vendorPromises = state.promises.filter(
        (p) => p.vendorId === vendor.id,
      );
      expect(vendorPromises).toHaveLength(5);
      expect(vendorPromises.map((p) => p.content)).toEqual(
        expect.arrayContaining([
          "承诺1-1",
          "承诺1-2",
          "承诺2-1",
          "承诺2-2",
          "承诺2-3",
        ]),
      );
    });
  });

  describe("linkedPromises 关联关系", () => {
    test("升级约谈的 linkedPromiseIds 正确指向导致逾期的前序承诺", () => {
      const today = new Date();
      const vendor = createVendor(state);

      const result1 = createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "A承诺（会逾期）",
            deadline: format(addDays(today, -20), "yyyy-MM-dd"),
            status: "整改中",
          },
          {
            content: "B承诺（按期完成）",
            deadline: format(addDays(today, -15), "yyyy-MM-dd"),
            status: "按期完成",
            actualCompletionDate: format(addDays(today, -17), "yyyy-MM-dd"),
          },
          {
            content: "C承诺（也逾期）",
            deadline: format(addDays(today, -18), "yyyy-MM-dd"),
            status: "待核验",
          },
        ],
        {
          reason: "弹窗诱导",
          talkTime: format(addDays(today, -30), "yyyy-MM-dd HH:mm:ss"),
        },
      );
      const promiseA = result1.promises[0];
      const promiseC = result1.promises[2];

      autoCheckOverdue(state, today);

      const draft = state.talkDrafts[0];
      expect(draft.linkedPromiseIds).toHaveLength(2);
      expect(draft.linkedPromiseIds).toContain(promiseA.id);
      expect(draft.linkedPromiseIds).toContain(promiseC.id);
    });

    test("链路中的约谈能查询到关联的前序承诺内容", () => {
      const today = new Date();
      const vendor = createVendor(state);

      const result1 = createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "移除所有诱导弹窗",
            deadline: format(addDays(today, -30), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        {
          reason: "弹窗诱导",
          talkTime: format(addDays(today, -40), "yyyy-MM-dd HH:mm:ss"),
        },
      );
      const promise1 = result1.promises[0];

      autoCheckOverdue(state, today);
      const escalation = state.escalations[0];

      const result2 = createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "深度整改",
            deadline: format(addDays(today, 10), "yyyy-MM-dd"),
          },
        ],
        {
          reason: "整改不到位",
          talkTime: format(addDays(today, -20), "yyyy-MM-dd HH:mm:ss"),
          sourceEscalationId: escalation.id,
          linkedPromiseIds: [promise1.id],
        },
      );
      const talk2 = result2.talk;

      const chain = getTalkChain(state, talk2.id);
      const latestNode = chain[chain.length - 1];

      expect(latestNode.linkedPromises).toHaveLength(1);
      expect(latestNode.linkedPromises[0].id).toBe(promise1.id);
      expect(latestNode.linkedPromises[0].content).toBe("移除所有诱导弹窗");
      expect(latestNode.linkedPromises[0].deadline).toBe(
        format(addDays(today, -30), "yyyy-MM-dd"),
      );
    });
  });

  describe("sourceEscalationId 完整性校验", () => {
    test("升级约谈必须通过 sourceEscalationId 指向前序升级记录", () => {
      const today = new Date();
      const vendor = createVendor(state);

      const result1 = createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "逾期承诺",
            deadline: format(addDays(today, -10), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        {
          reason: "弹窗诱导",
          talkTime: format(addDays(today, -20), "yyyy-MM-dd HH:mm:ss"),
        },
      );

      autoCheckOverdue(state, today);

      const escalation = state.escalations.find(
        (e) => e.talkId === result1.talk.id,
      );
      expect(escalation).toBeDefined();

      const { talk: talk2 } = createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "新承诺",
            deadline: format(addDays(today, 7), "yyyy-MM-dd"),
          },
        ],
        {
          reason: "整改不到位",
          sourceEscalationId: escalation.id,
          linkedPromiseIds: [result1.promises[0].id],
        },
      );

      expect(talk2.sourceEscalationId).toBe(escalation.id);
      expect(
        state.talks.find((t) => t.id === talk2.id).sourceEscalationId,
      ).toBe(escalation.id);
    });

    test("不存在的 talkId 查询链路返回空数组", () => {
      const chain = getTalkChain(state, "non-existent-talk-id");
      expect(chain).toHaveLength(0);
    });

    test("链路回溯不会出现循环（visited 集合保护）", () => {
      const vendor = createVendor(state);
      const today = new Date();

      const escId = uuidv4();
      const talk1 = {
        id: uuidv4(),
        vendorId: vendor.id,
        reason: "弹窗诱导",
        participants: [],
        talkTime: format(today, "yyyy-MM-dd HH:mm:ss"),
        remark: "",
        sourceEscalationId: escId,
        linkedPromiseIds: [],
        createdAt: format(today, "yyyy-MM-dd HH:mm:ss"),
      };
      state.talks.push(talk1);

      state.escalations.push({
        id: escId,
        vendorId: vendor.id,
        promiseId: null,
        talkId: talk1.id,
        type: "再次约谈",
        triggeredAt: format(today, "yyyy-MM-dd HH:mm:ss"),
        remark: "",
        handled: false,
      });

      const chain = getTalkChain(state, talk1.id);
      expect(chain.length).toBeLessThanOrEqual(2);
    });
  });
});
