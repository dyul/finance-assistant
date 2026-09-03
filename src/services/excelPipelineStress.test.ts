/// <reference types="node" />

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import AnalysisIssuePanel from "../components/AnalysisIssuePanel";
import {
  createBlockingAnalysisIssue,
  createPartialAnalysisIssues,
} from "./analysisIssuePresentation";
import { mapColumns } from "./columnMapper";
import { analyzeDataQuality } from "./dataQualityAnalyzer";
import {
  createExcelWorkbook,
  type ExcelWorkbook,
} from "./excelWorkbook";
import { calculateFinancialSummary } from "./financialEngine";
import { getLatestBalance } from "./forecastEngine";
import { aggregateMonthly } from "./monthlyAggregator";
import { detectRecurringTransactions } from "./recurringTransactionDetector";
import { standardizeTransactionRows } from "./transactionRowStandardizer";
import {
  countValidManualTransactions,
  convertManualMappingToColumnMappings,
  type ManualTransactionMapping,
  validateManualMapping,
} from "./manualMapping";
import { parseTransactions } from "./transactionParser";
import { detectTransactionSheet } from "./transactionSheetDetector";
import {
  loadUserFileSession,
  saveUserFileSession,
  type StorageAdapter,
} from "./userSessionStorage";

interface SheetFixture {
  name: string;
  rows: unknown[][];
  merges?: XLSX.Range[];
}

class StressStorage implements StorageAdapter {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function createWorkbook(sheets: SheetFixture[]): ExcelWorkbook {
  const source = XLSX.utils.book_new();

  for (const fixture of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(fixture.rows);

    if (fixture.merges) {
      worksheet["!merges"] = fixture.merges;
    }

    XLSX.utils.book_append_sheet(source, worksheet, fixture.name);
  }

  return createExcelWorkbook(source);
}

function rowsWithHeaderAt(headerRowNumber: number): unknown[][] {
  return [
    ...Array.from({ length: headerRowNumber - 1 }, (_, index) => [
      `설명 ${index + 1}`,
    ]),
    ["거래일", "적요", "입금액", "출금액", "잔액"],
    ["2026-01-05", "상품판매", 500_000, "", 500_000],
    ["2026-01-10", "월세", "", 200_000, 300_000],
  ];
}

function analyzeAutomatically(workbook: ExcelWorkbook) {
  const detection = detectTransactionSheet(workbook.getSheetCandidates(), {
    date1904: workbook.date1904,
  });

  if (!detection) {
    return null;
  }

  const preview = workbook.getPreview(
    detection.sheetName,
    detection.headerRowIndex,
  );
  const rows = workbook.getRows(
    detection.sheetName,
    detection.headerRowIndex,
  );
  const mappings = mapColumns(preview.columns, rows);
  const parsed = parseTransactions(
    standardizeTransactionRows(rows, mappings),
    { date1904: workbook.date1904 },
  );

  return {
    detection,
    rows,
    mappings,
    parsed,
    summary: calculateFinancialSummary(parsed.transactions),
    monthly: aggregateMonthly(parsed.transactions),
    recurring: detectRecurringTransactions(parsed.transactions),
    latestBalance: getLatestBalance(parsed.transactions),
    quality: analyzeDataQuality(parsed.transactions),
  };
}

function amountIssueCounts(parsed: ReturnType<typeof parseTransactions>) {
  return {
    invalidAmountCount: parsed.invalidAmountCount,
    unknownDirectionCount: parsed.unknownDirectionCount,
    directionConflictCount: parsed.directionConflictCount,
    directionOverrideCount: parsed.directionOverrideCount,
    columnConflictCount: parsed.columnConflictCount,
  };
}

describe("Day 28 Excel 스트레스 입력", () => {
  it.each([
    [1, 0, true],
    [4, 3, true],
    [10, 9, true],
    [20, 19, true],
    [30, 29, true],
    [31, 30, true],
    [50, 49, true],
    [100, 99, true],
    [101, null, false],
  ] as const)(
    "실제 헤더가 %i행이면 탐색 범위 정책에 맞게 처리한다",
    (headerRowNumber, expectedIndex, shouldDetect) => {
      const workbook = createWorkbook([
        { name: "거래내역", rows: rowsWithHeaderAt(headerRowNumber) },
      ]);
      const detection = detectTransactionSheet(
        workbook.getSheetCandidates(),
      );

      expect(detection !== null).toBe(shouldDetect);
      expect(detection?.headerRowIndex ?? null).toBe(expectedIndex);
    },
  );

  it.each([31, 100])(
    "%i행 헤더는 fallback 자동 탐지 후에도 직접 설정으로 안전하게 재분석한다",
    (headerRowNumber) => {
      const workbook = createWorkbook([
        { name: "거래내역", rows: rowsWithHeaderAt(headerRowNumber) },
      ]);
      const headerRowIndex = headerRowNumber - 1;
      const preview = workbook.getPreview("거래내역", headerRowIndex);
      const mapping: ManualTransactionMapping = {
        sheetName: "거래내역",
        headerRowIndex,
        dateColumn: "거래일",
        descriptionColumn: "적요",
        balanceColumn: "잔액",
        amountMode: "split",
        incomeColumn: "입금액",
        expenseColumn: "출금액",
      };

      expect(
        detectTransactionSheet(workbook.getSheetCandidates()),
      ).toMatchObject({ headerRowIndex });
      expect(preview.columns).toEqual([
        "거래일",
        "적요",
        "입금액",
        "출금액",
        "잔액",
      ]);
      expect(
        validateManualMapping(mapping, {
          sheetNames: workbook.sheetNames,
          columns: preview.columns,
          headerRowLimit: preview.headerRowLimit,
        }),
      ).toEqual([]);

      const parsed = parseTransactions(
        standardizeTransactionRows(
          workbook.getRows("거래내역", headerRowIndex),
          convertManualMappingToColumnMappings(mapping, preview.columns),
        ),
      );

      expect(calculateFinancialSummary(parsed.transactions)).toMatchObject({
        totalIncome: 500_000,
        totalExpense: 200_000,
        netCashFlow: 300_000,
        transactionCount: 2,
      });
    },
  );

  it("101행 헤더는 자동·수동 지원 범위 밖으로 명확하게 차단한다", () => {
    const workbook = createWorkbook([
      { name: "거래내역", rows: rowsWithHeaderAt(101) },
    ]);
    const preview = workbook.getPreview("거래내역", 100);
    const mapping: ManualTransactionMapping = {
      sheetName: "거래내역",
      headerRowIndex: 100,
      dateColumn: "거래일",
      amountMode: "signed",
      amountColumn: "금액",
    };

    expect(detectTransactionSheet(workbook.getSheetCandidates())).toBeNull();
    expect(preview).toEqual({
      columns: [],
      rows: [],
      headerRowLimit: 100,
    });
    expect(
      validateManualMapping(mapping, {
        sheetNames: workbook.sheetNames,
        columns: preview.columns,
        headerRowLimit: preview.headerRowLimit,
      }),
    ).toContain("헤더 행은 실제 시트의 1~100행 안에서 선택해주세요.");
  });

  it("병합된 상단 제목과 14개 설명행 뒤의 실제 헤더를 찾는다", () => {
    const workbook = createWorkbook([
      {
        name: "거래내역",
        rows: rowsWithHeaderAt(15),
        merges: [XLSX.utils.decode_range("A1:E1")],
      },
    ]);

    expect(
      detectTransactionSheet(workbook.getSheetCandidates()),
    ).toMatchObject({ sheetName: "거래내역", headerRowIndex: 14 });
  });

  it("요약·메모·예상결과·백업이 있어도 실제 거래 시트를 선택한다", () => {
    const workbook = createWorkbook([
      { name: "요약", rows: [["총계"], [123]] },
      { name: "메모", rows: [["안내"], ["테스트"]] },
      { name: "예상결과", rows: [["예상월", "금액"], ["2026-04", 1]] },
      { name: "거래내역", rows: rowsWithHeaderAt(20) },
      { name: "백업", rows: [["백업 데이터"]] },
    ]);

    expect(
      detectTransactionSheet(workbook.getSheetCandidates()),
    ).toMatchObject({ sheetName: "거래내역", headerRowIndex: 19 });
  });

  it("거래 사이 빈 행 100개를 건너뛰고 유효 거래만 합산한다", () => {
    const rows: unknown[][] = [
      ["거래일", "적요", "입금액", "출금액", "잔액"],
      ["2026-01-01", "매출", 500_000, "", 500_000],
      ...Array.from({ length: 100 }, () => []),
      ["2026-02-01", "월세", "", 200_000, 300_000],
    ];
    const result = analyzeAutomatically(
      createWorkbook([{ name: "거래내역", rows }]),
    );

    expect(result?.summary).toMatchObject({
      totalIncome: 500_000,
      totalExpense: 200_000,
      netCashFlow: 300_000,
      transactionCount: 2,
    });
  });

  it("중복 헤더는 수동 설정에서 고유 이름으로 구분하고 자동 확정하지 않는다", () => {
    const workbook = createWorkbook([
      {
        name: "거래내역",
        rows: [
          ["거래일", "거래일", "적요", "적요", "금액", "금액"],
          ["2026-01-01", "2025-01-01", "첫 내용", "실제 내용", 1, 500_000],
        ],
      },
    ]);
    const preview = workbook.getPreview("거래내역", 0);

    expect(preview.columns).toEqual([
      "거래일",
      "거래일_1",
      "적요",
      "적요_1",
      "금액",
      "금액_1",
    ]);
    expect(
      detectTransactionSheet(workbook.getSheetCandidates()),
    ).toBeNull();
  });

  it("텍스트 금액과 방향 오류를 0원으로 바꾸지 않고 유효·오류로 분리한다", () => {
    const parsed = parseTransactions([
      { date: "2026-01-01", amount: 500_000, direction: "입금" },
      { date: "2026-01-02", amount: "500,000", direction: "입금" },
      { date: "2026-01-03", amount: "500,000원", direction: "입금" },
      { date: "2026-01-04", amount: "N/A", direction: "출금" },
      { date: "2026-01-05", amount: "금액미정", direction: "입금" },
      { date: "2026-01-06", amount: 100_000, direction: "기타" },
      { date: "2026-01-07", amount: 100_000, direction: "UNKNOWN" },
    ]);

    expect(parsed.totalIncome).toBe(1_500_000);
    expect(parsed.totalExpense).toBe(0);
    expect(parsed.invalidAmountCount).toBe(2);
    expect(parsed.unknownDirectionCount).toBe(2);
    expect(parsed.transactions.slice(3).every(
      (transaction) => transaction.income === null,
    )).toBe(true);
  });

  it("최신 거래 잔액이 비어 있으면 이전의 유효한 최신 잔액을 사용하고 실제 0은 유지한다", () => {
    const missingLatest = parseTransactions([
      { date: "2026-01-01", income: 100, balance: 700 },
      { date: "2026-02-01", income: 100, balance: "" },
    ]);
    const actualZero = parseTransactions([
      { date: "2026-01-01", income: 100, balance: 700 },
      { date: "2026-02-01", income: 100, balance: 0 },
    ]);

    expect(getLatestBalance(missingLatest.transactions)).toBe(700);
    expect(getLatestBalance(actualZero.transactions)).toBe(0);
  });

  it("무작위 순서와 혼합 날짜 형식에서도 월별·반복·최신 잔액을 날짜 기준으로 계산한다", () => {
    const parsed = parseTransactions([
      { date: "2026.03.05", description: "상품판매", income: 110, balance: 315 },
      { date: "2026년 1월 5일", description: "상품판매", income: 100, balance: 100 },
      { date: "20260205", description: "상품판매", income: 105, balance: 205 },
      { date: "", description: "날짜 누락", expense: 10, balance: 305 },
      { date: "2026-02-30", description: "날짜 오류", expense: 20, balance: 285 },
    ]);
    const monthly = aggregateMonthly(parsed.transactions);
    const recurring = detectRecurringTransactions(parsed.transactions);

    expect(monthly.map((item) => item.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(monthly.reduce((total, item) => total + item.income, 0)).toBe(315);
    expect(recurring[0]?.monthlyAmounts).toEqual([
      { month: "2026-01", amount: 100 },
      { month: "2026-02", amount: 105 },
      { month: "2026-03", amount: 110 },
    ]);
    expect(getLatestBalance(parsed.transactions)).toBe(315);
    expect(parsed.invalidDateCount).toBe(2);
  });

  it("100행 중 3행만 유효하면 부분 분석 경고와 포함 범위를 명확히 표시한다", () => {
    const rows: unknown[][] = [
      ["거래일", "적요", "입금액", "출금액"],
      ["2026-01-01", "정상1", 100, ""],
      ["2026-01-02", "정상2", 200, ""],
      ["2026-01-03", "정상3", 300, ""],
      ...Array.from({ length: 97 }, (_, index) => [
        "2026-01-04",
        `오류${index + 1}`,
        "금액미정",
        "",
      ]),
    ];
    const result = analyzeAutomatically(
      createWorkbook([{ name: "거래내역", rows }]),
    );

    expect(result).not.toBeNull();
    expect(result?.detection.confidence).toBe("medium");
    expect(result?.summary.totalIncome).toBe(600);
    expect(result?.quality).toMatchObject({
      totalTransactionCount: 100,
      amountIncludedCount: 3,
      dateAnalysisIncludedCount: 3,
      invalidAmountCount: 97,
    });

    const issues = createPartialAnalysisIssues(
      result!.quality,
      amountIssueCounts(result!.parsed),
    );
    const markup = renderToStaticMarkup(
      createElement(AnalysisIssuePanel, { issues }),
    );

    expect(markup).toContain("금액을 확인할 수 없는 거래 97건");
    expect(markup).toContain("분석에서 제외");
  });

  it("유효 거래가 0건이면 자동 탐지와 0원 요약 대신 blocking으로 수렴한다", () => {
    const workbook = createWorkbook([
      {
        name: "거래내역",
        rows: [
          ["거래일", "적요", "입금액", "출금액"],
          ["날짜미정", "오류", "금액미정", ""],
        ],
      },
    ]);
    const preview = workbook.getPreview("거래내역", 0);
    const rows = workbook.getRows("거래내역", 0);
    const parsed = parseTransactions(
      standardizeTransactionRows(rows, mapColumns(preview.columns, rows)),
    );
    const issue = createBlockingAnalysisIssue("noValidTransactions");

    expect(detectTransactionSheet(workbook.getSheetCandidates())).toBeNull();
    expect(countValidManualTransactions(parsed.transactions)).toBe(0);
    expect(issue.severity).toBe("blocking");
    expect(issue.impact).not.toContain("0원");
  });

  it("수식은 저장된 결과값을 사용하고 수식처럼 보이는 문자열은 금액 오류로 둔다", () => {
    const source = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["거래일", "적요", "입금액", "출금액", "잔액"],
      ["2026-01-01", "수식 결과", 0, 0, 0],
      ["2026-01-02", "수식 문자열", 0, 0, 0],
    ]);
    worksheet.C2 = { t: "n", f: "400000+100000", v: 500_000 };
    worksheet.C3 = { t: "s", v: "=400000+100000" };
    XLSX.utils.book_append_sheet(source, worksheet, "거래내역");
    const workbook = createExcelWorkbook(source);
    const rows = workbook.getRows("거래내역", 0);
    const preview = workbook.getPreview("거래내역", 0);
    const parsed = parseTransactions(
      standardizeTransactionRows(rows, mapColumns(preview.columns, rows)),
    );

    expect(parsed.totalIncome).toBe(500_000);
    expect(parsed.invalidAmountCount).toBe(1);
  });

  it("같은 파일명·다른 구조에서도 설정만 공유되고 분석 결과와 수동 매핑은 섞이지 않는다", () => {
    const storage = new StressStorage();
    const scheduled = {
      id: "same-name",
      date: "2026-02-10",
      description: "확정 입금",
      type: "income" as const,
      amount: 50_000,
    };
    saveUserFileSession(
      "거래.xlsx",
      {
        selectedScenario: "optimistic",
        scheduledTransactions: [scheduled],
      },
      storage,
    );
    const first = analyzeAutomatically(
      createWorkbook([{ name: "거래내역", rows: rowsWithHeaderAt(1) }]),
    );
    const secondWorkbook = createWorkbook([
      {
        name: "다른구조",
        rows: [
          ["일자", "내용", "입금", "출금", "잔액"],
          ["2026-01-01", "B매출", 900_000, "", 900_000],
        ],
      },
    ]);
    const second = analyzeAutomatically(secondWorkbook);
    const restored = loadUserFileSession("거래.xlsx", storage).session;

    expect(first?.summary.totalIncome).toBe(500_000);
    expect(second?.summary.totalIncome).toBe(900_000);
    expect(second?.parsed.transactions.map((item) => item.description)).toEqual([
      "B매출",
    ]);
    expect(restored).toEqual({
      selectedScenario: "optimistic",
      scheduledTransactions: [scheduled],
    });
    expect(restored).not.toHaveProperty("manualMapping");
    expect(restored).not.toHaveProperty("transactions");
  });

  it("중복 컬럼은 수동 매핑으로 두 번째 컬럼을 명시해 안전하게 분석할 수 있다", () => {
    const workbook = createWorkbook([
      {
        name: "거래내역",
        rows: [
          ["거래일", "적요", "금액", "금액"],
          ["2026-01-01", "상품판매", "금액미정", 500_000],
        ],
      },
    ]);
    const preview = workbook.getPreview("거래내역", 0);
    const mapping: ManualTransactionMapping = {
      sheetName: "거래내역",
      headerRowIndex: 0,
      dateColumn: "거래일",
      descriptionColumn: "적요",
      amountMode: "signed",
      amountColumn: "금액_1",
    };
    const parsed = parseTransactions(
      standardizeTransactionRows(
        workbook.getRows("거래내역", 0),
        convertManualMappingToColumnMappings(mapping, preview.columns),
      ),
    );

    expect(parsed.totalIncome).toBe(500_000);
    expect(parsed.invalidAmountCount).toBe(0);
  });
});
