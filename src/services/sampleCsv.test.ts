/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { mapColumns } from "./columnMapper";
import { loadCsvDataSource } from "./csvDataSource";
import { calculateFinancialSummary } from "./financialEngine";
import {
  createScenarioForecastAnalyses,
  getLatestBalance,
} from "./forecastEngine";
import { aggregateMonthly } from "./monthlyAggregator";
import { detectRecurringTransactions } from "./recurringTransactionDetector";
import { detectTransactionSheet } from "./transactionSheetDetector";
import { parseTransactions } from "./transactionParser";
import { standardizeTransactionRows } from "./transactionRowStandardizer";

describe("사용자용 샘플 CSV", () => {
  it("샘플 Excel과 같은 업로드 파이프라인 결과를 만든다", () => {
    const sampleBytes = readFileSync(
      resolve("public", "samples", "finance-assistant-sample.csv"),
    );
    const source = loadCsvDataSource(Uint8Array.from(sampleBytes).buffer);
    const detection = detectTransactionSheet(source.getSheetCandidates(), {
      date1904: source.date1904,
    });

    expect(source.sourceType).toBe("csv");
    expect(source.textEncoding).toBe("utf-8");
    expect(detection?.sheetName).toBe("CSV");

    const preview = source.getPreview(
      detection?.sheetName ?? "",
      detection?.headerRowIndex ?? 0,
    );
    const rows = source.getRows(
      detection?.sheetName ?? "",
      detection?.headerRowIndex ?? 0,
    );
    const mappings = mapColumns(preview.columns, rows);
    const parsed = parseTransactions(
      standardizeTransactionRows(rows, mappings),
      { date1904: source.date1904 },
    );
    const summary = calculateFinancialSummary(parsed.transactions);
    const monthly = aggregateMonthly(parsed.transactions);
    const recurring = detectRecurringTransactions(parsed.transactions);
    const analyses = createScenarioForecastAnalyses(
      recurring,
      getLatestBalance(parsed.transactions),
    );

    expect(parsed.invalidDateCount).toBe(0);
    expect(summary).toMatchObject({
      totalIncome: 2_850_000,
      totalExpense: 4_347_000,
      netCashFlow: -1_497_000,
      transactionCount: 10,
    });
    expect(recurring.map((item) => item.description)).toEqual(
      expect.arrayContaining(["상품판매", "월세", "전기요금"]),
    );
    expect(recurring).toHaveLength(3);
    expect(getLatestBalance(parsed.transactions)).toBe(-497_000);
    expect(monthly.reduce((total, item) => total + item.income, 0)).toBe(
      summary.totalIncome,
    );
    expect(monthly.reduce((total, item) => total + item.expense, 0)).toBe(
      summary.totalExpense,
    );
    expect(
      analyses.conservative.forecasts.at(-1)?.expectedEndingBalance,
    ).toBeCloseTo(277_491, 0);
    expect(analyses.base.forecasts.at(-1)?.expectedEndingBalance).toBeCloseTo(
      456_000,
      2,
    );
    expect(
      analyses.optimistic.forecasts.at(-1)?.expectedEndingBalance,
    ).toBeCloseTo(634_509, 0);
  });
});
