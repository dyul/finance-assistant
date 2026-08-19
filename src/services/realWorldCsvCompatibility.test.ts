import { describe, expect, it } from "vitest";

import { aggregateExpensesByCategory } from "./categoryAggregator";
import { mapColumns } from "./columnMapper";
import { loadCsvDataSource } from "./csvDataSource";
import { analyzeDataQuality } from "./dataQualityAnalyzer";
import { calculateFinancialSummary } from "./financialEngine";
import {
  createScenarioForecastAnalyses,
  generateCashFlowForecast,
  getLatestBalance,
} from "./forecastEngine";
import { calculateIncomeTrend } from "./incomeTrend";
import { aggregateMonthly } from "./monthlyAggregator";
import { detectRecurringTransactions } from "./recurringTransactionDetector";
import { partitionTransactionsByReferenceDate } from "./transactionDateScope";
import { parseTransactions } from "./transactionParser";
import { standardizeTransactionRows } from "./transactionRowStandardizer";
import { detectTransactionSheet } from "./transactionSheetDetector";

function withUtf8Bom(text: string): ArrayBuffer {
  const content = new TextEncoder().encode(text);
  const bytes = new Uint8Array(content.length + 3);

  bytes.set([0xef, 0xbb, 0xbf]);
  bytes.set(content, 3);
  return bytes.buffer;
}

describe("실사용 가계부 CSV 구조 호환성", () => {
  it("수입/지출·내역을 사용해 양수 금액의 방향과 설명을 안전하게 분리한다", () => {
    const source = loadCsvDataSource(
      withUtf8Bom(
        [
          "사용자,거래일,수입/지출,금액,분류,하위 분류,내역,지불,카드,메모",
          '합성 사용자,2026-01-01,수입,"500,000",합성 분류,합성 하위,합성 매출,,,덮어쓰면 안 됨',
          '합성 사용자,2026-01-02,지출,"300,000",합성 분류,합성 하위,합성 비용,,,덮어쓰면 안 됨',
        ].join("\n"),
      ),
    );
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
    const summary = calculateFinancialSummary(parsed.transactions);
    const monthly = aggregateMonthly(parsed.transactions);

    expect(detection).toMatchObject({
      sheetName: "CSV",
      headerRowIndex: 0,
      amountStructure: "amountDirection",
    });
    expect(
      mappings.find((mapping) => mapping.originalName === "수입/지출"),
    ).toMatchObject({ standardName: "direction", confidence: "high" });
    expect(
      mappings.find((mapping) => mapping.originalName === "내역"),
    ).toMatchObject({ standardName: "description", confidence: "high" });
    expect(
      mappings.find((mapping) => mapping.originalName === "메모"),
    ).toMatchObject({ standardName: "unknown" });
    expect(parsed.transactions.map((item) => item.description)).toEqual([
      "합성 매출",
      "합성 비용",
    ]);
    expect(summary).toMatchObject({
      totalIncome: 500_000,
      totalExpense: 300_000,
      netCashFlow: 200_000,
      transactionCount: 2,
    });
    expect(monthly).toMatchObject([
      {
        income: 500_000,
        expense: 300_000,
        netCashFlow: 200_000,
        transactionCount: 2,
      },
    ]);
    expect(getLatestBalance(parsed.transactions)).toBeNull();
    expect(
      createScenarioForecastAnalyses([], getLatestBalance(parsed.transactions))
        .base.forecasts,
    ).toEqual([]);
  });

  it("미래 거래를 원본 전체와 구분해 실적·월별·반복·추세·기준월·최근 잔액에서 제외한다", () => {
    const parsed = parseTransactions([
      { date: "2026-01-01", description: "합성 수입", amount: 500_000, direction: "수입", balance: 500_000 },
      { date: "2026-01-02", description: "합성 비용", amount: 300_000, direction: "지출", balance: 200_000 },
      { date: "2026-02-01", description: "합성 수입", amount: 500_000, direction: "수입", balance: 700_000 },
      { date: "2026-02-02", description: "합성 비용", amount: 300_000, direction: "지출", balance: 400_000 },
      { date: "2026-03-01", description: "합성 수입", amount: 500_000, direction: "수입", balance: 900_000 },
      { date: "2026-03-02", description: "합성 비용", amount: 300_000, direction: "지출", balance: 600_000 },
      { date: "2026-10-01", description: "합성 수입", amount: 700_000, direction: "수입", balance: 1_300_000 },
      { date: "2026-10-02", description: "합성 비용", amount: 40_000, direction: "지출", balance: 1_260_000 },
    ]);
    const scope = partitionTransactionsByReferenceDate(
      parsed.transactions,
      "2026-08-19",
    );
    const fullSummary = calculateFinancialSummary(parsed.transactions);
    const historicalSummary = calculateFinancialSummary(
      scope.historicalTransactions,
    );
    const monthly = aggregateMonthly(scope.historicalTransactions);
    const fullRecurring = detectRecurringTransactions(parsed.transactions);
    const historicalRecurring = detectRecurringTransactions(
      scope.historicalTransactions,
    );
    const forecasts = generateCashFlowForecast(
      historicalRecurring,
      600_000,
    );
    const unfilteredForecasts = generateCashFlowForecast(
      fullRecurring,
      600_000,
    );
    const quality = analyzeDataQuality(parsed.transactions, {
      referenceDate: "2026-08-19",
    });

    expect(fullSummary).toMatchObject({
      totalIncome: 2_200_000,
      totalExpense: 940_000,
      transactionCount: 8,
    });
    expect(historicalSummary).toMatchObject({
      totalIncome: 1_500_000,
      totalExpense: 900_000,
      netCashFlow: 600_000,
      transactionCount: 6,
    });
    expect(scope).toMatchObject({
      futureDatedIncome: 700_000,
      futureDatedExpense: 40_000,
    });
    expect(monthly.map((item) => item.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(
      monthly.reduce((sum, item) => sum + item.income, 0),
    ).toBe(historicalSummary.totalIncome);
    expect(
      monthly.reduce((sum, item) => sum + item.expense, 0),
    ).toBe(historicalSummary.totalExpense);
    expect(fullRecurring.map((item) => item.lastMonth)).toEqual([
      "2026-10",
    ]);
    expect(fullRecurring.map((item) => item.type)).toEqual(["income"]);
    expect(historicalRecurring.map((item) => item.lastMonth)).toEqual([
      "2026-03",
      "2026-03",
    ]);
    expect(forecasts[0]?.month).toBe("2026-04");
    expect(unfilteredForecasts[0]?.month).toBe("2026-11");
    expect(
      historicalRecurring.find((item) => item.type === "income")
        ?.monthlyAmounts,
    ).toHaveLength(3);
    expect(
      calculateIncomeTrend(
        fullRecurring.find((item) => item.type === "income")
          ?.monthlyAmounts ?? [],
      )?.latestMonth,
    ).toBe("2026-10");
    expect(
      calculateIncomeTrend(
        historicalRecurring.find((item) => item.type === "income")
          ?.monthlyAmounts ?? [],
      )?.latestMonth,
    ).toBe("2026-03");
    expect(getLatestBalance(parsed.transactions)).toBe(1_260_000);
    expect(getLatestBalance(scope.historicalTransactions)).toBe(600_000);
    expect(
      aggregateExpensesByCategory(scope.historicalTransactions).reduce(
        (sum, item) => sum + item.amount,
        0,
      ),
    ).toBe(900_000);
    expect(quality).toMatchObject({
      totalTransactionCount: 8,
      historicalTransactionCount: 6,
      amountIncludedCount: 6,
      dateAnalysisIncludedCount: 6,
      futureDatedTransactionCount: 2,
      futureDatedIncome: 700_000,
      futureDatedExpense: 40_000,
    });
  });
});
