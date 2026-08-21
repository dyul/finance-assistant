import { describe, expect, it } from "vitest";

import { calculateFinancialSummary } from "./financialEngine";
import {
  createFutureSourceTransactions,
  futureSourceSelectionReducer,
  partitionFutureSourceTransactionsByForecastMonths,
  toFileScheduledTransactions,
} from "./futureSourceTransaction";
import {
  createScenarioForecastAnalyses,
  getLatestBalance,
} from "./forecastEngine";
import { aggregateMonthly } from "./monthlyAggregator";
import {
  createRecurringTransactionKey,
  detectRecurringTransactions,
  type RecurringTransaction,
} from "./recurringTransactionDetector";
import type { ScheduledTransaction } from "./scheduledTransaction";
import { partitionTransactionsByReferenceDate } from "./transactionDateScope";
import type { Transaction } from "./transactionParser";

function transaction(
  overrides: Partial<Transaction> & Pick<Transaction, "date" | "description">,
): Transaction {
  const { date, description, ...rest } = overrides;

  return {
    date,
    description,
    income: 0,
    expense: 0,
    amountStatus: "valid",
    amountSource: "separate",
    originalAmountValues: {
      income: null,
      expense: null,
      amount: null,
      direction: null,
    },
    balance: null,
    category: "other",
    categoryName: "기타",
    confidence: "high",
    ...rest,
  };
}

function recurringExpense(): RecurringTransaction {
  return {
    description: "합성 고정비",
    category: "other",
    categoryName: "기타",
    type: "expense",
    averageAmount: 300_000,
    monthlyAmounts: [
      { month: "2026-07", amount: 300_000 },
      { month: "2026-08", amount: 300_000 },
    ],
    occurrenceCount: 2,
    activeMonthCount: 2,
    firstMonth: "2026-07",
    lastMonth: "2026-08",
    confidence: "high",
  };
}

describe("파일 미래 거래 Forecast 변환", () => {
  it("오늘 거래는 historical, 내일부터 미래이며 유효 금액·확정 방향만 자동 반영 후보로 만든다", () => {
    const transactions = [
      transaction({
        date: "2026-08-21",
        description: "오늘 거래",
        expense: 10_000,
      }),
      transaction({
        date: "2026-08-22",
        description: "유효 미래 지출",
        expense: 20_000,
      }),
      transaction({
        date: "2026-08-23",
        description: "금액 오류",
        income: null,
        expense: null,
        amountStatus: "invalidAmount",
      }),
      transaction({
        date: "2026-08-24",
        description: "방향 미확정",
        income: null,
        expense: null,
        amountStatus: "unknownDirection",
      }),
      transaction({
        date: "2026-08-25",
        description: "컬럼 금액 충돌",
        expense: 30_000,
        amountStatus: "columnConflict",
      }),
      transaction({
        date: "2026-08-26",
        description: "방향 충돌 보정",
        income: 40_000,
        amountStatus: "directionOverride",
      }),
    ];
    const scope = partitionTransactionsByReferenceDate(
      transactions,
      "2026-08-21",
    );
    const future = createFutureSourceTransactions(
      transactions,
      "2026-08-21",
    );

    expect(scope.historicalTransactions).toEqual([transactions[0]]);
    expect(scope.futureDatedTransactions).toHaveLength(5);
    expect(future).toEqual([
      expect.objectContaining({
        sourceIndex: 1,
        date: "2026-08-22",
        type: "expense",
        amount: 20_000,
      }),
    ]);
  });

  it("3개월 범위·개별 제외·재포함을 원본 mutation 없이 분리한다", () => {
    const source = [
      transaction({
        date: "2026-09-10",
        description: "9월 지출",
        expense: 120_000,
      }),
      transaction({
        date: "2026-10-10",
        description: "10월 지출",
        expense: 120_000,
      }),
      transaction({
        date: "2026-11-25",
        description: "11월 수입",
        income: 500_000,
      }),
      transaction({
        date: "2026-12-05",
        description: "12월 지출",
        expense: 90_000,
      }),
    ];
    const original = structuredClone(source);
    const future = createFutureSourceTransactions(source, "2026-08-21");
    const excludedId = future[1]?.id ?? "";
    const excludedScope = partitionFutureSourceTransactionsByForecastMonths(
      future,
      ["2026-09", "2026-10", "2026-11"],
      new Set([excludedId]),
    );
    const restoredScope = partitionFutureSourceTransactionsByForecastMonths(
      future,
      ["2026-09", "2026-10", "2026-11"],
      new Set(),
    );

    expect(excludedScope.included.map((item) => item.date)).toEqual([
      "2026-09-10",
      "2026-11-25",
    ]);
    expect(excludedScope.excluded.map((item) => item.date)).toEqual([
      "2026-10-10",
    ]);
    expect(excludedScope.outOfHorizon.map((item) => item.date)).toEqual([
      "2026-12-05",
    ]);
    expect(excludedScope).toMatchObject({
      includedIncome: 500_000,
      includedExpense: 120_000,
    });
    expect(restoredScope.included).toHaveLength(3);
    expect(source).toEqual(original);
  });

  it("파일 출처와 recurring stable key를 Forecast 예정 거래에 유지한다", () => {
    const future = createFutureSourceTransactions(
      [
        transaction({
          date: "2026-09-10",
          description: " 합성  고정비 ",
          expense: 120_000,
        }),
      ],
      "2026-08-21",
    );
    const scheduled = toFileScheduledTransactions(future);

    expect(scheduled).toEqual([
      expect.objectContaining({
        source: "file",
        recurringKey: createRecurringTransactionKey(recurringExpense()),
      }),
    ]);
  });

  it("파일 전환·같은 이름 재업로드는 제외 상태를 초기화하고 같은 세션 재분석은 유효 ID만 유지한다", () => {
    const excluded = futureSourceSelectionReducer([], {
      type: "setIncluded",
      id: "future-1",
      included: false,
    });
    const sameSession = futureSourceSelectionReducer(excluded, {
      type: "sameFileReanalyzed",
      availableIds: ["future-1", "future-2"],
    });
    const changedMapping = futureSourceSelectionReducer(sameSession, {
      type: "sameFileReanalyzed",
      availableIds: ["future-2"],
    });

    expect(excluded).toEqual(["future-1"]);
    expect(sameSession).toEqual(["future-1"]);
    expect(changedMapping).toEqual([]);
    expect(
      futureSourceSelectionReducer(excluded, { type: "newFile" }),
    ).toEqual([]);
    expect(
      futureSourceSelectionReducer(excluded, {
        type: "fileSettingsReset",
      }),
    ).toEqual([]);
  });
});

describe("미래 거래 자동 Forecast 통합", () => {
  function createSyntheticFlow() {
    const historical = [
      ["2026-05-01", "합성 매출", "income", 1_000_000, 1_000_000],
      ["2026-05-10", "합성 고정비", "expense", 300_000, 700_000],
      ["2026-06-01", "합성 매출", "income", 1_000_000, 1_700_000],
      ["2026-06-10", "합성 고정비", "expense", 300_000, 1_400_000],
      ["2026-07-01", "합성 매출", "income", 1_000_000, 2_400_000],
      ["2026-07-10", "합성 고정비", "expense", 300_000, 2_100_000],
      ["2026-08-01", "합성 매출", "income", 1_000_000, 3_100_000],
      ["2026-08-10", "합성 고정비", "expense", 300_000, 2_800_000],
    ].map(([date, description, type, amount, balance]) =>
      transaction({
        date: date as Transaction["date"],
        description: String(description),
        income: type === "income" ? Number(amount) : 0,
        expense: type === "expense" ? Number(amount) : 0,
        balance: Number(balance),
      }),
    );
    const future = [
      ["2026-09-10", "합성 고정비", "expense", 120_000],
      ["2026-10-10", "합성 고정비", "expense", 120_000],
      ["2026-11-10", "합성 고정비", "expense", 120_000],
      ["2026-09-25", "합성 확정 수입", "income", 500_000],
      ["2026-12-10", "합성 기간 밖 지출", "expense", 90_000],
    ].map(([date, description, type, amount]) =>
      transaction({
        date: date as Transaction["date"],
        description: String(description),
        income: type === "income" ? Number(amount) : 0,
        expense: type === "expense" ? Number(amount) : 0,
        balance: 99_000_000,
      }),
    );
    const all = [...historical, ...future];
    const scope = partitionTransactionsByReferenceDate(all, "2026-08-21");
    const recurring = detectRecurringTransactions(
      scope.historicalTransactions,
    );
    const sourceFuture = createFutureSourceTransactions(all, "2026-08-21");
    const forecastMonths = ["2026-09", "2026-10", "2026-11"];
    const futureScope = partitionFutureSourceTransactionsByForecastMonths(
      sourceFuture,
      forecastMonths,
      new Set(),
    );
    const scheduled = toFileScheduledTransactions(futureScope.included);

    return { all, scope, recurring, sourceFuture, futureScope, scheduled };
  }

  it("historical·월별·최근 잔액은 불변이고 3개월 미래 수입·지출을 월별로 교차검산한다", () => {
    const result = createSyntheticFlow();
    const summary = calculateFinancialSummary(
      result.scope.historicalTransactions,
    );
    const monthly = aggregateMonthly(result.scope.historicalTransactions);
    const analyses = createScenarioForecastAnalyses(
      result.recurring,
      getLatestBalance(result.scope.historicalTransactions),
      result.scheduled,
    );

    expect(summary).toMatchObject({
      totalIncome: 4_000_000,
      totalExpense: 1_200_000,
      netCashFlow: 2_800_000,
      transactionCount: 8,
    });
    expect(monthly.reduce((sum, item) => sum + item.income, 0)).toBe(
      summary.totalIncome,
    );
    expect(monthly.reduce((sum, item) => sum + item.expense, 0)).toBe(
      summary.totalExpense,
    );
    expect(getLatestBalance(result.scope.historicalTransactions)).toBe(
      2_800_000,
    );
    expect(result.futureScope).toMatchObject({
      includedIncome: 500_000,
      includedExpense: 360_000,
    });
    expect(result.futureScope.outOfHorizon).toHaveLength(1);
    expect(analyses.base.forecasts).toEqual([
      expect.objectContaining({
        month: "2026-09",
        startingBalance: 2_800_000,
        recurringIncome: 1_000_000,
        scheduledIncome: 500_000,
        recurringExpense: 0,
        scheduledExpense: 120_000,
        expectedNetCashFlow: 1_380_000,
        expectedEndingBalance: 4_180_000,
      }),
      expect.objectContaining({
        month: "2026-10",
        startingBalance: 4_180_000,
        scheduledExpense: 120_000,
        expectedNetCashFlow: 880_000,
        expectedEndingBalance: 5_060_000,
      }),
      expect.objectContaining({
        month: "2026-11",
        startingBalance: 5_060_000,
        scheduledExpense: 120_000,
        expectedNetCashFlow: 880_000,
        expectedEndingBalance: 5_940_000,
      }),
    ]);
  });

  it("같은 recurring key의 파일 확정값은 추정값을 대체하고 수동 거래는 자동 dedup하지 않는다", () => {
    const recurring = [recurringExpense()];
    const recurringKey = createRecurringTransactionKey(recurring[0]);
    const fileTransactions: ScheduledTransaction[] = [
      {
        id: "file-1",
        date: "2026-09-10",
        description: "합성 고정비",
        type: "expense",
        amount: 120_000,
        source: "file",
        recurringKey,
      },
      {
        id: "file-2",
        date: "2026-09-20",
        description: "합성 고정비",
        type: "expense",
        amount: 130_000,
        source: "file",
        recurringKey,
      },
    ];
    const manualTransaction: ScheduledTransaction = {
      id: "manual-1",
      date: "2026-09-10",
      description: "합성 고정비",
      type: "expense",
      amount: 120_000,
    };
    const withFile = createScenarioForecastAnalyses(
      recurring,
      1_000_000,
      fileTransactions,
    );
    const withManual = createScenarioForecastAnalyses(
      recurring,
      1_000_000,
      [manualTransaction],
    );

    expect(withFile.base.forecasts[0]).toMatchObject({
      recurringExpense: 0,
      scheduledExpense: 250_000,
      expectedExpense: 250_000,
    });
    expect(withManual.base.forecasts[0]).toMatchObject({
      recurringExpense: 300_000,
      scheduledExpense: 120_000,
      expectedExpense: 420_000,
    });
  });

  it("파일 미래 거래 금액은 세 시나리오에서 같고 직접 잔액은 시작점으로만 사용한다", () => {
    const result = createSyntheticFlow();
    const analyses = createScenarioForecastAnalyses(
      result.recurring,
      3_000_000,
      result.scheduled,
    );

    expect(
      Object.values(analyses).map(
        (analysis) => analysis.forecasts[0]?.startingBalance,
      ),
    ).toEqual([3_000_000, 3_000_000, 3_000_000]);
    expect(
      Object.values(analyses).map(
        (analysis) => analysis.forecasts[0]?.scheduledIncome,
      ),
    ).toEqual([500_000, 500_000, 500_000]);
    expect(
      Object.values(analyses).map(
        (analysis) => analysis.forecasts[0]?.scheduledExpense,
      ),
    ).toEqual([120_000, 120_000, 120_000]);
  });

  it("미래 거래 1,000건을 선형 변환하고 UI용 범위는 3개월만 집계한다", () => {
    const transactions = Array.from({ length: 1_000 }, (_, index) =>
      transaction({
        date: `2026-${String(9 + (index % 4)).padStart(2, "0")}-10` as Transaction["date"],
        description: `합성 미래 거래 ${index}`,
        expense: 1_000,
      }),
    );
    const future = createFutureSourceTransactions(
      transactions,
      "2026-08-21",
    );
    const scope = partitionFutureSourceTransactionsByForecastMonths(
      future,
      ["2026-09", "2026-10", "2026-11"],
      new Set(),
    );

    expect(future).toHaveLength(1_000);
    expect(scope.included).toHaveLength(750);
    expect(scope.outOfHorizon).toHaveLength(250);
    expect(scope.includedExpense).toBe(750_000);
  });

  it("익명 acceptance aggregate 3건·총지출 106,670원을 세부값 없이 교차검산한다", () => {
    const acceptanceExpenseTotal = 106_670;
    const baseShare = Math.trunc(acceptanceExpenseTotal / 3);
    const transactions = Array.from({ length: 3 }, (_, index) =>
      transaction({
        date: `2026-${String(9 + index).padStart(2, "0")}-15` as Transaction["date"],
        description: `익명 합성 미래 지출 ${index + 1}`,
        expense:
          index < 2
            ? baseShare
            : acceptanceExpenseTotal - baseShare * 2,
      }),
    );
    const future = createFutureSourceTransactions(
      transactions,
      "2026-08-21",
    );
    const scope = partitionFutureSourceTransactionsByForecastMonths(
      future,
      ["2026-09", "2026-10", "2026-11"],
      new Set(),
    );

    expect(future).toHaveLength(3);
    expect(scope.included).toHaveLength(3);
    expect(scope.includedExpense).toBe(acceptanceExpenseTotal);
  });
});
