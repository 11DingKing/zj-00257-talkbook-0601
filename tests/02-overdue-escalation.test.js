const { format, addDays, parseISO, startOfDay } = require("date-fns");
const {
  createFreshState,
  createVendor,
  createTalkWithPromises,
  isPromiseOverdue,
  autoCheckOverdue,
} = require("./setup");

describe("逾期升级处置（Overdue Escalation）", () => {
  let state;

  beforeEach(() => {
    state = createFreshState();
  });

  describe("逾期判定核心逻辑 - isPromiseOverdue", () => {
    test("截止日之前（deadline - 1天）不算逾期", () => {
      const today = new Date();
      const deadline = addDays(today, 3);

      const promise = {
        status: "整改中",
        deadline: format(deadline, "yyyy-MM-dd"),
      };

      const checkDate = addDays(today, 2);
      expect(isPromiseOverdue(promise, checkDate)).toBe(false);
    });

    test("截止日 **当天** 不算逾期（关键边界！）", () => {
      const today = new Date();
      const deadline = addDays(today, 5);

      const promise = {
        status: "整改中",
        deadline: format(deadline, "yyyy-MM-dd"),
      };

      expect(isPromiseOverdue(promise, deadline)).toBe(false);
    });

    test("截止日 **当天 23:59:59** 仍不算逾期", () => {
      const today = new Date();
      const deadlineDate = addDays(today, 5);
      const deadlineEndOfDay = new Date(deadlineDate);
      deadlineEndOfDay.setHours(23, 59, 59, 999);

      const promise = {
        status: "整改中",
        deadline: format(deadlineDate, "yyyy-MM-dd"),
      };

      expect(isPromiseOverdue(promise, deadlineEndOfDay)).toBe(false);
    });

    test("截止日 **次日 00:00:00** 才算逾期（越过当天零点）", () => {
      const today = new Date();
      const deadlineDate = addDays(today, 5);
      const nextDay = addDays(deadlineDate, 1);
      const nextDayStart = startOfDay(nextDay);

      const promise = {
        status: "整改中",
        deadline: format(deadlineDate, "yyyy-MM-dd"),
      };

      expect(isPromiseOverdue(promise, nextDayStart)).toBe(true);
    });

    test("截止日后一天算逾期", () => {
      const today = new Date();
      const deadline = addDays(today, 3);

      const promise = {
        status: "整改中",
        deadline: format(deadline, "yyyy-MM-dd"),
      };

      const checkDate = addDays(deadline, 1);
      expect(isPromiseOverdue(promise, checkDate)).toBe(true);
    });

    test("截止日后多日仍算逾期", () => {
      const today = new Date();
      const deadline = addDays(today, 3);

      const promise = {
        status: "整改中",
        deadline: format(deadline, "yyyy-MM-dd"),
      };

      const checkDate = addDays(deadline, 30);
      expect(isPromiseOverdue(promise, checkDate)).toBe(true);
    });

    test("「按期完成」的承诺即使过了截止日也不算逾期", () => {
      const today = new Date();
      const deadline = addDays(today, -10);

      const promise = {
        status: "按期完成",
        deadline: format(deadline, "yyyy-MM-dd"),
      };

      expect(isPromiseOverdue(promise, today)).toBe(false);
    });

    test("「逾期未完成」的承诺维持逾期判定", () => {
      const today = new Date();
      const deadline = addDays(today, -5);

      const promise = {
        status: "逾期未完成",
        deadline: format(deadline, "yyyy-MM-dd"),
      };

      expect(isPromiseOverdue(promise, today)).toBe(true);
    });

    test("「待核验」状态过了截止日也会被判定逾期", () => {
      const today = new Date();
      const deadline = addDays(today, -2);

      const promise = {
        status: "待核验",
        deadline: format(deadline, "yyyy-MM-dd"),
      };

      expect(isPromiseOverdue(promise, today)).toBe(true);
    });

    test("「待整改」状态过了截止日同样判定逾期", () => {
      const today = new Date();
      const deadline = addDays(today, -1);

      const promise = {
        status: "待整改",
        deadline: format(deadline, "yyyy-MM-dd"),
      };

      expect(isPromiseOverdue(promise, today)).toBe(true);
    });
  });

  describe("自动检查逾期 - autoCheckOverdue", () => {
    test("承诺刚好到截止日当天，状态不会被自动改为逾期", () => {
      const today = new Date();
      const deadlineDate = today;

      const vendor = createVendor(state);
      createTalkWithPromises(state, vendor.id, [
        {
          content: "当天到期的承诺",
          deadline: format(deadlineDate, "yyyy-MM-dd"),
          status: "整改中",
        },
      ]);

      const newEscalations = autoCheckOverdue(state, today);

      const promise = state.promises[0];
      expect(promise.status).toBe("整改中");
      expect(promise.status).not.toBe("逾期未完成");
      expect(newEscalations).toHaveLength(0);
      expect(state.escalations).toHaveLength(0);
    });

    test("截止日次日触发逾期，状态改为「逾期未完成」", () => {
      const today = new Date();
      const deadlineDate = addDays(today, -1);
      const checkDate = today;

      const vendor = createVendor(state);
      createTalkWithPromises(state, vendor.id, [
        {
          content: "昨天到期的承诺",
          deadline: format(deadlineDate, "yyyy-MM-dd"),
          status: "整改中",
        },
      ]);

      const newEscalations = autoCheckOverdue(state, checkDate);

      const promise = state.promises[0];
      expect(promise.status).toBe("逾期未完成");
      expect(newEscalations).toHaveLength(1);
      expect(state.escalations).toHaveLength(1);
    });

    test("首次逾期触发「再次约谈」升级处置", () => {
      const today = new Date();
      const deadlineDate = addDays(today, -2);

      const vendor = createVendor(state);
      createTalkWithPromises(state, vendor.id, [
        {
          content: "首次逾期的承诺",
          deadline: format(deadlineDate, "yyyy-MM-dd"),
          status: "待整改",
        },
      ]);

      expect(state.escalations).toHaveLength(0);

      autoCheckOverdue(state, today);

      expect(state.escalations).toHaveLength(1);
      const escalation = state.escalations[0];
      expect(escalation.type).toBe("再次约谈");
      expect(escalation.handled).toBe(false);
      expect(escalation.vendorId).toBe(vendor.id);
      expect(escalation.promiseId).toBe(state.promises[0].id);
    });

    test("升级为「再次约谈」时自动生成约谈草稿", () => {
      const today = new Date();
      const deadlineDate = addDays(today, -3);

      const vendor = createVendor(state);
      const { talk } = createTalkWithPromises(state, vendor.id, [
        {
          content: "逾期触发再次约谈",
          deadline: format(deadlineDate, "yyyy-MM-dd"),
          status: "整改中",
        },
      ]);

      autoCheckOverdue(state, today);

      expect(state.talkDrafts).toHaveLength(1);
      const draft = state.talkDrafts[0];
      expect(draft.vendorId).toBe(vendor.id);
      expect(draft.reason).toBe("整改不到位");
      expect(draft.status).toBe("草稿");
      expect(draft.sourceEscalationId).toBe(state.escalations[0].id);
      expect(draft.linkedPromiseIds).toContain(state.promises[0].id);
      expect(draft.participants).toContain("监管处长");
    });

    test("已完成的承诺不会触发任何逾期逻辑", () => {
      const today = new Date();
      const deadlineDate = addDays(today, -10);

      const vendor = createVendor(state);
      createTalkWithPromises(state, vendor.id, [
        {
          content: "已按期完成的承诺",
          deadline: format(deadlineDate, "yyyy-MM-dd"),
          status: "按期完成",
          actualCompletionDate: format(addDays(deadlineDate, -1), "yyyy-MM-dd"),
        },
      ]);

      const newEscalations = autoCheckOverdue(state, today);

      expect(state.escalations).toHaveLength(0);
      expect(newEscalations).toHaveLength(0);
      expect(state.promises[0].status).toBe("按期完成");
    });

    test("一个约谈多条承诺同时逾期，只触发一次升级处置（合并且不重复）", () => {
      const today = new Date();
      const deadlineDate = addDays(today, -5);

      const vendor = createVendor(state);
      createTalkWithPromises(state, vendor.id, [
        {
          content: "承诺1：移除弹窗",
          deadline: format(deadlineDate, "yyyy-MM-dd"),
          status: "整改中",
        },
        {
          content: "承诺2：代码自查",
          deadline: format(deadlineDate, "yyyy-MM-dd"),
          status: "待整改",
        },
        {
          content: "承诺3：员工培训",
          deadline: format(deadlineDate, "yyyy-MM-dd"),
          status: "待核验",
        },
      ]);

      const newEscalations = autoCheckOverdue(state, today);

      expect(newEscalations).toHaveLength(1);
      expect(state.escalations).toHaveLength(1);

      state.promises.forEach((p) => {
        expect(p.status).toBe("逾期未完成");
      });

      const talkDraft = state.talkDrafts[0];
      expect(talkDraft.linkedPromiseIds).toHaveLength(3);
    });

    test("同一约谈已触发过升级处置，新增逾期承诺不再重复触发", () => {
      const today = new Date();
      const deadline1 = addDays(today, -5);
      const deadline2 = addDays(today, -3);

      const vendor = createVendor(state);
      createTalkWithPromises(state, vendor.id, [
        {
          content: "承诺1（早已逾期）",
          deadline: format(deadline1, "yyyy-MM-dd"),
          status: "整改中",
        },
        {
          content: "承诺2（3天前到期）",
          deadline: format(deadline2, "yyyy-MM-dd"),
          status: "整改中",
        },
      ]);

      const firstCheck = autoCheckOverdue(state, today);
      expect(firstCheck).toHaveLength(1);
      expect(state.escalations).toHaveLength(1);

      const secondCheck = autoCheckOverdue(state, addDays(today, 1));
      expect(secondCheck).toHaveLength(0);
      expect(state.escalations).toHaveLength(1);
    });

    test("升级处置生成约谈草稿时会自动加入「监管处长」参与", () => {
      const today = new Date();
      const deadlineDate = addDays(today, -2);

      const vendor = createVendor(state);
      const originalParticipants = ["监管员A", "厂商联系人", "技术总监"];
      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "逾期承诺",
            deadline: format(deadlineDate, "yyyy-MM-dd"),
            status: "整改中",
          },
        ],
        { participants: originalParticipants },
      );

      autoCheckOverdue(state, today);

      const draft = state.talkDrafts[0];
      originalParticipants.forEach((p) => {
        expect(draft.participants).toContain(p);
      });
      expect(draft.participants).toContain("监管处长");
      expect(new Set(draft.participants).size).toBe(draft.participants.length);
    });

    test("逾期状态的承诺不会被重复修改为逾期", () => {
      const today = new Date();
      const deadlineDate = addDays(today, -10);

      const vendor = createVendor(state);
      createTalkWithPromises(state, vendor.id, [
        {
          content: "已经是逾期状态",
          deadline: format(deadlineDate, "yyyy-MM-dd"),
          status: "逾期未完成",
        },
      ]);

      const origStatus = state.promises[0].status;
      autoCheckOverdue(state, today);

      expect(state.promises[0].status).toBe(origStatus);
    });
  });

  describe("边界日期矩阵 - 全面覆盖", () => {
    const cases = [
      { offsetDays: -30, label: "截止日前30天", expectOverdue: false },
      { offsetDays: -7, label: "截止日前7天", expectOverdue: false },
      { offsetDays: -1, label: "截止日前1天", expectOverdue: false },
      { offsetDays: 0, label: "截止日当天", expectOverdue: false },
      { offsetDays: 1, label: "截止日后1天", expectOverdue: true },
      { offsetDays: 2, label: "截止日后2天", expectOverdue: true },
      { offsetDays: 30, label: "截止日后30天", expectOverdue: true },
      { offsetDays: 365, label: "截止日后1年", expectOverdue: true },
    ];

    test.each(cases)(
      "$label：距离截止日 $offsetDays 天 → 逾期判定=$expectOverdue",
      ({ offsetDays, expectOverdue }) => {
        const deadline = new Date(2026, 0, 15);
        const checkDate = addDays(deadline, offsetDays);

        const promise = {
          status: "整改中",
          deadline: format(deadline, "yyyy-MM-dd"),
        };

        expect(isPromiseOverdue(promise, checkDate)).toBe(expectOverdue);
      },
    );
  });
});
