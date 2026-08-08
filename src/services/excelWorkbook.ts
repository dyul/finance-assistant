import * as XLSX from "xlsx";

import type { ManualWorksheetPreview } from "./manualMapping";
import {
  MAX_DATA_SAMPLE_ROWS,
  MAX_HEADER_SCAN_ROWS,
  type TransactionSheetCandidate,
} from "./transactionSheetDetector";

const MANUAL_HEADER_LIMIT = 30;
const MANUAL_PREVIEW_ROW_COUNT = 5;

export interface ExcelWorkbook {
  sheetNames: string[];
  date1904: boolean;
  getSheetCandidates(): TransactionSheetCandidate[];
  getPreview(
    sheetName: string,
    headerRowIndex: number,
  ): ManualWorksheetPreview;
  getRows(
    sheetName: string,
    headerRowIndex: number,
  ): Record<string, unknown>[];
}

function createUniqueColumnNames(headerRow: unknown[]): string[] {
  const usedNames = new Map<string, number>();

  return headerRow.map((cell, columnIndex) => {
    const rawName = String(cell ?? "").trim();
    const baseName = rawName || `빈 컬럼 ${columnIndex + 1}`;
    const duplicateCount = usedNames.get(baseName) ?? 0;

    usedNames.set(baseName, duplicateCount + 1);

    return duplicateCount === 0
      ? baseName
      : `${baseName}_${duplicateCount}`;
  });
}

function getWorksheetDetectionRows(
  worksheet: XLSX.WorkSheet,
): unknown[][] {
  const reference = worksheet["!ref"];

  if (!reference) {
    return [];
  }

  const usedRange = XLSX.utils.decode_range(reference);
  const range = {
    s: { r: 0, c: usedRange.s.c },
    e: {
      r: Math.min(
        usedRange.e.r,
        MAX_HEADER_SCAN_ROWS + MAX_DATA_SAMPLE_ROWS - 1,
      ),
      c: usedRange.e.c,
    },
  };

  return XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
    blankrows: true,
    range,
  });
}

function createPreview(
  workbook: XLSX.WorkBook,
  sheetName: string,
  headerRowIndex: number,
): ManualWorksheetPreview {
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    return { columns: [], rows: [], headerRowLimit: 0 };
  }

  const reference = worksheet["!ref"];

  if (!reference) {
    return { columns: [], rows: [], headerRowLimit: 1 };
  }

  const usedRange = XLSX.utils.decode_range(reference);
  const headerRowLimit = Math.max(
    1,
    Math.min(MANUAL_HEADER_LIMIT, usedRange.e.r + 1),
  );

  if (headerRowIndex < 0 || headerRowIndex >= headerRowLimit) {
    return { columns: [], rows: [], headerRowLimit };
  }

  const arrayRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
    blankrows: true,
    range: {
      s: { r: headerRowIndex, c: usedRange.s.c },
      e: {
        r: Math.min(
          usedRange.e.r,
          headerRowIndex + MANUAL_PREVIEW_ROW_COUNT,
        ),
        c: usedRange.e.c,
      },
    },
  });
  const columns = createUniqueColumnNames(arrayRows[0] ?? []);
  const rows = arrayRows.slice(1).map((row) =>
    Object.fromEntries(
      columns.map((column, columnIndex) => [
        column,
        row[columnIndex] ?? "",
      ]),
    ),
  );

  return { columns, rows, headerRowLimit };
}

function createRows(
  workbook: XLSX.WorkBook,
  sheetName: string,
  headerRowIndex: number,
): Record<string, unknown>[] {
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    return [];
  }

  return XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: "",
    range: headerRowIndex,
  });
}

export function createExcelWorkbook(
  workbook: XLSX.WorkBook,
): ExcelWorkbook {
  const sheetNames = [...workbook.SheetNames];

  return {
    sheetNames,
    date1904: workbook.Workbook?.WBProps?.date1904 === true,
    getSheetCandidates() {
      return sheetNames.map((sheetName, sheetIndex) => ({
        sheetName,
        sheetIndex,
        rows: getWorksheetDetectionRows(workbook.Sheets[sheetName]),
      }));
    },
    getPreview(sheetName, headerRowIndex) {
      return createPreview(workbook, sheetName, headerRowIndex);
    },
    getRows(sheetName, headerRowIndex) {
      return createRows(workbook, sheetName, headerRowIndex);
    },
  };
}

export function readExcelWorkbook(arrayBuffer: ArrayBuffer): ExcelWorkbook {
  return createExcelWorkbook(XLSX.read(arrayBuffer, { type: "array" }));
}
