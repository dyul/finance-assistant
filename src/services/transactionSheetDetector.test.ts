import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { calculateFinancialSummary } from "./financialEngine";
import { mapColumns } from "./columnMapper";
import { createExcelWorkbook } from "./excelWorkbook";
import {
  detectTransactionSheet,
  type TransactionSheetCandidate,
} from "./transactionSheetDetector";
import { parseTransactions } from "./transactionParser";
import { standardizeTransactionRows } from "./transactionRowStandardizer";

function candidate(
  sheetName: string,
  sheetIndex: number,
  rows: unknown[][],
): TransactionSheetCandidate {
  return { sheetName, sheetIndex, rows };
}

function separateAmountRows(count = 2): unknown[][] {
  return [
    ["거래일", "적요", "입금액", "출금액", "잔액"],
    ...Array.from({ length: count }, (_, index) => [
      `2026-01-${String(index + 1).padStart(2, "0")}`,
      index % 2 === 0 ? "상품판매" : "월세",
      index % 2 === 0 ? 500000 : 0,
      index % 2 === 0 ? 0 : 700000,
      1000000 - index * 200000,
    ]),
  ];
}

describe("detectTransactionSheet", () => {
  it("첫 번째 시트가 거래 시트이면 기존 순서를 유지한다", () => {
    const result = detectTransactionSheet([
      candidate("거래내역", 0, separateAmountRows()),
      candidate("요약", 1, [["항목", "금액"]]),
    ]);

    expect(result).toMatchObject({
      sheetName: "거래내역",
      sheetIndex: 0,
      headerRowIndex: 0,
      amountStructure: "separate",
      confidence: "high",
    });
  });

  it("두 번째 또는 세 번째 시트에 있는 거래내역을 선택한다", () => {
    const result = detectTransactionSheet([
      candidate("요약", 0, [["매출 요약"]]),
      candidate("예상결과", 1, [["예상월", "예상잔액"]]),
      candidate("거래내역", 2, separateAmountRows()),
    ]);

    expect(result?.sheetIndex).toBe(2);
    expect(result?.sheetName).toBe("거래내역");
  });

  it("상단 안내문 아래 4행에 있는 헤더를 찾는다", () => {
    const rows = [
      ["주식회사 예시"],
      ["조회기간: 2026-01-01~2026-01-31"],
      [],
      ...separateAmountRows(),
    ];

    expect(
      detectTransactionSheet([candidate("Sheet1", 0, rows)]),
    ).toMatchObject({ headerRowIndex: 3 });
  });

  it("이름만 거래내역인 빈 구조보다 완전한 Sheet1을 선택한다", () => {
    const result = detectTransactionSheet([
      candidate("거래내역", 0, [
        ["안내", "값"],
        ["업로드 안내", "내용 없음"],
      ]),
      candidate("Sheet1", 1, separateAmountRows()),
    ]);

    expect(result?.sheetName).toBe("Sheet1");
  });

  it("금액+방향 구조와 부호형 단일 금액 구조를 탐지한다", () => {
    const amountDirection = detectTransactionSheet([
      candidate("Sheet1", 0, [
        ["거래일", "적요", "거래구분", "금액", "잔액"],
        ["2026-01-01", "상품판매", "입금", 500000, 500000],
        ["2026-01-02", "월세", "출금", 700000, -200000],
      ]),
    ]);
    const signedAmount = detectTransactionSheet([
      candidate("Sheet1", 0, [
        ["거래일", "적요", "금액", "잔액"],
        ["2026-01-01", "상품판매", 500000, 500000],
        ["2026-01-02", "월세", -700000, -200000],
      ]),
    ]);

    expect(amountDirection?.amountStructure).toBe("amountDirection");
    expect(signedAmount?.amountStructure).toBe("signedAmount");
  });

  it("일부 invalid 금액이나 날짜가 있어도 유효 거래가 있으면 탐지한다", () => {
    const result = detectTransactionSheet([
      candidate("거래", 0, [
        ["거래일", "적요", "거래구분", "금액"],
        ["2026-01-01", "상품판매", "입금", 500000],
        ["날짜미정", "월세", "출금", 700000],
        ["2026-01-03", "확인 필요", "입금", "금액미정"],
      ]),
    ]);

    expect(result).not.toBeNull();
    expect(result?.validTransactionRowCount).toBe(1);
    expect(result?.sampledDataRowCount).toBe(3);
  });

  it("빈 시트와 거래 구조가 없는 통합 문서는 선택하지 않는다", () => {
    expect(
      detectTransactionSheet([
        candidate("빈 시트", 0, []),
        candidate("요약", 1, [
          ["항목", "값"],
          ["총 매출", 1000000],
        ]),
      ]),
    ).toBeNull();
  });

  it("점수가 같으면 유효 거래행이 더 많은 시트를 선택한다", () => {
    const result = detectTransactionSheet([
      candidate("Sheet1", 0, separateAmountRows(1)),
      candidate("Sheet2", 1, separateAmountRows(4)),
    ]);

    expect(result?.sheetName).toBe("Sheet2");
    expect(result?.validTransactionRowCount).toBe(4);
  });

  it("완전히 비슷한 후보는 앞쪽 시트를 선택하고 모호성을 표시한다", () => {
    const result = detectTransactionSheet([
      candidate("Sheet1", 0, separateAmountRows(2)),
      candidate("Sheet2", 1, separateAmountRows(2)),
    ]);

    expect(result).toMatchObject({
      sheetName: "Sheet1",
      ambiguous: true,
      confidence: "medium",
    });
  });

  it("4개 시트 Excel에서 거래내역을 선택해 전체 분석 파이프라인에 연결한다", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["항목", "값"],
        ["총 입금", 500000],
      ]),
      "요약",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["메모"], ["확인용 문서"]]),
      "메모",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["주식회사 예시"],
        ["거래내역 조회 결과"],
        [],
        ["거래일", "적요", "거래구분", "금액", "잔액"],
        ["2026-01-01", "상품판매", "입금", 500000, 1500000],
        ["2026-01-02", "월세", "출금", 700000, 800000],
      ]),
      "거래내역",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["예상월", "예상잔액"],
        ["2026-02", 900000],
      ]),
      "예상결과",
    );
    const workbookData = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });
    const uploadedWorkbook = XLSX.read(workbookData, { type: "array" });
    const candidates = createExcelWorkbook(
      uploadedWorkbook,
    ).getSheetCandidates();
    const detected = detectTransactionSheet(candidates);

    expect(detected).toMatchObject({
      sheetName: "거래내역",
      sheetIndex: 2,
      headerRowIndex: 3,
    });

    const selectedSheet = uploadedWorkbook.Sheets[detected!.sheetName];
    const objectRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      selectedSheet,
      { defval: "", range: detected!.headerRowIndex },
    );
    const mappings = mapColumns(Object.keys(objectRows[0]), objectRows);
    const standardizedRows = standardizeTransactionRows(
      objectRows,
      mappings,
    );
    const parsed = parseTransactions(standardizedRows);

    expect(calculateFinancialSummary(parsed.transactions)).toMatchObject({
      totalIncome: 500000,
      totalExpense: 700000,
      netCashFlow: -200000,
      transactionCount: 2,
    });
  });
});
