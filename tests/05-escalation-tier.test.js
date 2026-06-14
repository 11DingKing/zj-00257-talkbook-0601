const { format, addDays } = require("date-fns");
const {
  createFreshState,
  createVendor,
  createTalkWithPromises,
  autoCheckOverdue,
  ESCALATION_TYPES,
} = require("./setup");

describe("多次约谈后升级档位判定（Escalation Tier Determination）", () => {
  let state;

  beforeEach(() => {
    state = createFreshState();
  });

  describe("升级档位核心规则：首次逾期→再次约谈，已有升级记录→通报批评", () => {
    test("规则确认：ESCALATION_TYPES 包含「再次约谈」和「通报批评」两档", () => {
      expect(ESCALATION_TYPES).toHaveLength(2);
      expect(ESCALATION_TYPES).toContain("再次约谈");
      expect(ESCALATION_TYPES).toContain("通报批评");
    });

    test("厂商无升级记录时，首次逾期触发「再次约谈」（第一档）", () => {
      const today = new Date();
      const vendor = createVendor(state);
      createTalkWithPromises(state, vendor.id, [
        {
          content: "首次逾期承诺",
          deadline: format(addDays(today, -5), "yyyy-MM-dd"),
          status: "整改中",
        },
      ]);

      expect(state.escalations).toHaveLength(0);
      const vendorEscBefore = state.escalations.filter(
        (e) => e.vendorId === vendor.id,
      );
      expect(vendorEscBefore).toHaveLength(0);

      autoCheckOverdue(state, today);

      const vendorEscAfter = state.escalations.filter(
        (e) => e.vendorId === vendor.id,
      );
      expect(vendorEscAfter).toHaveLength(1);
      expect(vendorEscAfter[0].type).toBe("再次约谈");
    });

    test("厂商已有1次升级记录后，再次逾期触发「通报批评」（第二档）", () => {
      const today = new Date();
      const vendor = createVendor(state);

      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "第1次逾期承诺",
            deadline: format(addDays(today, -60), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        { talkTime: format(addDays(today, -70), "yyyy-MM-dd HH:mm:ss") },
      );
      autoCheckOverdue(state, addDays(today, -55));
      expect(
        state.escalations.filter((e) => e.vendorId === vendor.id),
      ).toHaveLength(1);
      expect(state.escalations[0].type).toBe("再次约谈");

      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "第2次逾期承诺",
            deadline: format(addDays(today, -10), "yyyy-MM-dd"),
            status: "待核验",
          },
        ],
        { talkTime: format(addDays(today, -40), "yyyy-MM-dd HH:mm:ss") },
      );

      const vendorEscBefore = state.escalations.filter(
        (e) => e.vendorId === vendor.id,
      );
      expect(vendorEscBefore).toHaveLength(1);

      autoCheckOverdue(state, today);

      const vendorEscAfter = state.escalations.filter(
        (e) => e.vendorId === vendor.id,
      );
      expect(vendorEscAfter).toHaveLength(2);
      expect(vendorEscAfter[1].type).toBe("通报批评");
    });

    test("厂商有多次升级记录后，所有新增逾期继续升级为「通报批评」", () => {
      const today = new Date();
      const vendor = createVendor(state);

      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "T1逾期",
            deadline: format(addDays(today, -100), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        { talkTime: format(addDays(today, -110), "yyyy-MM-dd HH:mm:ss") },
      );
      autoCheckOverdue(state, addDays(today, -95));

      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "T2逾期",
            deadline: format(addDays(today, -70), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        { talkTime: format(addDays(today, -80), "yyyy-MM-dd HH:mm:ss") },
      );
      autoCheckOverdue(state, addDays(today, -65));

      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "T3逾期",
            deadline: format(addDays(today, -40), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        { talkTime: format(addDays(today, -50), "yyyy-MM-dd HH:mm:ss") },
      );
      autoCheckOverdue(state, addDays(today, -35));

      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "T4最新逾期",
            deadline: format(addDays(today, -5), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        { talkTime: format(addDays(today, -15), "yyyy-MM-dd HH:mm:ss") },
      );
      autoCheckOverdue(state, today);

      const vendorEsc = state.escalations.filter(
        (e) => e.vendorId === vendor.id,
      );
      expect(vendorEsc).toHaveLength(4);
      expect(vendorEsc[0].type).toBe("再次约谈");
      expect(vendorEsc[1].type).toBe("通报批评");
      expect(vendorEsc[2].type).toBe("通报批评");
      expect(vendorEsc[3].type).toBe("通报批评");
    });
  });

  describe("升级档位对应的处置动作", () => {
    test("「再次约谈」档：生成约谈草稿，不生成通报", () => {
      const today = new Date();
      const vendor = createVendor(state);
      createTalkWithPromises(state, vendor.id, [
        {
          content: "逾期承诺",
          deadline: format(addDays(today, -5), "yyyy-MM-dd"),
          status: "整改中",
        },
      ]);

      autoCheckOverdue(state, today);

      const escalation = state.escalations[0];
      expect(escalation.type).toBe("再次约谈");
      expect(escalation.generatedTalkDraftId).not.toBeNull();
      expect(escalation.generatedNoticeId).toBeNull();

      const draft = state.talkDrafts.find(
        (d) => d.id === escalation.generatedTalkDraftId,
      );
      expect(draft).toBeDefined();
      expect(draft.vendorId).toBe(vendor.id);
      expect(draft.reason).toBe("整改不到位");
      expect(draft.status).toBe("草稿");
      expect(state.noticeQueue).toHaveLength(0);
    });

    test("「通报批评」档：生成通报通知，不生成约谈草稿", () => {
      const today = new Date();
      const vendor = createVendor(state, { name: "将被通报的厂商" });

      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "T1逾期",
            deadline: format(addDays(today, -60), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        { talkTime: format(addDays(today, -70), "yyyy-MM-dd HH:mm:ss") },
      );
      autoCheckOverdue(state, addDays(today, -50));

      const talkDraftCountBefore = state.talkDrafts.length;
      const noticeCountBefore = state.noticeQueue.length;

      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "T2逾期（触发通报）",
            deadline: format(addDays(today, -5), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        { talkTime: format(addDays(today, -30), "yyyy-MM-dd HH:mm:ss") },
      );
      autoCheckOverdue(state, today);

      const vendorEsc = state.escalations.filter(
        (e) => e.vendorId === vendor.id,
      );
      const secondEsc = vendorEsc[vendorEsc.length - 1];
      expect(secondEsc.type).toBe("通报批评");
      expect(secondEsc.generatedTalkDraftId).toBeNull();
      expect(secondEsc.generatedNoticeId).not.toBeNull();

      expect(state.talkDrafts.length).toBe(talkDraftCountBefore);
      expect(state.noticeQueue.length).toBe(noticeCountBefore + 1);

      const notice = state.noticeQueue.find(
        (n) => n.id === secondEsc.generatedNoticeId,
      );
      expect(notice).toBeDefined();
      expect(notice.title).toContain("予以通报批评的通知");
      expect(notice.title).toContain("将被通报的厂商");
      expect(notice.status).toBe("待通报");
      expect(notice.content).toContain("逾期未完成");
    });
  });

  describe("同一次检查中多个约谈同时逾期 - 档位判定顺序", () => {
    test("同一厂商的多个约谈同时逾期：第一条触发再次约谈，第二条触发通报批评", () => {
      const today = new Date();
      const vendor = createVendor(state);

      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "约谈A的逾期承诺",
            deadline: format(addDays(today, -3), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        {
          talkTime: format(addDays(today, -30), "yyyy-MM-dd HH:mm:ss"),
          remark: "约谈A",
        },
      );
      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "约谈B的逾期承诺",
            deadline: format(addDays(today, -5), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        {
          talkTime: format(addDays(today, -25), "yyyy-MM-dd HH:mm:ss"),
          remark: "约谈B",
        },
      );

      expect(state.escalations).toHaveLength(0);

      const newEscalations = autoCheckOverdue(state, today);

      expect(newEscalations).toHaveLength(2);
      expect(state.escalations).toHaveLength(2);

      const vendorEsc = state.escalations.filter(
        (e) => e.vendorId === vendor.id,
      );
      expect(vendorEsc).toHaveLength(2);

      const types = vendorEsc.map((e) => e.type).sort();
      expect(types).toContain("再次约谈");
      expect(types).toContain("通报批评");

      const firstGenerated = state.talkDrafts.filter(
        (d) => d.vendorId === vendor.id,
      ).length;
      const noticesGenerated = state.noticeQueue.filter(
        (n) => n.vendorId === vendor.id,
      ).length;
      expect(firstGenerated).toBe(1);
      expect(noticesGenerated).toBe(1);
    });

    test("不同厂商同时逾期：各自按自己的历史独立判定档位，互不影响", () => {
      const today = new Date();
      const vendorA = createVendor(state, { name: "厂商A（新人）" });
      const vendorB = createVendor(state, { name: "厂商B（老油条）" });

      createTalkWithPromises(
        state,
        vendorB.id,
        [
          {
            content: "B的历史逾期",
            deadline: format(addDays(today, -100), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        { talkTime: format(addDays(today, -110), "yyyy-MM-dd HH:mm:ss") },
      );
      autoCheckOverdue(state, addDays(today, -90));

      createTalkWithPromises(state, vendorA.id, [
        {
          content: "A的首次逾期",
          deadline: format(addDays(today, -5), "yyyy-MM-dd"),
          status: "整改中",
        },
      ]);
      createTalkWithPromises(
        state,
        vendorB.id,
        [
          {
            content: "B的再一次逾期",
            deadline: format(addDays(today, -5), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        { talkTime: format(addDays(today, -70), "yyyy-MM-dd HH:mm:ss") },
      );

      autoCheckOverdue(state, today);

      const escA = state.escalations.filter((e) => e.vendorId === vendorA.id);
      const escB = state.escalations.filter((e) => e.vendorId === vendorB.id);
      expect(escA).toHaveLength(1);
      expect(escA[0].type).toBe("再次约谈");
      expect(escB).toHaveLength(2);
      expect(escB[0].type).toBe("再次约谈");
      expect(escB[1].type).toBe("通报批评");
    });
  });

  describe("升级记录触发来源判定", () => {
    test("升级记录的 promiseId 指向该约谈中第一条逾期的承诺", () => {
      const today = new Date();
      const vendor = createVendor(state);
      const { promises } = createTalkWithPromises(state, vendor.id, [
        {
          content: "承诺A（逾期）",
          deadline: format(addDays(today, -10), "yyyy-MM-dd"),
          status: "整改中",
        },
        {
          content: "承诺B（逾期）",
          deadline: format(addDays(today, -8), "yyyy-MM-dd"),
          status: "整改中",
        },
        {
          content: "承诺C（按期完成）",
          deadline: format(addDays(today, -12), "yyyy-MM-dd"),
          status: "按期完成",
          actualCompletionDate: format(addDays(today, -13), "yyyy-MM-dd"),
        },
      ]);

      autoCheckOverdue(state, today);

      expect(state.escalations).toHaveLength(1);
      const escalation = state.escalations[0];
      expect(escalation.promiseId).toBe(promises[0].id);
      expect(promises[0].content).toBe("承诺A（逾期）");
    });

    test("升级记录的 talkId 正确指向产生逾期的约谈", () => {
      const today = new Date();
      const vendor = createVendor(state);

      const t1 = createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "T1承诺",
            deadline: format(addDays(today, -60), "yyyy-MM-dd"),
            status: "按期完成",
            actualCompletionDate: format(addDays(today, -62), "yyyy-MM-dd"),
          },
        ],
        { talkTime: format(addDays(today, -70), "yyyy-MM-dd HH:mm:ss") },
      );

      const t2 = createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "T2逾期",
            deadline: format(addDays(today, -5), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        { talkTime: format(addDays(today, -15), "yyyy-MM-dd HH:mm:ss") },
      );

      autoCheckOverdue(state, today);

      expect(state.escalations).toHaveLength(1);
      expect(state.escalations[0].talkId).toBe(t2.talk.id);
      expect(state.escalations[0].talkId).not.toBe(t1.talk.id);
    });
  });

  describe("草稿/通报的内容一致性校验", () => {
    test("约谈草稿中的 linkedPromiseIds 覆盖该约谈全部逾期承诺", () => {
      const today = new Date();
      const vendor = createVendor(state);
      const { promises } = createTalkWithPromises(state, vendor.id, [
        {
          content: "逾期承诺1",
          deadline: format(addDays(today, -10), "yyyy-MM-dd"),
          status: "整改中",
        },
        {
          content: "逾期承诺2",
          deadline: format(addDays(today, -8), "yyyy-MM-dd"),
          status: "待核验",
        },
        {
          content: "逾期承诺3",
          deadline: format(addDays(today, -5), "yyyy-MM-dd"),
          status: "待整改",
        },
      ]);

      autoCheckOverdue(state, today);

      expect(state.talkDrafts).toHaveLength(1);
      const draft = state.talkDrafts[0];
      expect(draft.linkedPromiseIds).toHaveLength(3);
      promises.forEach((p) => {
        expect(draft.linkedPromiseIds).toContain(p.id);
      });
    });

    test("通报批评通知内容中包含具体厂商名和逾期承诺内容", () => {
      const today = new Date();
      const vendor = createVendor(state, { name: "测试通报厂商科技有限公司" });

      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "历史逾期",
            deadline: format(addDays(today, -100), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        { talkTime: format(addDays(today, -110), "yyyy-MM-dd HH:mm:ss") },
      );
      autoCheckOverdue(state, addDays(today, -90));

      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "违规SDK专项清理工作",
            deadline: format(addDays(today, -5), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        { talkTime: format(addDays(today, -20), "yyyy-MM-dd HH:mm:ss") },
      );
      autoCheckOverdue(state, today);

      const notice = state.noticeQueue[state.noticeQueue.length - 1];
      expect(notice.title).toContain("测试通报厂商科技有限公司");
      expect(notice.content).toContain("违规SDK专项清理工作");
      expect(notice.content).toContain("逾期未完成");
      expect(notice.content).toContain("通报批评");
      expect(notice.status).toBe("待通报");
    });
  });

  describe("档位判定与厂商约谈次数综合场景", () => {
    test("综合场景：某厂商完整经历 4 次约谈，3 次逾期，档位逐步升级", () => {
      const today = new Date();
      const vendor = createVendor(state, { name: "典型案例厂商" });

      const t1 = createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "T1整改弹窗（按期）",
            deadline: format(addDays(today, -150), "yyyy-MM-dd"),
            status: "按期完成",
            actualCompletionDate: format(addDays(today, -152), "yyyy-MM-dd"),
          },
        ],
        { talkTime: format(addDays(today, -160), "yyyy-MM-dd HH:mm:ss") },
      );
      expect(
        state.escalations.filter((e) => e.vendorId === vendor.id),
      ).toHaveLength(0);

      const t2 = createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "T2整改跳转（逾期→再次约谈）",
            deadline: format(addDays(today, -120), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        { talkTime: format(addDays(today, -130), "yyyy-MM-dd HH:mm:ss") },
      );
      autoCheckOverdue(state, addDays(today, -110));
      let esc = state.escalations.filter((e) => e.vendorId === vendor.id);
      expect(esc).toHaveLength(1);
      expect(esc[0].type).toBe("再次约谈");

      const t3 = createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "T3深度整改（又逾期→通报批评）",
            deadline: format(addDays(today, -70), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        {
          talkTime: format(addDays(today, -90), "yyyy-MM-dd HH:mm:ss"),
          sourceEscalationId: esc[0].id,
          linkedPromiseIds: [t2.promises[0].id],
        },
      );
      autoCheckOverdue(state, addDays(today, -60));
      esc = state.escalations.filter((e) => e.vendorId === vendor.id);
      expect(esc).toHaveLength(2);
      expect(esc[1].type).toBe("通报批评");

      const t4 = createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "T4长效机制（再逾期→继续通报批评）",
            deadline: format(addDays(today, -5), "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        { talkTime: format(addDays(today, -30), "yyyy-MM-dd HH:mm:ss") },
      );
      autoCheckOverdue(state, today);
      esc = state.escalations.filter((e) => e.vendorId === vendor.id);
      expect(esc).toHaveLength(3);
      expect(esc[2].type).toBe("通报批评");

      const talks = state.talks.filter((t) => t.vendorId === vendor.id);
      expect(talks).toHaveLength(4);

      const talkCounts = {
        再次约谈: esc.filter((e) => e.type === "再次约谈").length,
        通报批评: esc.filter((e) => e.type === "通报批评").length,
      };
      expect(talkCounts).toEqual({ 再次约谈: 1, 通报批评: 2 });
    });
  });
});
