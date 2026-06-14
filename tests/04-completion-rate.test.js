const { format, addDays } = require("date-fns");
const {
  createFreshState,
  createVendor,
  createTalkWithPromises,
  submitEvidence,
  createVerification,
  getFirstTimePassRate,
} = require("./setup");

describe("按期完成率与一次性核验通过率算法（Completion Rate Calculation）", () => {
  let state;

  beforeEach(() => {
    state = createFreshState();
  });

  describe("按期完成率 - onTimeCompletionRate", () => {
    function calcOnTimeRate(promises) {
      const total = promises.length;
      const onTime = promises.filter((p) => p.status === "按期完成").length;
      return total > 0 ? Number(((onTime / total) * 100).toFixed(2)) : 0;
    }

    test("全部按期完成：完成率 100.00%", () => {
      const today = new Date();
      const vendor = createVendor(state);
      createTalkWithPromises(state, vendor.id, [
        {
          content: "承诺1",
          deadline: format(addDays(today, -5), "yyyy-MM-dd"),
          status: "按期完成",
          actualCompletionDate: format(addDays(today, -7), "yyyy-MM-dd"),
        },
        {
          content: "承诺2",
          deadline: format(addDays(today, -3), "yyyy-MM-dd"),
          status: "按期完成",
          actualCompletionDate: format(addDays(today, -4), "yyyy-MM-dd"),
        },
        {
          content: "承诺3",
          deadline: format(addDays(today, -1), "yyyy-MM-dd"),
          status: "按期完成",
          actualCompletionDate: format(addDays(today, -2), "yyyy-MM-dd"),
        },
      ]);

      const rate = calcOnTimeRate(state.promises);
      expect(rate).toBe(100.0);
      expect(rate.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
    });

    test("全部逾期：完成率 0.00%", () => {
      const today = new Date();
      const vendor = createVendor(state);
      createTalkWithPromises(state, vendor.id, [
        {
          content: "承诺1",
          deadline: format(addDays(today, -10), "yyyy-MM-dd"),
          status: "逾期未完成",
        },
        {
          content: "承诺2",
          deadline: format(addDays(today, -8), "yyyy-MM-dd"),
          status: "逾期未完成",
        },
      ]);

      const rate = calcOnTimeRate(state.promises);
      expect(rate).toBe(0.0);
    });

    test("混合场景：3条完成、2条逾期、1条整改中 → 完成率=3/6=50.00%", () => {
      const today = new Date();
      const vendor = createVendor(state);
      createTalkWithPromises(state, vendor.id, [
        {
          content: "按期1",
          deadline: format(addDays(today, -5), "yyyy-MM-dd"),
          status: "按期完成",
        },
        {
          content: "按期2",
          deadline: format(addDays(today, -4), "yyyy-MM-dd"),
          status: "按期完成",
        },
        {
          content: "按期3",
          deadline: format(addDays(today, -3), "yyyy-MM-dd"),
          status: "按期完成",
        },
        {
          content: "逾期1",
          deadline: format(addDays(today, -5), "yyyy-MM-dd"),
          status: "逾期未完成",
        },
        {
          content: "逾期2",
          deadline: format(addDays(today, -3), "yyyy-MM-dd"),
          status: "逾期未完成",
        },
        {
          content: "整改中",
          deadline: format(addDays(today, 7), "yyyy-MM-dd"),
          status: "整改中",
        },
      ]);

      const rate = calcOnTimeRate(state.promises);
      expect(rate).toBe(50.0);
      expect(
        state.promises.filter((p) => p.status === "按期完成"),
      ).toHaveLength(3);
      expect(
        state.promises.filter((p) => p.status === "逾期未完成"),
      ).toHaveLength(2);
      expect(state.promises).toHaveLength(6);
    });

    test("0条承诺：完成率为 0（避免除零错误）", () => {
      const vendor = createVendor(state);
      createTalkWithPromises(state, vendor.id, []);
      const vendorPromises = state.promises.filter(
        (p) => p.vendorId === vendor.id,
      );
      const rate = calcOnTimeRate(vendorPromises);
      expect(rate).toBe(0);
    });

    test("保留2位小数精度：5/7≈71.43%", () => {
      const today = new Date();
      const vendor = createVendor(state);
      for (let i = 0; i < 5; i++) {
        createTalkWithPromises(state, vendor.id, [
          {
            content: `按期承诺${i}`,
            deadline: format(addDays(today, -i - 1), "yyyy-MM-dd"),
            status: "按期完成",
          },
        ]);
      }
      for (let i = 0; i < 2; i++) {
        createTalkWithPromises(state, vendor.id, [
          {
            content: `逾期承诺${i}`,
            deadline: format(addDays(today, -i - 10), "yyyy-MM-dd"),
            status: "逾期未完成",
          },
        ]);
      }

      const rate = calcOnTimeRate(state.promises);
      expect(rate).toBe(71.43);
      expect(Math.round(rate * 100)).toBe(7143);
    });

    test("结果四舍五入正确：1/3≈33.33%", () => {
      const today = new Date();
      const vendor = createVendor(state);
      createTalkWithPromises(state, vendor.id, [
        {
          content: "按期",
          deadline: format(addDays(today, -3), "yyyy-MM-dd"),
          status: "按期完成",
        },
        {
          content: "逾期1",
          deadline: format(addDays(today, -3), "yyyy-MM-dd"),
          status: "逾期未完成",
        },
        {
          content: "逾期2",
          deadline: format(addDays(today, -3), "yyyy-MM-dd"),
          status: "逾期未完成",
        },
      ]);

      const rate = calcOnTimeRate(state.promises);
      expect(rate).toBe(33.33);
    });

    test("多次约谈混合汇总：2次约谈共5条承诺，3条完成 → 60%", () => {
      const today = new Date();
      const vendor = createVendor(state);

      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "T1-P1",
            deadline: format(addDays(today, -10), "yyyy-MM-dd"),
            status: "按期完成",
          },
          {
            content: "T1-P2",
            deadline: format(addDays(today, -9), "yyyy-MM-dd"),
            status: "逾期未完成",
          },
        ],
        { talkTime: format(addDays(today, -20), "yyyy-MM-dd HH:mm:ss") },
      );

      createTalkWithPromises(
        state,
        vendor.id,
        [
          {
            content: "T2-P1",
            deadline: format(addDays(today, -5), "yyyy-MM-dd"),
            status: "按期完成",
          },
          {
            content: "T2-P2",
            deadline: format(addDays(today, -4), "yyyy-MM-dd"),
            status: "按期完成",
          },
          {
            content: "T2-P3",
            deadline: format(addDays(today, -3), "yyyy-MM-dd"),
            status: "逾期未完成",
          },
        ],
        { talkTime: format(addDays(today, -10), "yyyy-MM-dd HH:mm:ss") },
      );

      const rate = calcOnTimeRate(state.promises);
      expect(rate).toBe(60.0);
    });
  });

  describe("一次性核验通过率 - getFirstTimePassRate", () => {
    test("0条核验记录：返回 0%", () => {
      const vendor = createVendor(state);
      createTalkWithPromises(state, vendor.id, [
        {
          content: "待整改承诺",
          deadline: format(addDays(new Date(), 7), "yyyy-MM-dd"),
        },
      ]);

      const ftp = getFirstTimePassRate(state);
      expect(ftp.rate).toBe(0);
      expect(ftp.total).toBe(0);
      expect(ftp.firstPass).toBe(0);
    });

    test("全部一次通过：通过率 100%", () => {
      const today = new Date();
      const vendor = createVendor(state);

      for (let i = 0; i < 4; i++) {
        const { promises } = createTalkWithPromises(state, vendor.id, [
          {
            content: `承诺${i}`,
            deadline: format(addDays(today, -i - 3), "yyyy-MM-dd"),
            status: "待核验",
          },
        ]);
        const promise = promises[0];
        const sub = submitEvidence(state, promise.id, addDays(today, -i - 4));
        createVerification(
          state,
          promise.id,
          sub.id,
          "通过",
          addDays(today, -i - 3),
        );
        promise.status = "按期完成";
        promise.actualCompletionDate = format(
          addDays(today, -i - 3),
          "yyyy-MM-dd",
        );
      }

      const ftp = getFirstTimePassRate(state);
      expect(ftp.rate).toBe(100.0);
      expect(ftp.total).toBe(4);
      expect(ftp.firstPass).toBe(4);
    });

    test("一次通过与多次通过混合：3/5 = 60%", () => {
      const today = new Date();
      const vendor = createVendor(state);

      function createPromiseWithFlow(passOnFirstTry, idx) {
        const { promises } = createTalkWithPromises(state, vendor.id, [
          {
            content: `承诺${idx}`,
            deadline: format(addDays(today, -10), "yyyy-MM-dd"),
            status: "待核验",
          },
        ]);
        const promise = promises[0];

        if (passOnFirstTry) {
          const sub = submitEvidence(state, promise.id, addDays(today, -8));
          createVerification(
            state,
            promise.id,
            sub.id,
            "通过",
            addDays(today, -7),
          );
        } else {
          const sub1 = submitEvidence(state, promise.id, addDays(today, -8));
          createVerification(
            state,
            promise.id,
            sub1.id,
            "不通过",
            addDays(today, -7),
            {
              remark: "材料不齐全",
            },
          );
          promise.status = "整改中";

          const sub2 = submitEvidence(state, promise.id, addDays(today, -6));
          createVerification(
            state,
            promise.id,
            sub2.id,
            "通过",
            addDays(today, -5),
          );
        }

        promise.status = "按期完成";
        promise.actualCompletionDate = format(addDays(today, -5), "yyyy-MM-dd");
      }

      createPromiseWithFlow(true, 1);
      createPromiseWithFlow(true, 2);
      createPromiseWithFlow(true, 3);
      createPromiseWithFlow(false, 4);
      createPromiseWithFlow(false, 5);

      const ftp = getFirstTimePassRate(state);
      expect(ftp.rate).toBe(60.0);
      expect(ftp.total).toBe(5);
      expect(ftp.firstPass).toBe(3);
    });

    test("被多次驳回才通过的承诺：首次核验非通过，不计入首次通过数", () => {
      const today = new Date();
      const vendor = createVendor(state);
      const { promises } = createTalkWithPromises(state, vendor.id, [
        {
          content: "多次驳回的承诺",
          deadline: format(addDays(today, -20), "yyyy-MM-dd"),
          status: "待核验",
        },
      ]);
      const promise = promises[0];

      const sub1 = submitEvidence(state, promise.id, addDays(today, -18));
      createVerification(
        state,
        promise.id,
        sub1.id,
        "不通过",
        addDays(today, -17),
        {
          remark: "第1次驳回",
        },
      );
      promise.status = "整改中";

      const sub2 = submitEvidence(state, promise.id, addDays(today, -15));
      createVerification(
        state,
        promise.id,
        sub2.id,
        "不通过",
        addDays(today, -14),
        {
          remark: "第2次驳回",
        },
      );
      promise.status = "整改中";

      const sub3 = submitEvidence(state, promise.id, addDays(today, -12));
      createVerification(
        state,
        promise.id,
        sub3.id,
        "通过",
        addDays(today, -11),
      );
      promise.status = "按期完成";
      promise.actualCompletionDate = format(addDays(today, -11), "yyyy-MM-dd");

      const ftp = getFirstTimePassRate(state);
      expect(ftp.rate).toBe(0.0);
      expect(ftp.total).toBe(1);
      expect(ftp.firstPass).toBe(0);

      const records = state.verificationRecords
        .filter((r) => r.promiseId === promise.id)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      expect(records).toHaveLength(3);
      expect(records[0].result).toBe("不通过");
    });

    test("核验记录按时间升序后取首条判断是否一次性通过", () => {
      const today = new Date();
      const vendor = createVendor(state);
      const { promises } = createTalkWithPromises(state, vendor.id, [
        {
          content: "乱序提交的承诺",
          deadline: format(addDays(today, -10), "yyyy-MM-dd"),
          status: "待核验",
        },
      ]);
      const promise = promises[0];

      const subLate = submitEvidence(state, promise.id, addDays(today, -3));
      const late = createVerification(
        state,
        promise.id,
        subLate.id,
        "通过",
        addDays(today, -2),
      );

      const subEarly = submitEvidence(state, promise.id, addDays(today, -8));
      const early = createVerification(
        state,
        promise.id,
        subEarly.id,
        "不通过",
        addDays(today, -7),
        { remark: "首次提交不合格" },
      );

      promise.status = "按期完成";
      promise.actualCompletionDate = format(addDays(today, -2), "yyyy-MM-dd");

      const ftp = getFirstTimePassRate(state);
      expect(ftp.rate).toBe(0.0);
      expect(ftp.total).toBe(1);
      expect(ftp.firstPass).toBe(0);
    });

    test("只统计有通过记录的承诺：未通过的承诺不参与统计", () => {
      const today = new Date();
      const vendor = createVendor(state);

      const r1 = createTalkWithPromises(state, vendor.id, [
        {
          content: "已通过承诺",
          deadline: format(addDays(today, -5), "yyyy-MM-dd"),
          status: "按期完成",
        },
      ]);
      const sub1 = submitEvidence(state, r1.promises[0].id, addDays(today, -6));
      createVerification(
        state,
        r1.promises[0].id,
        sub1.id,
        "通过",
        addDays(today, -5),
      );

      const r2 = createTalkWithPromises(state, vendor.id, [
        {
          content: "只被驳回过的承诺",
          deadline: format(addDays(today, -4), "yyyy-MM-dd"),
          status: "整改中",
        },
      ]);
      const sub2 = submitEvidence(state, r2.promises[0].id, addDays(today, -5));
      createVerification(
        state,
        r2.promises[0].id,
        sub2.id,
        "不通过",
        addDays(today, -4),
      );

      const r3 = createTalkWithPromises(state, vendor.id, [
        {
          content: "从未提交材料的承诺",
          deadline: format(addDays(today, 3), "yyyy-MM-dd"),
          status: "待整改",
        },
      ]);

      const ftp = getFirstTimePassRate(state);
      expect(ftp.total).toBe(1);
      expect(ftp.firstPass).toBe(1);
      expect(ftp.rate).toBe(100.0);
    });

    test("按过滤子集计算：仅统计某厂商的承诺", () => {
      const today = new Date();
      const vendorA = createVendor(state, { name: "厂商A" });
      const vendorB = createVendor(state, { name: "厂商B" });

      for (let i = 0; i < 5; i++) {
        const r = createTalkWithPromises(state, vendorA.id, [
          {
            content: `A${i}`,
            deadline: format(addDays(today, -10), "yyyy-MM-dd"),
            status: "待核验",
          },
        ]);
        const sub = submitEvidence(state, r.promises[0].id, addDays(today, -9));
        createVerification(
          state,
          r.promises[0].id,
          sub.id,
          i < 4 ? "通过" : "不通过",
          addDays(today, -8),
        );
        if (i < 4) {
          r.promises[0].status = "按期完成";
          r.promises[0].actualCompletionDate = format(
            addDays(today, -8),
            "yyyy-MM-dd",
          );
        } else {
          r.promises[0].status = "整改中";
        }
      }

      for (let i = 0; i < 3; i++) {
        const r = createTalkWithPromises(state, vendorB.id, [
          {
            content: `B${i}`,
            deadline: format(addDays(today, -10), "yyyy-MM-dd"),
            status: "待核验",
          },
        ]);
        const sub = submitEvidence(state, r.promises[0].id, addDays(today, -9));
        createVerification(
          state,
          r.promises[0].id,
          sub.id,
          "通过",
          addDays(today, -8),
        );
        r.promises[0].status = "按期完成";
      }

      const vendorAPromises = state.promises.filter(
        (p) => p.vendorId === vendorA.id,
      );
      const ftpA = getFirstTimePassRate(state, vendorAPromises);
      expect(ftpA.rate).toBe(100.0);
      expect(ftpA.total).toBe(4);

      const overallFtp = getFirstTimePassRate(state);
      expect(overallFtp.total).toBe(7);
    });
  });

  describe("算法边界与精度保护", () => {
    test("完成率不会超过 100%（理论上限保护）", () => {
      const today = new Date();
      const vendor = createVendor(state);
      for (let i = 0; i < 100; i++) {
        createTalkWithPromises(state, vendor.id, [
          {
            content: `完成${i}`,
            deadline: format(addDays(today, -i - 1), "yyyy-MM-dd"),
            status: "按期完成",
          },
        ]);
      }

      const total = state.promises.length;
      const onTime = state.promises.filter(
        (p) => p.status === "按期完成",
      ).length;
      const rate = total > 0 ? Number(((onTime / total) * 100).toFixed(2)) : 0;
      expect(rate).toBeLessThanOrEqual(100.0);
      expect(rate).toBe(100.0);
    });

    test("完成率不会小于 0（理论下限保护）", () => {
      const today = new Date();
      const vendor = createVendor(state);
      for (let i = 0; i < 50; i++) {
        createTalkWithPromises(state, vendor.id, [
          {
            content: `逾期${i}`,
            deadline: format(addDays(today, -i - 1), "yyyy-MM-dd"),
            status: "逾期未完成",
          },
        ]);
      }

      const total = state.promises.length;
      const onTime = state.promises.filter(
        (p) => p.status === "按期完成",
      ).length;
      const rate = total > 0 ? Number(((onTime / total) * 100).toFixed(2)) : 0;
      expect(rate).toBeGreaterThanOrEqual(0.0);
      expect(rate).toBe(0.0);
    });

    test("toFixed(2) 保证最多 2 位小数", () => {
      const rates = [
        { onTime: 1, total: 3, expected: 33.33 },
        { onTime: 2, total: 3, expected: 66.67 },
        { onTime: 1, total: 6, expected: 16.67 },
        { onTime: 1, total: 8, expected: 12.5 },
        { onTime: 7, total: 8, expected: 87.5 },
      ];

      rates.forEach(({ onTime, total, expected }) => {
        const rate = Number(((onTime / total) * 100).toFixed(2));
        expect(rate).toBe(expected);
        const str = rate.toString();
        if (str.includes(".")) {
          expect(str.split(".")[1].length).toBeLessThanOrEqual(2);
        }
      });
    });
  });
});
