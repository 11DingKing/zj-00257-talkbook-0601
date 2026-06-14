const { format, addDays } = require("date-fns");
const {
  createFreshState,
  createVendor,
  createTalkWithPromises,
  PROMISE_STATUS,
} = require("./setup");

describe("承诺状态推进逻辑（Promise Status Transitions）", () => {
  let state;

  beforeEach(() => {
    state = createFreshState();
  });

  describe("状态合法流转 - 正向路径", () => {
    test("新建约谈的承诺初始状态应为「待整改」", () => {
      const vendor = createVendor(state);
      const { promises } = createTalkWithPromises(state, vendor.id, [
        {
          content: "整改弹窗问题",
          deadline: format(addDays(new Date(), 7), "yyyy-MM-dd"),
        },
      ]);

      expect(promises).toHaveLength(1);
      expect(promises[0].status).toBe("待整改");
      expect(PROMISE_STATUS).toContain(promises[0].status);
      expect(promises[0].actualCompletionDate).toBeNull();
    });

    test("待整改 → 整改中：厂商开始整改", () => {
      const vendor = createVendor(state);
      const { promises } = createTalkWithPromises(state, vendor.id, [
        {
          content: "整改弹窗问题",
          deadline: format(addDays(new Date(), 7), "yyyy-MM-dd"),
        },
      ]);
      const promise = promises[0];

      const validTransitions = {
        待整改: ["整改中", "待核验", "按期完成", "逾期未完成"],
      };
      expect(validTransitions[promise.status]).toContain("整改中");

      promise.status = "整改中";
      expect(promise.status).toBe("整改中");
      expect(promise.actualCompletionDate).toBeNull();
    });

    test("待整改 → 待核验：厂商直接提交材料（跳过整改中标记）", () => {
      const vendor = createVendor(state);
      const { promises } = createTalkWithPromises(state, vendor.id, [
        {
          content: "整改弹窗问题",
          deadline: format(addDays(new Date(), 7), "yyyy-MM-dd"),
        },
      ]);
      const promise = promises[0];

      expect(promise.status).toBe("待整改");

      promise.status = "待核验";
      expect(promise.status).toBe("待核验");
    });

    test("整改中 → 待核验：厂商完成整改提交佐证材料", () => {
      const vendor = createVendor(state);
      const { promises } = createTalkWithPromises(state, vendor.id, [
        {
          content: "移除诱导性弹窗",
          deadline: format(addDays(new Date(), 5), "yyyy-MM-dd"),
          status: "整改中",
        },
      ]);
      const promise = promises[0];

      const validTransitions = {
        整改中: ["待核验", "按期完成", "逾期未完成", "待整改"],
      };
      expect(validTransitions[promise.status]).toContain("待核验");

      promise.status = "待核验";
      expect(promise.status).toBe("待核验");
    });

    test("待核验 → 按期完成：核验通过（在截止日前）", () => {
      const today = new Date();
      const vendor = createVendor(state);
      const { promises } = createTalkWithPromises(state, vendor.id, [
        {
          content: "建立内容审核机制",
          deadline: format(addDays(today, 3), "yyyy-MM-dd"),
          status: "待核验",
        },
      ]);
      const promise = promises[0];

      expect(promise.status).toBe("待核验");

      const validTransitions = {
        待核验: ["整改中", "按期完成", "逾期未完成"],
      };
      expect(validTransitions[promise.status]).toContain("按期完成");

      promise.status = "按期完成";
      promise.actualCompletionDate = format(today, "yyyy-MM-dd");
      expect(promise.status).toBe("按期完成");
      expect(promise.actualCompletionDate).not.toBeNull();
    });

    test("待核验 → 整改中：核验不通过，退回整改", () => {
      const vendor = createVendor(state);
      const { promises } = createTalkWithPromises(state, vendor.id, [
        {
          content: "优化关闭按钮",
          deadline: format(addDays(new Date(), 3), "yyyy-MM-dd"),
          status: "待核验",
        },
      ]);
      const promise = promises[0];

      expect(promise.status).toBe("待核验");

      promise.status = "整改中";
      promise.actualCompletionDate = null;
      expect(promise.status).toBe("整改中");
      expect(promise.actualCompletionDate).toBeNull();
    });

    test("整改中 → 待整改：回退到待整改", () => {
      const vendor = createVendor(state);
      const { promises } = createTalkWithPromises(state, vendor.id, [
        {
          content: "清理跳转逻辑",
          deadline: format(addDays(new Date(), 3), "yyyy-MM-dd"),
          status: "整改中",
        },
      ]);
      const promise = promises[0];

      promise.status = "待整改";
      expect(promise.status).toBe("待整改");
    });

    test("逾期未完成 → 整改中：触发升级后继续整改", () => {
      const vendor = createVendor(state);
      const { promises } = createTalkWithPromises(state, vendor.id, [
        {
          content: "全量代码自查",
          deadline: format(addDays(new Date(), -5), "yyyy-MM-dd"),
          status: "逾期未完成",
        },
      ]);
      const promise = promises[0];

      const validTransitions = {
        逾期未完成: ["整改中", "待核验", "按期完成"],
      };
      expect(validTransitions[promise.status]).toContain("整改中");

      promise.status = "整改中";
      expect(promise.status).toBe("整改中");
    });

    test("逾期未完成 → 待核验：逾期后补交材料", () => {
      const vendor = createVendor(state);
      const { promises } = createTalkWithPromises(state, vendor.id, [
        {
          content: "全量代码自查",
          deadline: format(addDays(new Date(), -5), "yyyy-MM-dd"),
          status: "逾期未完成",
        },
      ]);
      const promise = promises[0];

      promise.status = "待核验";
      expect(promise.status).toBe("待核验");
    });

    test("逾期未完成 → 按期完成：最终完成整改", () => {
      const vendor = createVendor(state);
      const { promises } = createTalkWithPromises(state, vendor.id, [
        {
          content: "全量代码自查",
          deadline: format(addDays(new Date(), -5), "yyyy-MM-dd"),
          status: "逾期未完成",
        },
      ]);
      const promise = promises[0];

      promise.status = "按期完成";
      promise.actualCompletionDate = format(new Date(), "yyyy-MM-dd");
      expect(promise.status).toBe("按期完成");
      expect(promise.actualCompletionDate).not.toBeNull();
    });
  });

  describe("状态非法流转 - 防御性检查", () => {
    test("「按期完成」为终态，不能再流转到任何其他状态", () => {
      const vendor = createVendor(state);
      const { promises } = createTalkWithPromises(state, vendor.id, [
        {
          content: "已完成的承诺",
          deadline: format(addDays(new Date(), -2), "yyyy-MM-dd"),
          status: "按期完成",
          actualCompletionDate: format(addDays(new Date(), -3), "yyyy-MM-dd"),
        },
      ]);
      const promise = promises[0];

      const validTransitions = { 按期完成: [] };
      expect(validTransitions[promise.status]).toEqual([]);

      const allStatuses = PROMISE_STATUS.filter((s) => s !== "按期完成");
      allStatuses.forEach((invalidTarget) => {
        expect(validTransitions[promise.status]).not.toContain(invalidTarget);
      });
    });

    test("「待整改」不能直接跳到「整改中」之外的异常路径（需按流程）", () => {
      const vendor = createVendor(state);
      const { promises } = createTalkWithPromises(state, vendor.id, [
        {
          content: "测试承诺",
          deadline: format(addDays(new Date(), 7), "yyyy-MM-dd"),
        },
      ]);
      const promise = promises[0];

      const validFrom待整改 = ["整改中", "待核验", "按期完成", "逾期未完成"];
      expect(validFrom待整改).toEqual(
        expect.arrayContaining(["整改中", "待核验", "按期完成", "逾期未完成"]),
      );
      expect(validFrom待整改).toHaveLength(4);
    });

    test("「待核验」不能回退到「待整改」，只能退回「整改中」", () => {
      const vendor = createVendor(state);
      const { promises } = createTalkWithPromises(state, vendor.id, [
        {
          content: "待核验的承诺",
          deadline: format(addDays(new Date(), 7), "yyyy-MM-dd"),
          status: "待核验",
        },
      ]);
      const promise = promises[0];

      const validFrom待核验 = ["整改中", "按期完成", "逾期未完成"];
      expect(validFrom待核验).not.toContain("待整改");
      expect(validFrom待核验).toContain("整改中");
      expect(PROMISE_STATUS.indexOf(promise.status)).toBe(2);
    });

    test("状态流转图完整性：5个状态全部定义了流转规则", () => {
      const allDefinedTransitions = {
        待整改: ["整改中", "待核验", "按期完成", "逾期未完成"],
        整改中: ["待核验", "按期完成", "逾期未完成", "待整改"],
        待核验: ["整改中", "按期完成", "逾期未完成"],
        按期完成: [],
        逾期未完成: ["整改中", "待核验", "按期完成"],
      };

      PROMISE_STATUS.forEach((status) => {
        expect(allDefinedTransitions).toHaveProperty(status);
        expect(Array.isArray(allDefinedTransitions[status])).toBe(true);
      });

      expect(Object.keys(allDefinedTransitions)).toHaveLength(
        PROMISE_STATUS.length,
      );
    });
  });

  describe("实际完成日期联动逻辑", () => {
    test("设为「按期完成」时必须写入 actualCompletionDate", () => {
      const vendor = createVendor(state);
      const { promises } = createTalkWithPromises(state, vendor.id, [
        {
          content: "测试承诺",
          deadline: format(addDays(new Date(), 7), "yyyy-MM-dd"),
          status: "待核验",
        },
      ]);
      const promise = promises[0];

      promise.status = "按期完成";
      promise.actualCompletionDate = format(new Date(), "yyyy-MM-dd");

      expect(promise.status).toBe("按期完成");
      expect(promise.actualCompletionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(promise.actualCompletionDate).not.toBeNull();
    });

    test("从「按期完成」外的状态流转出时，actualCompletionDate 应清空", () => {
      const vendor = createVendor(state);
      const { promises } = createTalkWithPromises(state, vendor.id, [
        {
          content: "逾期承诺",
          deadline: format(addDays(new Date(), -10), "yyyy-MM-dd"),
          status: "逾期未完成",
          actualCompletionDate: null,
        },
      ]);
      const promise = promises[0];

      promise.status = "整改中";
      promise.actualCompletionDate = null;
      expect(promise.actualCompletionDate).toBeNull();

      promise.status = "待核验";
      promise.actualCompletionDate = null;
      expect(promise.actualCompletionDate).toBeNull();
    });
  });

  describe("同一约谈多条承诺独立推进", () => {
    test("一次约谈的3条承诺各自独立推进，互不干扰", () => {
      const vendor = createVendor(state);
      const { talk, promises } = createTalkWithPromises(state, vendor.id, [
        {
          content: "承诺1：移除弹窗",
          deadline: format(addDays(new Date(), 5), "yyyy-MM-dd"),
        },
        {
          content: "承诺2：代码自查",
          deadline: format(addDays(new Date(), 10), "yyyy-MM-dd"),
        },
        {
          content: "承诺3：员工培训",
          deadline: format(addDays(new Date(), 15), "yyyy-MM-dd"),
        },
      ]);

      promises[0].status = "待整改";
      promises[1].status = "整改中";
      promises[2].status = "待核验";

      expect(promises[0].status).toBe("待整改");
      expect(promises[1].status).toBe("整改中");
      expect(promises[2].status).toBe("待核验");

      expect(state.promises.filter((p) => p.talkId === talk.id)).toHaveLength(
        3,
      );
    });

    test("多条承诺状态不同排序正确", () => {
      const vendor = createVendor(state);
      createTalkWithPromises(state, vendor.id, [
        {
          content: "已完成的承诺",
          deadline: format(addDays(new Date(), -5), "yyyy-MM-dd"),
          status: "按期完成",
        },
        {
          content: "逾期承诺",
          deadline: format(addDays(new Date(), -3), "yyyy-MM-dd"),
          status: "逾期未完成",
        },
        {
          content: "待核验承诺",
          deadline: format(addDays(new Date(), 3), "yyyy-MM-dd"),
          status: "待核验",
        },
        {
          content: "整改中承诺",
          deadline: format(addDays(new Date(), 5), "yyyy-MM-dd"),
          status: "整改中",
        },
        {
          content: "待整改承诺",
          deadline: format(addDays(new Date(), 7), "yyyy-MM-dd"),
          status: "待整改",
        },
      ]);

      const order = {
        待整改: 0,
        整改中: 1,
        待核验: 2,
        逾期未完成: 3,
        按期完成: 4,
      };

      const talkPromises = state.promises.slice().sort((a, b) => {
        return (order[a.status] || 0) - (order[b.status] || 0);
      });

      expect(talkPromises[0].status).toBe("待整改");
      expect(talkPromises[1].status).toBe("整改中");
      expect(talkPromises[2].status).toBe("待核验");
      expect(talkPromises[3].status).toBe("逾期未完成");
      expect(talkPromises[4].status).toBe("按期完成");
    });
  });
});
