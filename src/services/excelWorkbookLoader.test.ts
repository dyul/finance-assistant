import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { mapColumns } from "./columnMapper";
import { calculateFinancialSummary } from "./financialEngine";
import { getLatestBalance } from "./forecastEngine";
import { loadExcelWorkbook } from "./excelWorkbookLoader";
import { standardizeTransactionRows } from "./transactionRowStandardizer";
import { parseTransactions } from "./transactionParser";
import { detectTransactionSheet } from "./transactionSheetDetector";

function createWorkbookData(bookType: "xlsx" | "xls"): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["안내"],
      [],
      ["거래일", "적요", "입금액", "출금액", "잔액"],
      ["2026-01-01", "상품판매", 500_000, "", 500_000],
      ["2026-01-02", "월세", "", 700_000, -200_000],
    ]),
    "거래내역",
  );

  return XLSX.write(workbook, { bookType, type: "array" });
}

function createBankWorkbookData(bookType: "xlsx" | "xls"): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const rows: unknown[][] = [
    ["거래내역조회"],
    ["조회기간 2026-08-01 ~ 2026-09-03"],
    ["계좌정보 [synthetic]"],
    ...Array.from({ length: 36 }, () => []),
    ["거래일시", "적요", "출금액", "입금액", "잔액"],
    ["2026-09-01 09:00", "급여", "", 3_000_000, 3_500_000],
    ["2026-09-02 12:00", "월세", 800_000, "", 2_700_000],
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows),
    "Sheet1",
  );

  return XLSX.write(workbook, { bookType, type: "array" });
}

describe("Excel workbook 지연 로더", () => {
  it.each(["xlsx", "xls"] as const)(
    "%s 파일을 업로드 시점에 읽고 기존 분석용 데이터를 제공한다",
    async (bookType) => {
      const workbook = await loadExcelWorkbook(
        createWorkbookData(bookType),
      );

      expect(workbook.sheetNames).toEqual(["거래내역"]);
      expect(workbook.getPreview("거래내역", 2)).toMatchObject({
        columns: ["거래일", "적요", "입금액", "출금액", "잔액"],
      });
      expect(workbook.getRows("거래내역", 2)).toHaveLength(2);
      expect(workbook.getSheetCandidates()[0]).toMatchObject({
        sheetName: "거래내역",
        sheetIndex: 0,
      });
    },
  );

  it.each(["xlsx", "xls"] as const)(
    "%s 역정렬 파일에서도 동일 날짜의 가장 늦은 거래 시각 잔액을 찾는다",
    async (bookType) => {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
          ["거래일시", "적요", "입금액", "출금액", "거래후잔액"],
          ["2026-09-03 13:35", "합성 입금", 200_000, "", 1_100_000],
          ["2026-09-03 09:10", "합성 출금", "", 100_000, 900_000],
        ]),
        "거래내역",
      );
      const uploadedWorkbook = await loadExcelWorkbook(
        XLSX.write(workbook, { bookType, type: "array" }),
      );
      const detection = detectTransactionSheet(
        uploadedWorkbook.getSheetCandidates(),
      );
      const rows = uploadedWorkbook.getRows(
        detection!.sheetName,
        detection!.headerRowIndex,
      );
      const preview = uploadedWorkbook.getPreview(
        detection!.sheetName,
        detection!.headerRowIndex,
      );
      const parsed = parseTransactions(
        standardizeTransactionRows(rows, mapColumns(preview.columns, rows)),
      );

      expect(parsed.transactions.map((transaction) => transaction.time)).toEqual([
        "13:35:00",
        "09:10:00",
      ]);
      expect(getLatestBalance(parsed.transactions)).toBe(1_100_000);
    },
  );

  it.each(["xlsx", "xls"] as const)(
    "%s 은행식 합성 파일의 40행 헤더를 자동 탐지해 분석한다",
    async (bookType) => {
      const workbook = await loadExcelWorkbook(
        createBankWorkbookData(bookType),
      );
      const detection = detectTransactionSheet(
        workbook.getSheetCandidates(),
      );

      expect(detection).toMatchObject({
        sheetName: "Sheet1",
        headerRowIndex: 39,
        amountStructure: "separate",
      });

      const preview = workbook.getPreview(
        detection!.sheetName,
        detection!.headerRowIndex,
      );
      const rows = workbook.getRows(
        detection!.sheetName,
        detection!.headerRowIndex,
      );
      const parsed = parseTransactions(
        standardizeTransactionRows(
          rows,
          mapColumns(preview.columns, rows),
        ),
      );

      expect(calculateFinancialSummary(parsed.transactions)).toMatchObject({
        totalIncome: 3_000_000,
        totalExpense: 800_000,
        netCashFlow: 2_200_000,
        transactionCount: 2,
      });
      expect(getLatestBalance(parsed.transactions)).toBe(2_700_000);
    },
  );

  it("수식 셀을 실행하지 않고 통합 문서에 저장된 결과값으로 읽는다", async () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["거래일", "적요", "입금액", "출금액"],
      ["2026-01-01", "상품판매", 0, 0],
    ]);

    worksheet.C2 = { t: "n", f: "450000+50000", v: 500000 };
    XLSX.utils.book_append_sheet(workbook, worksheet, "거래내역");

    const uploadedWorkbook = await loadExcelWorkbook(
      XLSX.write(workbook, { bookType: "xlsx", type: "array" }),
    );
    const rows = uploadedWorkbook.getRows("거래내역", 0);

    expect(rows[0]?.입금액).toBe(500000);
  });
});
