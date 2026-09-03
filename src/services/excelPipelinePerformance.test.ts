import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { mapColumns } from "./columnMapper";
import { createExcelWorkbook } from "./excelWorkbook";
import { calculateFinancialSummary } from "./financialEngine";
import { getLatestBalance } from "./forecastEngine";
import { aggregateMonthly } from "./monthlyAggregator";
import { detectRecurringTransactions } from "./recurringTransactionDetector";
import { parseTransactions } from "./transactionParser";
import { standardizeTransactionRows } from "./transactionRowStandardizer";
import { detectTransactionSheet } from "./transactionSheetDetector";

interface StressTiming {
  rowCount: number;
  detectionMs: number;
  selectedSheetParseMs: number;
  analysisMs: number;
  totalMs: number;
}

function createLargeWorkbook(
  rowCount: number,
  headerRowNumber = 1,
  includeUnrelatedSheets = false,
) {
  let balance = 0;
  const rows: unknown[][] = [
    ...Array.from({ length: headerRowNumber - 1 }, (_, index) => [
      `안내 ${index + 1}`,
    ]),
    ["거래일", "적요", "입금액", "출금액", "잔액"],
  ];

  for (let index = 0; index < rowCount; index += 1) {
    const isIncome = index % 2 === 0;
    const month = (index % 3) + 1;
    const day = (index % 28) + 1;
    const income = isIncome ? 1_000 : "";
    const expense = isIncome ? "" : 500;
    balance += isIncome ? 1_000 : -500;
    rows.push([
      `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      `거래-${index + 1}`,
      income,
      expense,
      balance,
    ]);
  }

  const source = XLSX.utils.book_new();

  if (includeUnrelatedSheets) {
    XLSX.utils.book_append_sheet(
      source,
      XLSX.utils.aoa_to_sheet([["안내"], ["조회일시"], ["2026-09-03"]]),
      "안내",
    );
    XLSX.utils.book_append_sheet(
      source,
      XLSX.utils.aoa_to_sheet([["항목", "값"], ["총계", 1]]),
      "요약",
    );
  }

  XLSX.utils.book_append_sheet(
    source,
    XLSX.utils.aoa_to_sheet(rows),
    "거래내역",
  );

  return createExcelWorkbook(source);
}

function measurePipeline(
  rowCount: number,
  headerRowNumber = 1,
  includeUnrelatedSheets = false,
): StressTiming {
  const workbook = createLargeWorkbook(
    rowCount,
    headerRowNumber,
    includeUnrelatedSheets,
  );
  const totalStart = performance.now();
  const detectionStart = performance.now();
  const detection = detectTransactionSheet(workbook.getSheetCandidates());
  const detectionEnd = performance.now();

  if (!detection) {
    throw new Error("large-workbook-detection-failed");
  }

  const selectedParseStart = performance.now();
  const preview = workbook.getPreview(
    detection.sheetName,
    detection.headerRowIndex,
  );
  const rows = workbook.getRows(
    detection.sheetName,
    detection.headerRowIndex,
  );
  const mappings = mapColumns(preview.columns, rows);
  const parsed = parseTransactions(
    standardizeTransactionRows(rows, mappings),
  );
  const selectedParseEnd = performance.now();
  const analysisStart = performance.now();
  const summary = calculateFinancialSummary(parsed.transactions);
  const monthly = aggregateMonthly(parsed.transactions);
  const recurring = detectRecurringTransactions(parsed.transactions);
  const latestBalance = getLatestBalance(parsed.transactions);
  const analysisEnd = performance.now();

  const expectedIncome = Math.ceil(rowCount / 2) * 1_000;
  const expectedExpense = Math.floor(rowCount / 2) * 500;

  expect(summary).toMatchObject({
    totalIncome: expectedIncome,
    totalExpense: expectedExpense,
    netCashFlow: expectedIncome - expectedExpense,
    transactionCount: rowCount,
  });
  expect(monthly.reduce((total, item) => total + item.income, 0)).toBe(
    summary.totalIncome,
  );
  expect(monthly.reduce((total, item) => total + item.expense, 0)).toBe(
    summary.totalExpense,
  );
  expect(recurring).toEqual([]);
  expect(latestBalance).not.toBeNull();

  return {
    rowCount,
    detectionMs: detectionEnd - detectionStart,
    selectedSheetParseMs: selectedParseEnd - selectedParseStart,
    analysisMs: analysisEnd - analysisStart,
    totalMs: analysisEnd - totalStart,
  };
}

describe("Day 28 대용량 Excel 파이프라인 성능", () => {
  it.each([1_000, 5_000, 10_000])(
    "%i건을 자동 탐지·선택 시트 파싱·분석한다",
    (rowCount) => {
      const timing = measurePipeline(rowCount);

      console.info(
        `[Day28 stress] ${timing.rowCount} rows: detect=${timing.detectionMs.toFixed(1)}ms, parse=${timing.selectedSheetParseMs.toFixed(1)}ms, analysis=${timing.analysisMs.toFixed(1)}ms, total=${timing.totalMs.toFixed(1)}ms`,
      );
      expect(timing.totalMs).toBeLessThan(10_000);
    },
    20_000,
  );

  it("10k 거래에서 30행 이내 성공과 31~100행 fallback 비용을 측정한다", () => {
    const primary = measurePipeline(10_000, 30);
    const fallback = measurePipeline(10_000, 100);
    const multiSheetFallback = measurePipeline(10_000, 100, true);

    console.info(
      `[Day45 header scan] primary-30=${primary.detectionMs.toFixed(1)}ms, fallback-100=${fallback.detectionMs.toFixed(1)}ms, multi-sheet-fallback-100=${multiSheetFallback.detectionMs.toFixed(1)}ms`,
    );
    expect(primary.totalMs).toBeLessThan(10_000);
    expect(fallback.totalMs).toBeLessThan(10_000);
    expect(multiSheetFallback.totalMs).toBeLessThan(10_000);
  }, 30_000);
});
