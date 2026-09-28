import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { loadCsvDataSource } from "./csvDataSource";
import { detectTransactionSheet } from "./transactionSheetDetector";
import { mapColumns } from "./columnMapper";
import { standardizeTransactionRows } from "./transactionRowStandardizer";
import { parseTransactions } from "./transactionParser";
import { attachTransactionSource, type SourceTransaction } from "./multiFileSession";
import { calculateFinancialSummary } from "./financialEngine";

function csv(rowCount: number): ArrayBuffer {
  const lines = ["거래일,적요,입금액,출금액,잔액"];
  let balance = 0;
  for (let index = 0; index < rowCount; index += 1) {
    const income = index % 2 === 0;
    balance += income ? 1000 : -500;
    lines.push(`2026-01-${String(index % 28 + 1).padStart(2, "0")},거래${index},${income ? 1000 : ""},${income ? "" : 500},${balance}`);
  }
  return new TextEncoder().encode(lines.join("\n")).buffer;
}

function measure(fileCount: number) {
  const started = performance.now();
  const beforeHeap = process.memoryUsage().heapUsed;
  const retained: SourceTransaction[][] = [];
  for (let fileIndex = 0; fileIndex < fileCount; fileIndex += 1) {
    const source = loadCsvDataSource(csv(10_000));
    const detection = detectTransactionSheet(source.getSheetCandidates());
    if (!detection) throw new Error("transaction table not detected");
    const rows = source.getRows(detection.sheetName, detection.headerRowIndex);
    const mappings = mapColumns(source.getPreview(detection.sheetName, detection.headerRowIndex).columns, rows);
    const parsed = parseTransactions(standardizeTransactionRows(rows, mappings));
    const transactions = attachTransactionSource(parsed.transactions, {
      id: `file-${fileIndex}`,
      displayName: "same.csv",
      sizeBytes: 0,
      sourceType: "csv",
      selectionId: `file-${fileIndex}:selection-0`,
    }, detection.sheetName, detection.headerRowIndex);
    const summary = calculateFinancialSummary(transactions);
    expect(summary.transactionCount).toBe(10_000);
    retained.push(transactions);
  }
  const elapsedMs = performance.now() - started;
  const heapDeltaMiB = (process.memoryUsage().heapUsed - beforeHeap) / 1024 / 1024;
  expect(new Set(retained.map((transactions) => transactions[0].transactionSourceId)).size).toBe(fileCount);
  console.info(`[Day48B CSV] ${fileCount}×10k: ${elapsedMs.toFixed(1)}ms, heap delta ${heapDeltaMiB.toFixed(1)}MiB`);
  return elapsedMs;
}

describe("다중 파일 파이프라인 성능", () => {
  it("단일 1만 건과 5파일 × 1만 건을 각각 분석한다", () => {
    const singleMs = measure(1);
    const fiveMs = measure(5);
    expect(singleMs).toBeLessThan(10_000);
    expect(fiveMs).toBeLessThan(30_000);
  }, 45_000);
});
