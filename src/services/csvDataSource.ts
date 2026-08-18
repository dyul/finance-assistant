import { MAX_MANUAL_HEADER_ROWS } from "./manualMapping";
import {
  MAX_DATA_SAMPLE_ROWS,
  MAX_HEADER_SCAN_ROWS,
} from "./transactionSheetDetector";
import type {
  TransactionDataSource,
  TransactionTextEncoding,
} from "./transactionDataSource";
import { createUniqueColumnNames } from "./worksheetColumns";

const CSV_DATA_SET_NAME = "CSV";
const MANUAL_PREVIEW_ROW_COUNT = 5;
const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;

export type CsvLoadErrorCode =
  | "decodingFailed"
  | "malformedCsv"
  | "delimiterNotRecognized"
  | "emptyCsv";

export class CsvLoadError extends Error {
  readonly code: CsvLoadErrorCode;

  constructor(code: CsvLoadErrorCode) {
    super(code);
    this.name = "CsvLoadError";
    this.code = code;
  }
}

export interface DecodedCsv {
  text: string;
  encoding: TransactionTextEncoding;
}

function startsWithUtf8Bom(bytes: Uint8Array): boolean {
  return UTF8_BOM.every((value, index) => bytes[index] === value);
}

function hasSuspiciousReplacementCharacters(text: string): boolean {
  const replacementCount = [...text].filter(
    (character) => character === "\uFFFD",
  ).length;

  return (
    replacementCount >= 3 ||
    (replacementCount > 0 && replacementCount / Math.max(text.length, 1) >= 0.01)
  );
}

function decodeStrict(
  bytes: Uint8Array,
  encoding: TransactionTextEncoding,
): string {
  return new TextDecoder(encoding, { fatal: true }).decode(bytes);
}

export function decodeCsv(arrayBuffer: ArrayBuffer): DecodedCsv {
  const originalBytes = new Uint8Array(arrayBuffer);
  const hasBom = startsWithUtf8Bom(originalBytes);
  const bytes = hasBom ? originalBytes.slice(UTF8_BOM.length) : originalBytes;

  try {
    const text = decodeStrict(bytes, "utf-8");

    if (hasSuspiciousReplacementCharacters(text)) {
      throw new CsvLoadError("decodingFailed");
    }

    return { text, encoding: "utf-8" };
  } catch (error) {
    if (hasBom || error instanceof CsvLoadError) {
      throw new CsvLoadError("decodingFailed");
    }
  }

  try {
    const text = decodeStrict(bytes, "euc-kr");

    if (hasSuspiciousReplacementCharacters(text)) {
      throw new CsvLoadError("decodingFailed");
    }

    return { text, encoding: "euc-kr" };
  } catch {
    throw new CsvLoadError("decodingFailed");
  }
}

function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === "");
}

export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let justClosedQuote = false;

  function finishField() {
    row.push(field);
    field = "";
    justClosedQuote = false;
  }

  function finishRow() {
    finishField();
    rows.push(row);
    row = [];
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character !== '"') {
        field += character;
        continue;
      }

      if (text[index + 1] === '"') {
        field += '"';
        index += 1;
        continue;
      }

      inQuotes = false;
      justClosedQuote = true;
      continue;
    }

    if (justClosedQuote && character !== "," && character !== "\r" && character !== "\n") {
      throw new CsvLoadError("malformedCsv");
    }

    if (character === '"') {
      if (field !== "") {
        throw new CsvLoadError("malformedCsv");
      }

      inQuotes = true;
      continue;
    }

    if (character === ",") {
      finishField();
      continue;
    }

    if (character === "\r" || character === "\n") {
      finishRow();

      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }

      continue;
    }

    field += character;
  }

  if (inQuotes) {
    throw new CsvLoadError("malformedCsv");
  }

  if (field !== "" || row.length > 0 || justClosedQuote) {
    finishRow();
  }

  while (rows.length > 0 && isBlankRow(rows.at(-1) ?? [])) {
    rows.pop();
  }

  if (rows.length === 0) {
    throw new CsvLoadError("emptyCsv");
  }

  if (!rows.some((candidate) => candidate.length > 1)) {
    throw new CsvLoadError("delimiterNotRecognized");
  }

  return rows;
}

function createObjectRows(
  rows: string[][],
  headerRowIndex: number,
): Record<string, unknown>[] {
  const columns = createUniqueColumnNames(rows[headerRowIndex] ?? []);

  return rows
    .slice(headerRowIndex + 1)
    .filter((row) => !isBlankRow(row))
    .map((row) =>
      Object.fromEntries(
        columns.map((column, columnIndex) => [
          column,
          row[columnIndex] ?? "",
        ]),
      ),
    );
}

export function createCsvDataSource(
  rows: string[][],
  encoding: TransactionTextEncoding = "utf-8",
): TransactionDataSource {
  const headerRowLimit = Math.max(
    1,
    Math.min(MAX_MANUAL_HEADER_ROWS, rows.length),
  );

  return {
    sourceType: "csv",
    sheetNames: [CSV_DATA_SET_NAME],
    date1904: false,
    textEncoding: encoding,
    getSheetCandidates() {
      return [
        {
          sheetName: CSV_DATA_SET_NAME,
          sheetIndex: 0,
          rows: rows.slice(
            0,
            MAX_HEADER_SCAN_ROWS + MAX_DATA_SAMPLE_ROWS,
          ),
        },
      ];
    },
    getPreview(sheetName, headerRowIndex) {
      if (
        sheetName !== CSV_DATA_SET_NAME ||
        headerRowIndex < 0 ||
        headerRowIndex >= headerRowLimit
      ) {
        return { columns: [], rows: [], headerRowLimit };
      }

      const columns = createUniqueColumnNames(rows[headerRowIndex] ?? []);
      const previewRows = rows
        .slice(
          headerRowIndex + 1,
          headerRowIndex + 1 + MANUAL_PREVIEW_ROW_COUNT,
        )
        .map((row) =>
          Object.fromEntries(
            columns.map((column, columnIndex) => [
              column,
              row[columnIndex] ?? "",
            ]),
          ),
        );

      return { columns, rows: previewRows, headerRowLimit };
    },
    getRows(sheetName, headerRowIndex) {
      if (
        sheetName !== CSV_DATA_SET_NAME ||
        headerRowIndex < 0 ||
        headerRowIndex >= headerRowLimit
      ) {
        return [];
      }

      return createObjectRows(rows, headerRowIndex);
    },
  };
}

export function loadCsvDataSource(
  arrayBuffer: ArrayBuffer,
): TransactionDataSource {
  const decoded = decodeCsv(arrayBuffer);
  const rows = parseCsvText(decoded.text);

  return createCsvDataSource(rows, decoded.encoding);
}
