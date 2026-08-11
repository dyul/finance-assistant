import { describe, expect, it } from "vitest";

import type { RecurringTransaction } from "./recurringTransactionDetector";
import type { ScheduledTransaction } from "./scheduledTransaction";
import { calculateIncomeTrend } from "./incomeTrend";
import {
  createForecastAnalysis,
  createScenarioForecastAnalyses,
  generateCashFlowForecast,
} from "./forecastEngine";
import { calculateScenarioSpread } from "./forecastScenario";

function createRecurringTransaction(
  overrides: Partial<RecurringTransaction>,
): RecurringTransaction {
  return {
    description: "정기 거래",
    category: "other",
    categoryName: "기타",
    type: "expense",
    averageAmount: 0,
    monthlyAmounts: [],
    occurrenceCount: 2,
    activeMonthCount: 2,
    firstMonth: "2023-12",
    lastMonth: "2024-01",
    confidence: "high",
    ...overrides,
  };
}

function createIncomeRecurringTransaction(
  amounts: number[],
): RecurringTransaction {
  const monthlyAmounts = amounts.map((amount, index) => ({
    month: `2026-${String(index + 1).padStart(2, "0")}`,
    amount,
  }));

  return createRecurringTransaction({
    description: "상품판매",
    category: "revenue",
    categoryName: "매출",
    type: "income",
    averageAmount:
      amounts.reduce((total, amount) => total + amount, 0) /
      amounts.length,
    monthlyAmounts,
    occurrenceCount: amounts.length,
    activeMonthCount: amounts.length,
    firstMonth: monthlyAmounts[0]?.month ?? "2026-01",
    lastMonth: monthlyAmounts.at(-1)?.month ?? "2026-01",
  });
}

describe("반복 수입 추세 계산", () => {
  it("3개월 증가 추세를 향후 반복 수입에 반영한다", () => {
    const forecasts = generateCashFlowForecast(
      [createIncomeRecurringTransaction([900_000, 950_000, 1_000_000])],
      0,
    );

    expect(forecasts.map((forecast) => forecast.recurringIncome)).toEqual([
      1_050_000,
      1_100_000,
      1_150_000,
    ]);
    expect(forecasts.every((forecast) => forecast.baseRecurringIncome === 950_000)).toBe(true);
  });

  it("3개월 감소 추세를 향후 반복 수입에 반영한다", () => {
    const forecasts = generateCashFlowForecast(
      [createIncomeRecurringTransaction([1_000_000, 900_000, 800_000])],
      0,
    );

    expect(forecasts.map((forecast) => forecast.recurringIncome)).toEqual([
      700_000,
      600_000,
      500_000,
    ]);
  });

  it("서로 다른 월이 2개뿐이면 기존 평균 금액을 유지한다", () => {
    const forecasts = generateCashFlowForecast(
      [createIncomeRecurringTransaction([900_000, 1_000_000])],
      0,
    );

    expect(forecasts.map((forecast) => forecast.recurringIncome)).toEqual([
      950_000,
      950_000,
      950_000,
    ]);
  });

  it("큰 월간 증감액을 평균 월 금액의 50%로 제한한다", () => {
    const transaction = createIncomeRecurringTransaction([100, 100, 1000]);
    const trend = calculateIncomeTrend(transaction.monthlyAmounts);
    const forecasts = generateCashFlowForecast([transaction], 0);

    expect(trend).toMatchObject({
      averageMonthlyAmount: 400,
      rawMonthlyChange: 450,
      cappedMonthlyChange: 200,
      wasCapped: true,
    });
    expect(forecasts.map((forecast) => forecast.recurringIncome)).toEqual([
      1200,
      1400,
      1600,
    ]);
  });

  it("추세와 확정 예정 거래를 같은 Forecast에 함께 반영한다", () => {
    const scheduledTransactions: ScheduledTransaction[] = [
      {
        id: "scheduled-income",
        date: "2026-04-15",
        description: "추가 확정 입금",
        type: "income",
        amount: 100_000,
      },
      {
        id: "scheduled-expense",
        date: "2026-04-20",
        description: "추가 확정 출금",
        type: "expense",
        amount: 50_000,
      },
    ];
    const forecasts = generateCashFlowForecast(
      [
        createIncomeRecurringTransaction([
          900_000,
          950_000,
          1_000_000,
        ]),
        createRecurringTransaction({
          averageAmount: 700_000,
          lastMonth: "2026-03",
        }),
      ],
      0,
      3,
      scheduledTransactions,
    );

    expect(forecasts[0]).toMatchObject({
      recurringIncome: 1_050_000,
      scheduledIncome: 100_000,
      expectedIncome: 1_150_000,
      recurringExpense: 700_000,
      scheduledExpense: 50_000,
      expectedExpense: 750_000,
      expectedNetCashFlow: 400_000,
      expectedEndingBalance: 400_000,
    });
    expect(forecasts[1]).toMatchObject({
      startingBalance: 400_000,
      expectedNetCashFlow: 400_000,
      expectedEndingBalance: 800_000,
    });
  });

  it("Day 8 예시의 잔액 이월과 현금 위험 분석을 유지한다", () => {
    const recurringTransactions = [
      createIncomeRecurringTransaction([
        900_000,
        950_000,
        1_000_000,
      ]),
      createRecurringTransaction({
        description: "월세",
        averageAmount: 700_000,
        lastMonth: "2026-03",
      }),
      createRecurringTransaction({
        description: "전기요금",
        averageAmount: 82_333.33,
        lastMonth: "2026-03",
      }),
    ];
    const analysis = createForecastAnalysis(
      recurringTransactions,
      -497_000,
    );

    expect(analysis.forecasts[0]?.expectedNetCashFlow).toBeCloseTo(
      267_666.67,
      2,
    );
    expect(analysis.forecasts[0]?.expectedEndingBalance).toBeCloseTo(
      -229_333.33,
      2,
    );
    expect(analysis.forecasts[1]?.startingBalance).toBeCloseTo(
      -229_333.33,
      2,
    );
    expect(analysis.forecasts[1]?.expectedEndingBalance).toBeCloseTo(
      88_333.34,
      2,
    );
    expect(analysis.forecasts[2]?.expectedEndingBalance).toBeCloseTo(
      456_000.01,
      2,
    );
    expect(analysis.cashRisk).toMatchObject({
      level: "warning",
      negativeMonthCount: 1,
      lowestBalanceMonth: "2026-04",
      recoveryMonth: "2026-05",
    });
    expect(analysis.cashRisk?.lowestBalance).toBeCloseTo(-229_333.33, 2);
    expect(analysis.cashRisk?.requiredCashBuffer).toBeCloseTo(
      229_333.33,
      2,
    );
  });

  it("반복 출금 평균의 내부 소수점을 이월해 표시값 간 1원 차이를 설명한다", () => {
    const recurringTransactions = [
      createIncomeRecurringTransaction([
        900_000,
        950_000,
        1_000_000,
      ]),
      createRecurringTransaction({
        description: "월세",
        averageAmount: 700_000,
        lastMonth: "2026-03",
      }),
      createRecurringTransaction({
        description: "전기요금",
        averageAmount: 247_000 / 3,
        lastMonth: "2026-03",
      }),
    ];
    const forecasts = createForecastAnalysis(
      recurringTransactions,
      -497_000,
    ).forecasts;
    const april = forecasts[0];
    const may = forecasts[1];

    expect(april.expectedEndingBalance).toBeCloseTo(
      -229_333.333_333,
      6,
    );
    expect(may.expectedNetCashFlow).toBeCloseTo(
      317_666.666_667,
      6,
    );
    expect(may.expectedEndingBalance).toBeCloseTo(
      88_333.333_333,
      6,
    );
    expect(
      Math.round(april.expectedEndingBalance) +
        Math.round(may.expectedNetCashFlow),
    ).toBe(88_334);
    expect(Math.round(may.expectedEndingBalance)).toBe(88_333);
  });
});

describe("3개월 Forecast 시나리오", () => {
  it("3개월 증가 수입의 평균 절대 변동률을 계산한다", () => {
    const transaction = createIncomeRecurringTransaction([
      900_000,
      950_000,
      1_000_000,
    ]);
    const expectedSpread =
      (Math.abs(950_000 / 900_000 - 1) +
        Math.abs(1_000_000 / 950_000 - 1)) /
      2;

    expect(
      calculateScenarioSpread(transaction.monthlyAmounts),
    ).toBeCloseTo(expectedSpread, 10);
  });

  it("작은 변동성은 최소 5%로 제한한다", () => {
    const transaction = createIncomeRecurringTransaction([100, 102, 104]);

    expect(calculateScenarioSpread(transaction.monthlyAmounts)).toBe(0.05);
  });

  it("큰 변동성은 최대 20%로 제한한다", () => {
    const transaction = createIncomeRecurringTransaction([100, 200, 400]);

    expect(calculateScenarioSpread(transaction.monthlyAmounts)).toBe(0.2);
  });

  it("3개월 미만 데이터는 기본 10%를 사용한다", () => {
    const transaction = createIncomeRecurringTransaction([900, 1000]);

    expect(calculateScenarioSpread(transaction.monthlyAmounts)).toBe(0.1);
  });

  it("보수·기준·낙관 수입과 잔액을 각각 독립적으로 이월한다", () => {
    const recurringTransactions = [
      createIncomeRecurringTransaction([
        900_000,
        950_000,
        1_000_000,
      ]),
      createRecurringTransaction({
        description: "월세",
        averageAmount: 700_000,
        lastMonth: "2026-03",
      }),
      createRecurringTransaction({
        description: "전기요금",
        averageAmount: 82_333.33,
        lastMonth: "2026-03",
      }),
    ];
    const analyses = createScenarioForecastAnalyses(
      recurringTransactions,
      -497_000,
    );
    const spread = calculateScenarioSpread(
      recurringTransactions[0].monthlyAmounts,
    );

    for (let index = 0; index < 3; index += 1) {
      const conservative = analyses.conservative.forecasts[index];
      const base = analyses.base.forecasts[index];
      const optimistic = analyses.optimistic.forecasts[index];

      expect(conservative.recurringIncome).toBeLessThan(
        base.recurringIncome,
      );
      expect(base.recurringIncome).toBeLessThan(
        optimistic.recurringIncome,
      );
      expect(conservative.recurringIncome).toBeCloseTo(
        base.recurringIncome * (1 - spread),
        6,
      );
      expect(optimistic.recurringIncome).toBeCloseTo(
        base.recurringIncome * (1 + spread),
        6,
      );
      expect(conservative.recurringExpense).toBe(
        base.recurringExpense,
      );
      expect(optimistic.recurringExpense).toBe(base.recurringExpense);

      if (index > 0) {
        expect(conservative.startingBalance).toBeCloseTo(
          analyses.conservative.forecasts[index - 1]
            .expectedEndingBalance,
          6,
        );
        expect(base.startingBalance).toBeCloseTo(
          analyses.base.forecasts[index - 1].expectedEndingBalance,
          6,
        );
        expect(optimistic.startingBalance).toBeCloseTo(
          analyses.optimistic.forecasts[index - 1]
            .expectedEndingBalance,
          6,
        );
      }
    }

    expect(analyses.conservative.cashRisk).toMatchObject({
      negativeMonthCount: 2,
      lowestBalanceMonth: "2026-04",
      recoveryMonth: "2026-06",
    });
    expect(analyses.base.cashRisk).toMatchObject({
      negativeMonthCount: 1,
      lowestBalanceMonth: "2026-04",
      recoveryMonth: "2026-05",
    });
    expect(analyses.optimistic.cashRisk).toMatchObject({
      negativeMonthCount: 1,
      lowestBalanceMonth: "2026-04",
      recoveryMonth: "2026-05",
    });
    expect(
      analyses.conservative.cashRisk?.requiredCashBuffer,
    ).toBeGreaterThan(analyses.base.cashRisk?.requiredCashBuffer ?? 0);
    expect(
      analyses.base.cashRisk?.requiredCashBuffer,
    ).toBeGreaterThan(analyses.optimistic.cashRisk?.requiredCashBuffer ?? 0);
  });

  it("확정 예정 거래를 세 시나리오에 같은 금액으로 반영한다", () => {
    const scheduledTransactions: ScheduledTransaction[] = [
      {
        id: "confirmed-income",
        date: "2026-05-15",
        description: "확정 입금",
        type: "income",
        amount: 500_000,
      },
      {
        id: "confirmed-expense",
        date: "2026-05-20",
        description: "확정 출금",
        type: "expense",
        amount: 100_000,
      },
    ];
    const analyses = createScenarioForecastAnalyses(
      [
        createIncomeRecurringTransaction([
          900_000,
          950_000,
          1_000_000,
        ]),
        createRecurringTransaction({
          averageAmount: 700_000,
          lastMonth: "2026-03",
        }),
      ],
      0,
      scheduledTransactions,
    );

    for (const scenario of [
      "conservative",
      "base",
      "optimistic",
    ] as const) {
      expect(analyses[scenario].forecasts[1]).toMatchObject({
        scheduledIncome: 500_000,
        scheduledExpense: 100_000,
        recurringExpense: 700_000,
      });
    }
  });
});

describe("확정 예정 거래가 포함된 현금흐름 예측", () => {
  it("월별 예정 입출금과 직전 월말 잔액을 다음 달 계산에 반영한다", () => {
    const recurringTransactions = [
      createRecurringTransaction({
        type: "income",
        averageAmount: 100,
      }),
      createRecurringTransaction({
        type: "expense",
        averageAmount: 40,
      }),
    ];
    const scheduledTransactions: ScheduledTransaction[] = [
      {
        id: "scheduled-income",
        date: "2024-02-15",
        description: "확정 입금",
        type: "income",
        amount: 500,
      },
      {
        id: "scheduled-expense",
        date: "2024-03-20",
        description: "확정 출금",
        type: "expense",
        amount: 200,
      },
    ];

    const forecasts = generateCashFlowForecast(
      recurringTransactions,
      1000,
      3,
      scheduledTransactions,
    );

    expect(forecasts).toEqual([
      expect.objectContaining({
        month: "2024-02",
        startingBalance: 1000,
        recurringIncome: 100,
        scheduledIncome: 500,
        expectedIncome: 600,
        recurringExpense: 40,
        scheduledExpense: 0,
        expectedExpense: 40,
        expectedNetCashFlow: 560,
        expectedEndingBalance: 1560,
      }),
      expect.objectContaining({
        month: "2024-03",
        startingBalance: 1560,
        scheduledIncome: 0,
        expectedIncome: 100,
        scheduledExpense: 200,
        expectedExpense: 240,
        expectedNetCashFlow: -140,
        expectedEndingBalance: 1420,
      }),
      expect.objectContaining({
        month: "2024-04",
        startingBalance: 1420,
        scheduledIncome: 0,
        scheduledExpense: 0,
        expectedNetCashFlow: 60,
        expectedEndingBalance: 1480,
      }),
    ]);
  });
});
