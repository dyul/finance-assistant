import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { analyzeDataQuality } from "./dataQualityAnalyzer";
import { calculateFinancialSummary } from "./financialEngine";
import { mapColumns } from "./columnMapper";
import {
  createExcelWorkbook,
  type ExcelWorkbook,
} from "./excelWorkbook";
import {
  countValidManualTransactions,
  convertManualMappingToColumnMappings,
  createManualMappingPrefill,
  validateManualMapping,
  type ManualTransactionMapping,
} from "./manualMapping";
import { detectTransactionSheet } from "./transactionSheetDetector";
import { parseTransactions } from "./transactionParser";
import { standardizeTransactionRows } from "./transactionRowStandardizer";

function createWorkbook(
  rows: unknown[][],
  sheetName = "Sheet1",
): ExcelWorkbook {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows),
    sheetName,
  );
  return createExcelWorkbook(workbook);
}

function analyzeManualMapping(
  workbook: ExcelWorkbook,
  mapping: ManualTransactionMapping,
) {
  const preview = workbook.getPreview(
    mapping.sheetName,
    mapping.headerRowIndex,
  );
  const rows = workbook.getRows(
    mapping.sheetName,
    mapping.headerRowIndex,
  );
  const columnMappings = convertManualMappingToColumnMappings(
    mapping,
    preview.columns,
  );

  return parseTransactions(
    standardizeTransactionRows(rows, columnMappings),
  );
}

describe("수동 시트·컬럼 매핑", () => {
  it("자동 인식 결과를 수동 설정 초기값으로 변환한다", () => {
    const columns = ["거래일", "적요", "입금액", "출금액", "잔액"];
    const prefill = createManualMappingPrefill(
      "거래내역",
      3,
      mapColumns(columns),
    );

    expect(prefill).toEqual({
      sheetName: "거래내역",
      headerRowIndex: 3,
      dateColumn: "거래일",
      descriptionColumn: "적요",
      balanceColumn: "잔액",
      amountMode: "split",
      incomeColumn: "입금액",
      expenseColumn: "출금액",
      amountColumn: undefined,
      directionColumn: undefined,
    });
  });

  it("시트와 헤더 행에 따라 컬럼 후보와 preview를 다시 만든다", () => {
    const rawWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      rawWorkbook,
      XLSX.utils.aoa_to_sheet([
        ["안내"],
        ["거래일", "입금액"],
        ["2026-01-01", 100_000],
      ]),
      "A",
    );
    XLSX.utils.book_append_sheet(
      rawWorkbook,
      XLSX.utils.aoa_to_sheet([
        ["작성일", "금액", "거래구분"],
        ["2026-02-01", 200_000, "입금"],
      ]),
      "B",
    );
    const workbook = createExcelWorkbook(rawWorkbook);

    expect(workbook.getPreview("A", 1)).toMatchObject({
      columns: ["거래일", "입금액"],
      rows: [{ 거래일: "2026-01-01", 입금액: 100_000 }],
    });
    expect(workbook.getPreview("B", 0).columns).toEqual([
      "작성일",
      "금액",
      "거래구분",
    ]);
  });

  it("입금·출금 분리형 수동 매핑을 기존 parser로 분석한다", () => {
    const workbook = createWorkbook([
      ["일자", "내용", "받은돈", "나간돈", "잔액값"],
      ["2026-01-01", "상품판매", 500_000, "", 500_000],
      ["2026-01-02", "월세", "", 700_000, -200_000],
    ]);
    const parsed = analyzeManualMapping(workbook, {
      sheetName: "Sheet1",
      headerRowIndex: 0,
      dateColumn: "일자",
      descriptionColumn: "내용",
      balanceColumn: "잔액값",
      amountMode: "split",
      incomeColumn: "받은돈",
      expenseColumn: "나간돈",
    });

    expect(
      detectTransactionSheet([
        ...workbook.getSheetCandidates(),
      ]),
    ).toBeNull();

    expect(calculateFinancialSummary(parsed.transactions)).toMatchObject({
      totalIncome: 500_000,
      totalExpense: 700_000,
      netCashFlow: -200_000,
    });
  });

  it("수동 매핑 후에도 유효한 거래가 없으면 성공으로 판단하지 않는다", () => {
    const workbook = createWorkbook([
      ["일자값", "입금값"],
      ["날짜미정", "금액미정"],
      ["", ""],
    ]);
    const parsed = analyzeManualMapping(workbook, {
      sheetName: "Sheet1",
      headerRowIndex: 0,
      dateColumn: "일자값",
      amountMode: "split",
      incomeColumn: "입금값",
    });

    expect(countValidManualTransactions(parsed.transactions)).toBe(0);
    expect(calculateFinancialSummary(parsed.transactions)).toMatchObject({
      totalIncome: 0,
      totalExpense: 0,
    });
  });

  it("금액+거래구분 수동 매핑을 기존 parser로 분석한다", () => {
    const workbook = createWorkbook([
      ["일자", "내용", "구분값", "거래값"],
      ["2026-01-01", "상품판매", "입금", 500_000],
      ["2026-01-02", "월세", "출금", 700_000],
    ]);
    const parsed = analyzeManualMapping(workbook, {
      sheetName: "Sheet1",
      headerRowIndex: 0,
      dateColumn: "일자",
      descriptionColumn: "내용",
      amountMode: "amount-direction",
      amountColumn: "거래값",
      directionColumn: "구분값",
    });

    expect(calculateFinancialSummary(parsed.transactions)).toMatchObject({
      totalIncome: 500_000,
      totalExpense: 700_000,
      netCashFlow: -200_000,
    });
  });

  it("부호형 단일 금액 수동 매핑을 기존 parser로 분석한다", () => {
    const workbook = createWorkbook([
      ["일자", "내용", "거래값"],
      ["2026-01-01", "상품판매", 500_000],
      ["2026-01-02", "월세", -700_000],
    ]);
    const parsed = analyzeManualMapping(workbook, {
      sheetName: "Sheet1",
      headerRowIndex: 0,
      dateColumn: "일자",
      descriptionColumn: "내용",
      amountMode: "signed",
      amountColumn: "거래값",
    });

    expect(calculateFinancialSummary(parsed.transactions)).toMatchObject({
      totalIncome: 500_000,
      totalExpense: 700_000,
      netCashFlow: -200_000,
    });
  });

  it("필수 컬럼 누락과 중복 선택을 구체적으로 차단한다", () => {
    const context = {
      sheetNames: ["Sheet1"],
      columns: ["일자", "금액", "구분"],
      headerRowLimit: 3,
    };

    expect(
      validateManualMapping(
        {
          sheetName: "Sheet1",
          headerRowIndex: 0,
          dateColumn: "",
          amountMode: "amount-direction",
          amountColumn: "금액",
        },
        context,
      ),
    ).toEqual(
      expect.arrayContaining([
        "거래일 컬럼은 필수입니다.",
        "거래구분 컬럼을 선택해주세요.",
      ]),
    );

    expect(
      validateManualMapping(
        {
          sheetName: "Sheet1",
          headerRowIndex: 0,
          dateColumn: "일자",
          amountMode: "signed",
          amountColumn: "일자",
        },
        context,
      ),
    ).toContain(
      "같은 컬럼 '일자'을 거래일, 금액 역할에 중복 선택할 수 없습니다.",
    );
  });

  it("상단 안내문이 있는 파일을 4행 헤더로 지정해 분석한다", () => {
    const workbook = createWorkbook([
      ["주식회사 예시"],
      ["조회기간"],
      [],
      ["일자", "내용", "입금값", "출금값"],
      ["2026-01-01", "상품판매", 500_000, ""],
      ["2026-01-02", "월세", "", 700_000],
    ]);
    const mapping: ManualTransactionMapping = {
      sheetName: "Sheet1",
      headerRowIndex: 3,
      dateColumn: "일자",
      descriptionColumn: "내용",
      amountMode: "split",
      incomeColumn: "입금값",
      expenseColumn: "출금값",
    };
    const preview = workbook.getPreview("Sheet1", 3);

    expect(
      validateManualMapping(mapping, {
        sheetNames: workbook.sheetNames,
        columns: preview.columns,
        headerRowLimit: preview.headerRowLimit,
      }),
    ).toEqual([]);
    expect(
      calculateFinancialSummary(analyzeManualMapping(workbook, mapping).transactions),
    ).toMatchObject({ totalIncome: 500_000, totalExpense: 700_000 });
  });

  it("같은 거래구분형 파일의 자동·수동 분석 결과와 품질 결과가 같다", () => {
    const workbook = createWorkbook([
      ["거래일", "적요", "거래구분", "금액", "잔액"],
      ["2026-01-01", "상품판매", "입금", 500_000, 500_000],
      ["2026-01-02", "월세", "출금", 700_000, -200_000],
      ["날짜미정", "확인", "입금", "금액미정", -200_000],
    ]);
    const preview = workbook.getPreview("Sheet1", 0);
    const rows = workbook.getRows("Sheet1", 0);
    const automaticMappings = mapColumns(preview.columns, rows);
    const automaticParsed = parseTransactions(
      standardizeTransactionRows(rows, automaticMappings),
    );
    const manualParsed = analyzeManualMapping(
      workbook,
      createManualMappingPrefill("Sheet1", 0, automaticMappings),
    );

    expect(calculateFinancialSummary(manualParsed.transactions)).toEqual(
      calculateFinancialSummary(automaticParsed.transactions),
    );
    expect(analyzeDataQuality(manualParsed.transactions)).toEqual(
      analyzeDataQuality(automaticParsed.transactions),
    );
  });
});
