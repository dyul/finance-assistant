import { describe, expect, it } from "vitest";

import type { RecurringTransaction } from "./recurringTransactionDetector";
import type { ScheduledTransaction } from "./scheduledTransaction";
import { generateCashFlowForecast } from "./forecastEngine";

function createRecurringTransaction(
  overrides: Partial<RecurringTransaction>,
): RecurringTransaction {
  return {
    description: "정기 거래",
    category: "other",
    categoryName: "기타",
    type: "expense",
    averageAmount: 0,
    occurrenceCount: 2,
    activeMonthCount: 2,
    firstMonth: "2023-12",
    lastMonth: "2024-01",
    confidence: "high",
    ...overrides,
  };
}

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
