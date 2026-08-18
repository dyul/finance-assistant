import type { ManualWorksheetPreview } from "./manualMapping";
import type { TransactionSheetCandidate } from "./transactionSheetDetector";

export type TransactionSourceType = "excel" | "csv";
export type TransactionTextEncoding = "utf-8" | "euc-kr";

export interface TransactionDataSource {
  sourceType: TransactionSourceType;
  sheetNames: string[];
  date1904: boolean;
  textEncoding?: TransactionTextEncoding;
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
