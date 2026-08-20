import { describe, expect, it } from "vitest";

import { createActionGuide } from "./actionGuide";
import { aggregateExpensesByCategory } from "./categoryAggregator";
import { mapColumns } from "./columnMapper";
import { loadCsvDataSource } from "./csvDataSource";
import { analyzeDataQuality } from "./dataQualityAnalyzer";
import { calculateFinancialSummary } from "./financialEngine";
import {
  createScenarioForecastAnalyses,
  getLatestBalance,
} from "./forecastEngine";
import { resolveForecastStartingBalance } from "./manualBalance";
import { aggregateMonthly } from "./monthlyAggregator";
import { aggregateMonthlyExpensesByCategory } from "./monthlyCategoryAggregator";
import { detectRecurringTransactions } from "./recurringTransactionDetector";
import { partitionTransactionsByReferenceDate } from "./transactionDateScope";
import { parseTransactions } from "./transactionParser";
import { standardizeTransactionRows } from "./transactionRowStandardizer";
import { detectTransactionSheet } from "./transactionSheetDetector";

function toUtf8Buffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

function createSyntheticAnalysis(includeFutureTransaction = false) {
  const lines = [
    "거래일,수입/지출,금액,내역",
    '2026-05-01,수입,"1,000,000",합성 매출',
    '2026-05-10,지출,"300,000",합성 고정비',
    '2026-06-01,수입,"1,000,000",합성 매출',
    '2026-06-10,지출,"300,000",합성 고정비',
    '2026-07-01,수입,"1,000,000",합성 매출',
    '2026-07-10,지출,"300,000",합성 고정비',
  ];

  if (includeFutureTransaction) {
    lines.push('2026-12-01,수입,"9,000,000",합성 미래 거래');
  }

  const source = loadCsvDataSource(toUtf8Buffer(lines.join("\n")));
  const detection = detectTransactionSheet(source.getSheetCandidates());
  const rows = source.getRows(
    detection?.sheetName ?? "",
    detection?.headerRowIndex ?? 0,
  );
  const mappings = mapColumns(
    source.getPreview(
      detection?.sheetName ?? "",
      detection?.headerRowIndex ?? 0,
    ).columns,
    rows,
  );
  const parsed = parseTransactions(
    standardizeTransactionRows(rows, mappings),
  );
  const scope = partitionTransactionsByReferenceDate(
    parsed.transactions,
    "2026-08-20",
  );
  const historical = scope.historicalTransactions;

  return {
    parsed,
    scope,
    historical,
    summary: calculateFinancialSummary(historical),
    monthly: aggregateMonthly(historical),
    categories: aggregateExpensesByCategory(historical),
    monthlyCategories: aggregateMonthlyExpensesByCategory(historical),
    recurring: detectRecurringTransactions(historical),
    quality: analyzeDataQuality(parsed.transactions, {
      referenceDate: "2026-08-20",
    }),
  };
}

describe("잔액 없는 합성 CSV의 Forecast 연결", () => {
  it("직접 잔액 전후 과거 분석은 같고 Forecast만 활성화한다", () => {
    const result = createSyntheticAnalysis();
    const beforeSummary = structuredClone(result.summary);
    const beforeMonthly = structuredClone(result.monthly);
    const beforeCategories = structuredClone(result.categories);
    const beforeRecurring = structuredClone(result.recurring);
    const beforeQuality = structuredClone(result.quality);
    const withoutBalance = createScenarioForecastAnalyses(
      result.recurring,
      getLatestBalance(result.historical),
    );
    const resolved = resolveForecastStartingBalance(null, 3_000_000);
    const withManualBalance = createScenarioForecastAnalyses(
      result.recurring,
      resolved.value,
    );

    expect(getLatestBalance(result.historical)).toBeNull();
    expect(withoutBalance.base.forecasts).toEqual([]);
    expect(result.summary).toMatchObject({
      totalIncome: 3_000_000,
      totalExpense: 900_000,
      netCashFlow: 2_100_000,
      transactionCount: 6,
    });
    expect(result.summary).toEqual(beforeSummary);
    expect(result.monthly).toEqual(beforeMonthly);
    expect(result.categories).toEqual(beforeCategories);
    expect(result.recurring).toEqual(beforeRecurring);
    expect(result.quality).toEqual(beforeQuality);
    expect(withManualBalance.base.forecasts).toHaveLength(3);
    expect(withManualBalance.base.forecasts[0]).toMatchObject({
      month: "2026-08",
      startingBalance: 3_000_000,
      expectedEndingBalance: 3_700_000,
    });
    expect(withManualBalance.base.cashRisk).not.toBeNull();
  });

  it("0원·음수와 세 예상 범위에 같은 시작 잔액을 전달한다", () => {
    const result = createSyntheticAnalysis();
    const zeroAnalyses = createScenarioForecastAnalyses(
      result.recurring,
      0,
    );
    const negativeAnalyses = createScenarioForecastAnalyses(
      result.recurring.filter((item) => item.type === "expense"),
      -500_000,
    );

    expect(
      Object.values(zeroAnalyses).map(
        (analysis) => analysis.forecasts[0]?.startingBalance,
      ),
    ).toEqual([0, 0, 0]);
    expect(negativeAnalyses.base.forecasts[0]?.startingBalance).toBe(
      -500_000,
    );
    expect(negativeAnalyses.base.cashRisk?.requiredCashBuffer).toBeGreaterThan(
      0,
    );
  });

  it("예정 거래와 기존 cash risk·Action Guide 경로를 그대로 사용한다", () => {
    const result = createSyntheticAnalysis();
    const original = createScenarioForecastAnalyses(
      result.recurring,
      3_000_000,
    );
    const scheduledIncome = {
      id: "synthetic-income",
      date: "2026-08-15",
      description: "합성 확정 입금",
      type: "income" as const,
      amount: 500_000,
    };
    const withScheduled = createScenarioForecastAnalyses(
      result.recurring,
      3_000_000,
      [scheduledIncome],
    );
    const actions = createActionGuide({
      forecasts: withScheduled.base.forecasts,
      cashRisk: withScheduled.base.cashRisk,
      categorySummaries: result.categories,
      monthlyCategorySummaries: result.monthlyCategories,
      scheduledTransactions: [scheduledIncome],
    });

    expect(withScheduled.base.forecasts[0]?.startingBalance).toBe(3_000_000);
    expect(withScheduled.base.forecasts.at(-1)?.expectedEndingBalance).toBe(
      (original.base.forecasts.at(-1)?.expectedEndingBalance ?? 0) + 500_000,
    );
    expect(actions.some((item) => item.type === "scheduled_income")).toBe(true);
  });

  it("반복 거래가 없으면 직접 잔액만으로 Forecast를 만들지 않는다", () => {
    const analyses = createScenarioForecastAnalyses([], 3_000_000);

    expect(analyses.base).toEqual({ forecasts: [], cashRisk: null });
  });

  it("미래 거래는 직접 잔액과 무관하게 historical·recurring에서 제외한다", () => {
    const result = createSyntheticAnalysis(true);
    const analyses = createScenarioForecastAnalyses(
      result.recurring,
      3_000_000,
    );

    expect(result.parsed.transactions).toHaveLength(7);
    expect(result.scope.futureDatedTransactions).toHaveLength(1);
    expect(result.historical).toHaveLength(6);
    expect(result.summary.totalIncome).toBe(3_000_000);
    expect(result.recurring).toHaveLength(2);
    expect(analyses.base.forecasts[0]?.month).toBe("2026-08");
  });
});
