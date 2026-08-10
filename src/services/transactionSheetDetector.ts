import type { ColumnMapping } from "./columnMapper";
import { mapColumns } from "./columnMapper";
import type { DateNormalizationOptions } from "./dateNormalizer";
import {
  hasResolvedTransactionAmount,
  parseTransactions,
} from "./transactionParser";
import { standardizeTransactionRows } from "./transactionRowStandardizer";
import {
  createUniqueColumnNames,
  hasDuplicateColumnNames,
} from "./worksheetColumns";

export const MAX_HEADER_SCAN_ROWS = 30;
export const MAX_DATA_SAMPLE_ROWS = 50;

export type SheetDetectionConfidence = "high" | "medium" | "low";
export type DetectedAmountStructure =
  | "separate"
  | "amountDirection"
  | "signedAmount";

export interface TransactionSheetCandidate {
  sheetName: string;
  sheetIndex: number;
  rows: unknown[][];
}

export interface SheetDetectionResult {
  sheetName: string;
  sheetIndex: number;
  headerRowIndex: number;
  score: number;
  confidence: SheetDetectionConfidence;
  reasons: string[];
  validTransactionRowCount: number;
  sampledDataRowCount: number;
  coreColumnCount: number;
  amountStructure: DetectedAmountStructure;
  ambiguous: boolean;
}

interface HeaderEvaluation extends SheetDetectionResult {
  sheetNameHintScore: number;
  validRowRatio: number;
}

const POSITIVE_SHEET_NAME_HINTS = [
  "거래내역",
  "거래",
  "입출금",
  "계좌내역",
  "통장내역",
  "transaction",
  "transactions",
  "bank",
  "history",
];

const NEGATIVE_SHEET_NAME_HINTS = [
  "요약",
  "summary",
  "예상결과",
  "forecast",
  "메모",
  "memo",
  "안내",
  "readme",
];

function normalizeSheetName(sheetName: string): string {
  return sheetName.trim().toLowerCase().replace(/[\s_-]/g, "");
}

function getSheetNameHintScore(sheetName: string): number {
  const normalizedName = normalizeSheetName(sheetName);

  if (
    POSITIVE_SHEET_NAME_HINTS.some((hint) =>
      normalizedName.includes(normalizeSheetName(hint)),
    )
  ) {
    return 5;
  }

  if (
    NEGATIVE_SHEET_NAME_HINTS.some((hint) =>
      normalizedName.includes(normalizeSheetName(hint)),
    )
  ) {
    return -5;
  }

  return 0;
}

function isNonEmptyRow(row: unknown[]): boolean {
  return row.some(
    (cell) =>
      cell !== null &&
      cell !== undefined &&
      !(typeof cell === "string" && cell.trim() === ""),
  );
}

function createObjectRows(
  headerRow: unknown[],
  dataRows: unknown[][],
): Record<string, unknown>[] {
  const headers = createUniqueColumnNames(headerRow);

  return dataRows.map((row) => {
    const objectRow: Record<string, unknown> = {};

    headers.forEach((header, columnIndex) => {
      if (header) {
        objectRow[header] = row[columnIndex] ?? "";
      }
    });

    return objectRow;
  });
}

function getAmountStructure(
  mappings: ColumnMapping[],
): DetectedAmountStructure | null {
  const standardColumns = new Set(
    mappings.map((mapping) => mapping.standardName),
  );

  if (
    standardColumns.has("income") &&
    standardColumns.has("expense")
  ) {
    return "separate";
  }

  if (
    standardColumns.has("amount") &&
    standardColumns.has("direction")
  ) {
    return "amountDirection";
  }

  if (standardColumns.has("amount")) {
    return "signedAmount";
  }

  return null;
}

function getConfidence(
  score: number,
  validRowRatio: number,
  hasDescription: boolean,
): SheetDetectionConfidence {
  if (score >= 85 && validRowRatio >= 0.5 && hasDescription) {
    return "high";
  }

  if (score >= 65) {
    return "medium";
  }

  return "low";
}

function evaluateHeaderCandidate(
  candidate: TransactionSheetCandidate,
  headerRowIndex: number,
  options: DateNormalizationOptions,
): HeaderEvaluation | null {
  const headerRow = candidate.rows[headerRowIndex] ?? [];

  if (hasDuplicateColumnNames(headerRow)) {
    return null;
  }

  const columnNames = createUniqueColumnNames(headerRow);

  if (columnNames.length === 0) {
    return null;
  }

  const dataRows = candidate.rows
    .slice(headerRowIndex + 1)
    .filter(isNonEmptyRow)
    .slice(0, MAX_DATA_SAMPLE_ROWS);
  const objectRows = createObjectRows(headerRow, dataRows);
  const mappings = mapColumns(columnNames, objectRows);
  const standardColumns = new Set(
    mappings.map((mapping) => mapping.standardName),
  );
  const amountStructure = getAmountStructure(mappings);
  const hasDate = standardColumns.has("date");
  const hasDescription = standardColumns.has("description");
  const hasBalance = standardColumns.has("balance");

  if (!hasDate || amountStructure === null || dataRows.length === 0) {
    return null;
  }

  const standardizedRows = standardizeTransactionRows(
    objectRows,
    mappings,
  );
  const parsed = parseTransactions(standardizedRows, options);
  const validTransactionRowCount = parsed.transactions.filter(
    (transaction) =>
      transaction.date !== null &&
      hasResolvedTransactionAmount(transaction),
  ).length;

  if (validTransactionRowCount === 0) {
    return null;
  }

  const validRowRatio = validTransactionRowCount / dataRows.length;
  const sheetNameHintScore = getSheetNameHintScore(candidate.sheetName);
  const coreColumnCount =
    Number(hasDate) +
    Number(amountStructure !== null) +
    Number(hasDescription) +
    Number(hasBalance);
  const validRowScore = 5 + Math.round(validRowRatio * 5);
  const score =
    30 +
    30 +
    (hasDescription ? 15 : 0) +
    (hasBalance ? 10 : 0) +
    validRowScore +
    sheetNameHintScore;
  const reasons = [
    "거래일 컬럼 확인",
    amountStructure === "separate"
      ? "분리 입금·출금 컬럼 확인"
      : amountStructure === "amountDirection"
        ? "금액·거래구분 컬럼 확인"
        : "부호형 단일 금액 컬럼 확인",
  ];

  if (hasDescription) {
    reasons.push("거래내용 컬럼 확인");
  }

  if (hasBalance) {
    reasons.push("잔액 컬럼 확인");
  }

  reasons.push(
    `샘플 ${dataRows.length}행 중 유효 거래 ${validTransactionRowCount}행`,
  );

  if (sheetNameHintScore > 0) {
    reasons.push("거래 시트명 힌트 일치");
  } else if (sheetNameHintScore < 0) {
    reasons.push("요약·메모 시트명 힌트 감점");
  }

  return {
    sheetName: candidate.sheetName,
    sheetIndex: candidate.sheetIndex,
    headerRowIndex,
    score,
    confidence: getConfidence(score, validRowRatio, hasDescription),
    reasons,
    validTransactionRowCount,
    sampledDataRowCount: dataRows.length,
    coreColumnCount,
    amountStructure,
    ambiguous: false,
    sheetNameHintScore,
    validRowRatio,
  };
}

function compareEvaluations(
  first: HeaderEvaluation,
  second: HeaderEvaluation,
): number {
  return (
    second.score - first.score ||
    second.validTransactionRowCount - first.validTransactionRowCount ||
    second.coreColumnCount - first.coreColumnCount ||
    second.sheetNameHintScore - first.sheetNameHintScore ||
    first.sheetIndex - second.sheetIndex ||
    first.headerRowIndex - second.headerRowIndex
  );
}

function lowerConfidence(
  confidence: SheetDetectionConfidence,
): SheetDetectionConfidence {
  if (confidence === "high") {
    return "medium";
  }

  return "low";
}

export function detectTransactionSheet(
  candidates: TransactionSheetCandidate[],
  options: DateNormalizationOptions = {},
): SheetDetectionResult | null {
  const evaluations: HeaderEvaluation[] = [];

  for (const candidate of candidates) {
    const headerLimit = Math.min(
      candidate.rows.length,
      MAX_HEADER_SCAN_ROWS,
    );

    for (let headerRowIndex = 0; headerRowIndex < headerLimit; headerRowIndex += 1) {
      const evaluation = evaluateHeaderCandidate(
        candidate,
        headerRowIndex,
        options,
      );

      if (evaluation && evaluation.score >= 65) {
        evaluations.push(evaluation);
      }
    }
  }

  evaluations.sort(compareEvaluations);
  const selected = evaluations[0];

  if (!selected) {
    return null;
  }

  const runnerUp = evaluations.find(
    (evaluation) =>
      evaluation.sheetIndex !== selected.sheetIndex ||
      evaluation.headerRowIndex !== selected.headerRowIndex,
  );
  const ambiguous = Boolean(
    runnerUp &&
      selected.score - runnerUp.score <= 2 &&
      Math.abs(
        selected.validTransactionRowCount -
          runnerUp.validTransactionRowCount,
      ) <= 1 &&
      selected.coreColumnCount === runnerUp.coreColumnCount,
  );

  return {
    sheetName: selected.sheetName,
    sheetIndex: selected.sheetIndex,
    headerRowIndex: selected.headerRowIndex,
    score: selected.score,
    confidence: ambiguous
      ? lowerConfidence(selected.confidence)
      : selected.confidence,
    reasons: ambiguous
      ? [...selected.reasons, "유사한 거래 시트 후보가 존재함"]
      : selected.reasons,
    validTransactionRowCount: selected.validTransactionRowCount,
    sampledDataRowCount: selected.sampledDataRowCount,
    coreColumnCount: selected.coreColumnCount,
    amountStructure: selected.amountStructure,
    ambiguous,
  };
}
