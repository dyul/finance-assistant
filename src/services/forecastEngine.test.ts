import { describe, expect, it } from "vitest";

import type { RecurringTransaction } from "./recurringTransactionDetector";
import type { ScheduledTransaction } from "./scheduledTransaction";
import { calculateIncomeTrend } from "./incomeTrend";
import {
  createForecastAnalysis,
  generateCashFlowForecast,
} from "./forecastEngine";

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
