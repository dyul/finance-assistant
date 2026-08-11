/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { mapColumns } from "./columnMapper";
import { loadExcelWorkbook } from "./excelWorkbookLoader";
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

describe("사용자용 샘플 Excel", () => {
  it("실제 업로드 파이프라인에서 Day 8 핵심 결과를 만든다", async () => {
    const sampleBytes = readFileSync(
      resolve(
        "public",
        "samples",
        "finance-assistant-sample.xlsx",
      ),
    );
    const workbook = await loadExcelWorkbook(
      Uint8Array.from(sampleBytes).buffer,
    );
    const detection = detectTransactionSheet(
      workbook.getSheetCandidates(),
      { date1904: workbook.date1904 },
    );

    expect(workbook.sheetNames).toEqual(["거래내역"]);
    expect(detection?.sheetName).toBe("거래내역");

    const preview = workbook.getPreview(
      detection?.sheetName ?? "",
      detection?.headerRowIndex ?? 0,
    );
    const rows = workbook.getRows(
      detection?.sheetName ?? "",
      detection?.headerRowIndex ?? 0,
    );
    const mappings = mapColumns(preview.columns, rows);
    const parsed = parseTransactions(
      standardizeTransactionRows(rows, mappings),
      { date1904: workbook.date1904 },
    );
    const summary = calculateFinancialSummary(parsed.transactions);
    const monthly = aggregateMonthly(parsed.transactions);
    const recurringTransactions = detectRecurringTransactions(
      parsed.transactions,
    );
    const analyses = createScenarioForecastAnalyses(
      recurringTransactions,
      getLatestBalance(parsed.transactions),
    );

    expect(parsed.invalidDateCount).toBe(0);
    expect(summary).toMatchObject({
      totalIncome: 2_850_000,
      totalExpense: 4_347_000,
      netCashFlow: -1_497_000,
      transactionCount: 10,
    });
    expect(
      recurringTransactions.map((transaction) => transaction.description),
    ).toEqual(expect.arrayContaining(["상품판매", "월세", "전기요금"]));
    expect(recurringTransactions).toHaveLength(3);
    expect(getLatestBalance(parsed.transactions)).toBe(-497_000);
    expect(
      monthly.reduce((total, item) => total + item.income, 0),
    ).toBe(summary.totalIncome);
    expect(
      monthly.reduce((total, item) => total + item.expense, 0),
    ).toBe(summary.totalExpense);
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
