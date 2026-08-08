import { describe, expect, it } from "vitest";

import {
  createActionGuide,
  MAX_ACTION_GUIDE_ITEMS,
  type ActionGuideInput,
} from "./actionGuide";
import type { CashRiskAnalysis } from "./cashRiskAnalyzer";
import type { CategorySummary } from "./categoryAggregator";
import {
  createScenarioForecastAnalyses,
  type MonthlyForecast,
} from "./forecastEngine";
import type { RecurringTransaction } from "./recurringTransactionDetector";
import type { ScheduledTransaction } from "./scheduledTransaction";

function recurring(
  overrides: Partial<RecurringTransaction>,
): RecurringTransaction {
  return {
    description: "정기 거래",
    category: "other",
    categoryName: "기타",
    type: "expense",
    averageAmount: 0,
    monthlyAmounts: [],
    occurrenceCount: 3,
    activeMonthCount: 3,
    firstMonth: "2026-01",
    lastMonth: "2026-03",
    confidence: "high",
    ...overrides,
  };
}

function createDay8Analyses() {
  return createScenarioForecastAnalyses(
    [
      recurring({
        description: "상품판매",
        category: "revenue",
        categoryName: "매출",
        type: "income",
        averageAmount: 950000,
        monthlyAmounts: [
          { month: "2026-01", amount: 900000 },
          { month: "2026-02", amount: 950000 },
          { month: "2026-03", amount: 1000000 },
        ],
      }),
      recurring({ description: "월세", averageAmount: 700000 }),
      recurring({ description: "전기요금", averageAmount: 82333.33 }),
    ],
    -497000,
  );
}

function risk(
  overrides: Partial<CashRiskAnalysis> = {},
): CashRiskAnalysis {
  return {
    level: "warning",
    negativeMonthCount: 1,
    lowestBalance: -100,
    lowestBalanceMonth: "2026-04",
    recoveryMonth: "2026-05",
    requiredCashBuffer: 100,
    message: "테스트 위험",
    ...overrides,
  };
}

function forecast(
  month: string,
  overrides: Partial<MonthlyForecast> = {},
): MonthlyForecast {
  return {
    month,
    scenario: "base",
    baseRecurringIncome: 200,
    recurringIncome: 200,
    scheduledIncome: 0,
    expectedIncome: 200,
    recurringExpense: 100,
    scheduledExpense: 0,
    expectedExpense: 100,
    expectedNetCashFlow: 100,
    startingBalance: 0,
    expectedEndingBalance: 100,
    recurringIncomeCount: 1,
    recurringExpenseCount: 1,
    ...overrides,
  };
}

function input(
  overrides: Partial<ActionGuideInput> = {},
): ActionGuideInput {
  return {
    forecasts: [
      forecast("2026-04"),
      forecast("2026-05", { startingBalance: 100, expectedEndingBalance: 200 }),
      forecast("2026-06", { startingBalance: 200, expectedEndingBalance: 300 }),
    ],
    cashRisk: risk(),
    categorySummaries: [],
    monthlyCategorySummaries: [],
    scheduledTransactions: [],
    ...overrides,
  };
}

function category(
  shareOfExpense: number,
  amount = 700000,
): CategorySummary {
  return {
    category: "rent",
    categoryName: "임차료",
    amount,
    transactionCount: 3,
    shareOfExpense,
  };
}

describe("createActionGuide", () => {
  it("Day 8 기준 시나리오에서 자금 확보와 회복 액션을 생성한다", () => {
    const analysis = createDay8Analyses().base;
    const actions = createActionGuide(
      input({
        forecasts: analysis.forecasts,
        cashRisk: analysis.cashRisk,
      }),
    );
    const shortage = actions.find((item) => item.type === "cash_shortage");

    expect(shortage).toMatchObject({
      title: "단기 자금 확보 필요",
      amount: analysis.cashRisk?.requiredCashBuffer,
    });
    expect(shortage?.action).toContain("229,333원");
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "cash_recovery", month: "2026-05" }),
      ]),
    );
  });

  it("반복 출금 대비 버퍼 비율로 critical·high·medium을 정한다", () => {
    const priorities = [
      [100, "critical"],
      [50, "high"],
      [49, "medium"],
    ] as const;

    for (const [requiredCashBuffer, expectedPriority] of priorities) {
      const actions = createActionGuide(
        input({
          cashRisk: risk({
            requiredCashBuffer,
            lowestBalance: -requiredCashBuffer,
          }),
        }),
      );

      expect(actions.find((item) => item.type === "cash_shortage")?.priority).toBe(
        expectedPriority,
      );
    }
  });

  it("부족기간이 2개월 이상이면 별도의 장기 부족 액션을 만든다", () => {
    const actions = createActionGuide(
      input({ cashRisk: risk({ negativeMonthCount: 2 }) }),
    );

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "extended_shortage",
          priority: "high",
        }),
      ]),
    );
  });

  it("지출 집중도가 50% 이상일 때만 집중도 액션을 만든다", () => {
    expect(
      createActionGuide(input({ categorySummaries: [category(67.6)] })),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "expense_concentration",
          priority: "medium",
        }),
      ]),
    );
    expect(
      createActionGuide(input({ categorySummaries: [category(80, 0)] })).some(
        (item) => item.type === "expense_concentration",
      ),
    ).toBe(false);
  });

  it("Forecast 기간의 가장 가까운 예정 입금을 대표 액션으로 사용한다", () => {
    const scheduledTransactions: ScheduledTransaction[] = [
      {
        id: "later",
        date: "2026-06-10",
        description: "후순위 입금",
        type: "income",
        amount: 900000,
      },
      {
        id: "nearest",
        date: "2026-05-10",
        description: "거래처 입금",
        type: "income",
        amount: 500000,
      },
      {
        id: "outside",
        date: "2026-07-01",
        description: "기간 밖 입금",
        type: "income",
        amount: 1000000,
      },
    ];
    const action = createActionGuide(
      input({ scheduledTransactions }),
    ).find((item) => item.type === "scheduled_income");

    expect(action).toMatchObject({
      priority: "high",
      amount: 500000,
      month: "2026-05",
    });
    expect(action?.message).toContain("2026년 5월 10일");
    expect(action?.message).toContain("500,000원");
  });

  it("자금 부족이 없고 최종 잔액이 증가하면 양호 액션을 만든다", () => {
    const actions = createActionGuide(
      input({
        cashRisk: risk({
          level: "safe",
          negativeMonthCount: 0,
          lowestBalance: 100,
          recoveryMonth: "2026-04",
          requiredCashBuffer: 0,
        }),
      }),
    );

    expect(actions).toEqual([
      expect.objectContaining({
        type: "healthy_cashflow",
        priority: "low",
      }),
    ]);
  });

  it("우선순위 순으로 정렬한다", () => {
    const actions = createActionGuide(
      input({
        cashRisk: risk({ requiredCashBuffer: 100, lowestBalance: -100 }),
        categorySummaries: [category(60)],
        scheduledTransactions: [
          {
            id: "income",
            date: "2026-05-10",
            description: "거래처 입금",
            type: "income",
            amount: 500,
          },
        ],
      }),
    );

    expect(actions.map((item) => item.priority)).toEqual([
      "critical",
      "high",
      "medium",
      "low",
    ]);
  });

  it("중복 타입을 제거하고 최대 4개까지만 표시한다", () => {
    const actions = createActionGuide(
      input({
        cashRisk: risk({
          negativeMonthCount: 2,
          requiredCashBuffer: 100,
        }),
        categorySummaries: [category(80)],
        scheduledTransactions: [
          {
            id: "income",
            date: "2026-05-10",
            description: "거래처 입금",
            type: "income",
            amount: 500,
          },
        ],
      }),
    );

    expect(actions).toHaveLength(MAX_ACTION_GUIDE_ITEMS);
    expect(new Set(actions.map((item) => item.type)).size).toBe(actions.length);
  });

  it("시나리오별 cashRisk 버퍼를 그대로 액션 금액에 반영하고 Forecast를 변경하지 않는다", () => {
    const analyses = createDay8Analyses();

    for (const scenario of ["conservative", "base", "optimistic"] as const) {
      const analysis = analyses[scenario];
      const originalForecasts = structuredClone(analysis.forecasts);
      const shortage = createActionGuide(
        input({
          forecasts: analysis.forecasts,
          cashRisk: analysis.cashRisk,
        }),
      ).find((item) => item.type === "cash_shortage");

      expect(shortage?.amount).toBe(analysis.cashRisk?.requiredCashBuffer);
      expect(shortage?.action).toContain(
        `${Math.round(analysis.cashRisk?.requiredCashBuffer ?? 0).toLocaleString("ko-KR")}원`,
      );
      expect(analysis.forecasts).toEqual(originalForecasts);
    }
  });
});
