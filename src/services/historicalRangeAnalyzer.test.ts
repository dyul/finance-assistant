import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";

import { createActionGuide } from "./actionGuide";
import { aggregateExpensesByCategory } from "./categoryAggregator";
import { createCashBalanceTrendModel } from "./cashBalanceTrend";
import { createScenarioForecastAnalyses } from "./forecastEngine";
import {
  analyzeHistoricalRange,
  createInitialHistoricalRangeState,
  historicalRangeReducer,
  validateHistoricalDateRange,
  type HistoricalDateRange,
} from "./historicalRangeAnalyzer";
import { aggregateHistoricalPeriods } from "./historicalPeriodAggregator";
import { resolveForecastStartingBalance } from "./manualBalance";
import { aggregateMonthlyExpensesByCategory } from "./monthlyCategoryAggregator";
import { detectRecurringTransactions } from "./recurringTransactionDetector";
import { partitionTransactionsByReferenceDate } from "./transactionDateScope";
import { parseTransactions, type Transaction } from "./transactionParser";

const customRange: HistoricalDateRange = {
  startDate: "2026-09-15",
  endDate: "2026-10-14",
};

function createAcceptanceTransactions(reverse = false): Transaction[] {
  const rows = [
    { date: "2026-09-14", income: 100_000, balance: 1_100_000 },
    { date: "2026-09-15 09:00", income: 300_000, balance: 1_400_000 },
    { date: "2026-09-30 17:00", expense: 120_000, balance: 1_280_000 },
    { date: "2026-10-01 08:00", income: 200_000, balance: 1_480_000 },
    { date: "2026-10-14 10:00", expense: 80_000, balance: 1_400_000 },
    { date: "2026-10-14 18:00", expense: 20_000, balance: 1_380_000 },
    { date: "2026-10-15", expense: 500_000, balance: 880_000 },
  ];

  return parseTransactions(reverse ? rows.toReversed() : rows).transactions;
}

function sumPeriods(
  periods: ReturnType<typeof aggregateHistoricalPeriods>["monthly"],
) {
  return periods.reduce(
    (total, period) => ({
      income: total.income + period.income,
      expense: total.expense + period.expense,
      netCashFlow: total.netCashFlow + period.netCashFlow,
      transactionCount: total.transactionCount + period.transactionCount,
    }),
    { income: 0, expense: 0, netCashFlow: 0, transactionCount: 0 },
  );
}

describe("historical range validation과 state", () => {
  it("시작일·종료일 누락, 잘못된 순서와 미래 종료일을 적용하지 않는다", () => {
    expect(validateHistoricalDateRange("", "2026-09-05")).toEqual({
      valid: false,
      message: "시작일과 종료일을 모두 선택해주세요.",
    });
    expect(validateHistoricalDateRange("2026-09-01", "")).toEqual({
      valid: false,
      message: "시작일과 종료일을 모두 선택해주세요.",
    });
    expect(validateHistoricalDateRange("2026-09-05", "2026-09-01")).toEqual({
      valid: false,
      message: "시작일은 종료일보다 늦을 수 없습니다.",
    });
    expect(
      validateHistoricalDateRange(
        "2026-09-01",
        "2026-09-06",
        "2026-09-05",
      ),
    ).toEqual({
      valid: false,
      message: "종료일은 오늘보다 늦을 수 없습니다.",
    });
  });

  it("윤일과 단일 날짜를 허용하고 존재하지 않는 날짜를 거부한다", () => {
    expect(validateHistoricalDateRange("2024-02-29", "2024-02-29")).toEqual({
      valid: true,
      range: { startDate: "2024-02-29", endDate: "2024-02-29" },
    });
    expect(validateHistoricalDateRange("2026-02-29", "2026-03-01")).toEqual({
      valid: false,
      message: "유효한 시작일과 종료일을 입력해주세요.",
    });
  });

  it("draft는 적용 전 결과를 바꾸지 않고 reset은 전체 기간으로 돌아간다", () => {
    let state = createInitialHistoricalRangeState();
    state = historicalRangeReducer(state, {
      type: "selectMode",
      mode: "custom",
    });
    state = historicalRangeReducer(state, {
      type: "setDraftStartDate",
      value: "2026-08-01",
    });
    state = historicalRangeReducer(state, {
      type: "setDraftEndDate",
      value: "2026-08-31",
    });

    expect(state.appliedRange).toBeNull();

    state = historicalRangeReducer(state, {
      type: "apply",
      maximumDate: "2026-09-05",
    });
    expect(state.appliedRange).toEqual({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
    expect(historicalRangeReducer(state, { type: "reset" })).toEqual(
      createInitialHistoricalRangeState(),
    );
  });
});

describe("custom historical range analysis", () => {
  it("9/15~10/14 양 끝을 포함하고 바깥 거래를 제외해 전체 요약을 만든다", () => {
    const result = analyzeHistoricalRange(
      createAcceptanceTransactions(),
      customRange,
    );

    expect(result.transactions.map((transaction) => transaction.date)).toEqual([
      "2026-09-15",
      "2026-09-30",
      "2026-10-01",
      "2026-10-14",
      "2026-10-14",
    ]);
    expect(result.summary).toEqual({
      income: 500_000,
      expense: 220_000,
      netCashFlow: 280_000,
      transactionCount: 5,
      closingBalance: 1_380_000,
    });
  });

  it("reverse source에서도 explicit time으로 같은 기간말 잔액을 선택한다", () => {
    expect(
      analyzeHistoricalRange(
        createAcceptanceTransactions(true),
        customRange,
      ).summary.closingBalance,
    ).toBe(1_380_000);
  });

  it("월·분기·연도 breakdown이 선택 기간 전체와 reconciliation된다", () => {
    const result = analyzeHistoricalRange(
      createAcceptanceTransactions(),
      customRange,
    );
    const expected = {
      income: result.summary.income,
      expense: result.summary.expense,
      netCashFlow: result.summary.netCashFlow,
      transactionCount: result.summary.transactionCount,
    };

    expect(result.aggregation.monthly.map((period) => period.periodKey)).toEqual([
      "2026-09",
      "2026-10",
    ]);
    expect(result.aggregation.monthly[0]).toMatchObject({
      income: 300_000,
      expense: 120_000,
    });
    expect(result.aggregation.monthly[1]).toMatchObject({
      income: 200_000,
      expense: 100_000,
    });
    expect(sumPeriods(result.aggregation.monthly)).toEqual(expected);
    expect(sumPeriods(result.aggregation.quarterly)).toEqual(expected);
    expect(sumPeriods(result.aggregation.yearly)).toEqual(expected);
  });

  it("single-day range에서 같은 날 거래만 사용하고 시각순 잔액을 선택한다", () => {
    const result = analyzeHistoricalRange(createAcceptanceTransactions(), {
      startDate: "2026-10-14",
      endDate: "2026-10-14",
    });

    expect(result.summary).toEqual({
      income: 0,
      expense: 100_000,
      netCashFlow: -100_000,
      transactionCount: 2,
      closingBalance: 1_380_000,
    });
  });

  it("분기와 연도 경계를 가로질러도 입력 범위 안에서만 집계한다", () => {
    const transactions = parseTransactions([
      { date: "2026-03-19", income: 1 },
      { date: "2026-03-20", income: 100 },
      { date: "2026-04-10", expense: 40 },
      { date: "2026-04-11", expense: 1 },
      { date: "2026-12-19", income: 1 },
      { date: "2026-12-20", income: 200 },
      { date: "2027-01-10", expense: 80 },
      { date: "2027-01-11", expense: 1 },
    ]).transactions;
    const crossQuarter = analyzeHistoricalRange(transactions, {
      startDate: "2026-03-20",
      endDate: "2026-04-10",
    });
    const crossYear = analyzeHistoricalRange(transactions, {
      startDate: "2026-12-20",
      endDate: "2027-01-10",
    });

    expect(crossQuarter.aggregation.quarterly.map((item) => item.periodKey)).toEqual([
      "2026-Q1",
      "2026-Q2",
    ]);
    expect(sumPeriods(crossQuarter.aggregation.quarterly)).toMatchObject({
      income: 100,
      expense: 40,
    });
    expect(crossYear.aggregation.yearly.map((item) => item.periodKey)).toEqual([
      "2026",
      "2027",
    ]);
    expect(sumPeriods(crossYear.aggregation.yearly)).toMatchObject({
      income: 200,
      expense: 80,
    });
  });

  it("거래 없는 유효 범위는 오류 없이 empty와 null 잔액을 반환한다", () => {
    const result = analyzeHistoricalRange(createAcceptanceTransactions(), {
      startDate: "2025-01-01",
      endDate: "2025-01-31",
    });

    expect(result.isEmpty).toBe(true);
    expect(result.summary).toEqual({
      income: 0,
      expense: 0,
      netCashFlow: 0,
      transactionCount: 0,
      closingBalance: null,
    });
  });

  it("잔액 없음·0원·음수 기간말 잔액을 서로 구분한다", () => {
    const range = { startDate: "2026-01-01", endDate: "2026-01-31" } as const;
    const withoutBalance = analyzeHistoricalRange(
      parseTransactions([{ date: "2026-01-10", income: 100 }]).transactions,
      range,
    );
    const zeroBalance = analyzeHistoricalRange(
      parseTransactions([{ date: "2026-01-10", income: 100, balance: 0 }]).transactions,
      range,
    );
    const negativeBalance = analyzeHistoricalRange(
      parseTransactions([{ date: "2026-01-10", expense: 100, balance: -50 }]).transactions,
      range,
    );

    expect(withoutBalance.summary.closingBalance).toBeNull();
    expect(zeroBalance.summary.closingBalance).toBe(0);
    expect(negativeBalance.summary.closingBalance).toBe(-50);
    expect(resolveForecastStartingBalance(null, 9_000).value).toBe(9_000);
    expect(withoutBalance.summary.closingBalance).not.toBe(9_000);
  });

  it("invalid date와 historical scope 밖 미래 거래를 선택 범위에 넣지 않는다", () => {
    const parsed = parseTransactions([
      { date: "날짜미정", income: 500 },
      { date: "2026-09-05", income: 100 },
      { date: "2026-09-20", income: 900 },
    ]);
    const historical = partitionTransactionsByReferenceDate(
      parsed.transactions,
      "2026-09-05",
    ).historicalTransactions;
    const result = analyzeHistoricalRange(historical, {
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });

    expect(result.summary.income).toBe(100);
    expect(result.transactions).toHaveLength(1);
  });

  it("선택 기간 category와 주요 지출 비중을 선택 지출 합계로 계산한다", () => {
    const result = analyzeHistoricalRange(
      parseTransactions([
        { date: "2026-01-05", description: "월세", expense: 300 },
        { date: "2026-01-10", description: "전기요금", expense: 100 },
        { date: "2026-02-01", description: "월세", expense: 900 },
      ]).transactions,
      { startDate: "2026-01-01", endDate: "2026-01-31" },
    );

    expect(result.topExpense).toMatchObject({
      categoryName: "임차료",
      amount: 300,
      shareOfExpense: 75,
    });
    expect(result.categorySummaries.reduce((sum, item) => sum + item.amount, 0)).toBe(400);
  });

  it("range 분석 전후 Forecast·recurring·risk·Action Guide·graph 입력을 변경하지 않는다", () => {
    const transactions = parseTransactions([
      { date: "2026-01-05", description: "상품판매", income: 900, balance: 900 },
      { date: "2026-02-05", description: "상품판매", income: 950, balance: 1_850 },
      { date: "2026-03-05", description: "상품판매", income: 1_000, balance: 2_850 },
      { date: "2026-01-10", description: "월세", expense: 500, balance: 400 },
      { date: "2026-02-10", description: "월세", expense: 500, balance: 1_350 },
      { date: "2026-03-10", description: "월세", expense: 500, balance: 2_350 },
    ]).transactions;
    const recurringBefore = detectRecurringTransactions(transactions);
    const forecastBefore = createScenarioForecastAnalyses(
      recurringBefore,
      2_350,
    );
    const categories = aggregateExpensesByCategory(transactions);
    const monthlyCategories = aggregateMonthlyExpensesByCategory(transactions);
    const actionsBefore = createActionGuide({
      forecasts: forecastBefore.base.forecasts,
      cashRisk: forecastBefore.base.cashRisk,
      categorySummaries: categories,
      monthlyCategorySummaries: monthlyCategories,
      scheduledTransactions: [],
    });
    const fullPeriods = aggregateHistoricalPeriods(transactions);
    const graphBefore = createCashBalanceTrendModel({
      monthlySummaries: fullPeriods.monthly,
      startingBalance: { value: 2_350, source: "file" },
      forecasts: forecastBefore.base.forecasts,
      scenario: "base",
      referenceDate: "2026-03-10",
    });

    analyzeHistoricalRange(transactions, {
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });

    expect(detectRecurringTransactions(transactions)).toEqual(recurringBefore);
    expect(createScenarioForecastAnalyses(recurringBefore, 2_350)).toEqual(
      forecastBefore,
    );
    expect(
      createActionGuide({
        forecasts: forecastBefore.base.forecasts,
        cashRisk: forecastBefore.base.cashRisk,
        categorySummaries: categories,
        monthlyCategorySummaries: monthlyCategories,
        scheduledTransactions: [],
      }),
    ).toEqual(actionsBefore);
    expect(
      createCashBalanceTrendModel({
        monthlySummaries: fullPeriods.monthly,
        startingBalance: { value: 2_350, source: "file" },
        forecasts: forecastBefore.base.forecasts,
        scenario: "base",
        referenceDate: "2026-03-10",
      }),
    ).toEqual(graphBefore);
  });

  it("10k 거래를 원본 순서·객체 identity 변경 없이 빠르게 분석한다", () => {
    const transactions = parseTransactions(
      Array.from({ length: 10_000 }, (_, index) => ({
        date: `2026-${String((index % 8) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
        income: index % 2 === 0 ? 1_000 : 0,
        expense: index % 2 === 0 ? 0 : 500,
        balance: index,
      })),
    ).transactions;
    const firstTransaction = transactions[0];
    const sourceIndexes = transactions.map((transaction) => transaction.sourceRowIndex);
    const startedAt = performance.now();
    const result = analyzeHistoricalRange(transactions, {
      startDate: "2026-03-01",
      endDate: "2026-06-30",
    });
    const elapsedMs = performance.now() - startedAt;

    console.info(
      `[Day46 range] 10000 rows: ${elapsedMs.toFixed(1)}ms, selected=${result.transactions.length}`,
    );
    expect(result.transactions[0]).toBe(
      transactions.find((transaction) => transaction.date! >= "2026-03-01"),
    );
    expect(transactions[0]).toBe(firstTransaction);
    expect(transactions.map((transaction) => transaction.sourceRowIndex)).toEqual(sourceIndexes);
    expect(elapsedMs).toBeLessThan(1_000);
  });
});
