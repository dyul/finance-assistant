import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";

import { mapColumns } from "./columnMapper";
import { loadCsvDataSource } from "./csvDataSource";
import { calculateFinancialSummary } from "./financialEngine";
import { getLatestBalance } from "./forecastEngine";
import { aggregateMonthly } from "./monthlyAggregator";
import { detectRecurringTransactions } from "./recurringTransactionDetector";
import { detectTransactionSheet } from "./transactionSheetDetector";
import { parseTransactions } from "./transactionParser";
import { standardizeTransactionRows } from "./transactionRowStandardizer";

function createLargeCsv(rowCount: number): ArrayBuffer {
  const lines = ["거래일,적요,입금액,출금액,잔액"];
  let balance = 0;

  for (let index = 0; index < rowCount; index += 1) {
    const isIncome = index % 2 === 0;
    const month = String((index % 3) + 1).padStart(2, "0");
    const day = String((index % 28) + 1).padStart(2, "0");
    balance += isIncome ? 1_000 : -500;
    lines.push(
      `2026-${month}-${day},거래-${index + 1},${isIncome ? "1000" : ""},${isIncome ? "" : "500"},${balance}`,
    );
  }

  return new TextEncoder().encode(lines.join("\n")).buffer;
}

describe("CSV 대용량 파이프라인 성능", () => {
  it.each([1_000, 5_000, 10_000])(
    "%i건을 decoding·파싱·자동 탐지·분석한다",
    (rowCount) => {
      const totalStart = performance.now();
      const parseStart = performance.now();
      const source = loadCsvDataSource(createLargeCsv(rowCount));
      const parseEnd = performance.now();
      const detection = detectTransactionSheet(source.getSheetCandidates());

      if (!detection) {
        throw new Error("large-csv-detection-failed");
      }

      const rows = source.getRows(
        detection.sheetName,
        detection.headerRowIndex,
      );
      const mappings = mapColumns(
        source.getPreview(
          detection.sheetName,
          detection.headerRowIndex,
        ).columns,
        rows,
      );
      const parsed = parseTransactions(
        standardizeTransactionRows(rows, mappings),
      );
      const summary = calculateFinancialSummary(parsed.transactions);
      const monthly = aggregateMonthly(parsed.transactions);
      const recurring = detectRecurringTransactions(parsed.transactions);
      const latestBalance = getLatestBalance(parsed.transactions);
      const totalEnd = performance.now();

      expect(summary).toMatchObject({
        totalIncome: Math.ceil(rowCount / 2) * 1_000,
        totalExpense: Math.floor(rowCount / 2) * 500,
        transactionCount: rowCount,
      });
      expect(monthly.reduce((sum, item) => sum + item.income, 0)).toBe(
        summary.totalIncome,
      );
      expect(recurring).toEqual([]);
      expect(latestBalance).not.toBeNull();
      console.info(
        `[Day35 CSV] ${rowCount} rows: csv=${(parseEnd - parseStart).toFixed(1)}ms, total=${(totalEnd - totalStart).toFixed(1)}ms`,
      );
      expect(totalEnd - totalStart).toBeLessThan(10_000);
    },
    20_000,
  );
});
