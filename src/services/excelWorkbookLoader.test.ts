import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { loadExcelWorkbook } from "./excelWorkbookLoader";

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
});
