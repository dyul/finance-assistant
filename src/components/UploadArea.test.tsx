import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

import {
  DataQualitySummary,
  ReportPrintButton,
  TransactionAmountCells,
  TransactionDateValue,
} from "./UploadArea";
import { printAnalysisReport } from "../services/reportPresentation";
import {
  createForecastAnalysis,
  createScenarioForecastAnalyses,
  getLatestBalance,
} from "../services/forecastEngine";
import { mapColumns } from "../services/columnMapper";
import { detectRecurringTransactions } from "../services/recurringTransactionDetector";
import { parseTransactions } from "../services/transactionParser";
import { standardizeTransactionRows } from "../services/transactionRowStandardizer";
import { analyzeDataQuality } from "../services/dataQualityAnalyzer";
import { createPartialAnalysisIssues } from "../services/analysisIssuePresentation";

describe("UploadArea 날짜 오류 안내", () => {
  it("분석 결과 유무에 따라 리포트 버튼을 표시한다", () => {
    expect(
      renderToStaticMarkup(<ReportPrintButton visible={false} />),
    ).toBe("");
    expect(
      renderToStaticMarkup(<ReportPrintButton visible />),
    ).toContain("리포트 인쇄 / PDF 저장");
  });

  it("리포트 인쇄 시 window.print를 호출한다", () => {
    const print = vi.fn();
    vi.stubGlobal("window", { print });

    printAnalysisReport();

    expect(print).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("전체·금액·날짜 분석 범위를 데이터 품질 요약에 표시한다", () => {
    const markup = renderToStaticMarkup(
      <DataQualitySummary
        summary={{
          totalTransactionCount: 100,
          amountIncludedCount: 98,
          dateAnalysisIncludedCount: 96,
          validDateCount: 98,
          invalidAmountCount: 2,
          invalidDateCount: 2,
          directionIssueCount: 1,
        }}
      />,
    );

    expect(markup).toContain("분석에 사용된 거래 확인");
    expect(markup).toContain("전체 거래");
    expect(markup).toContain("100건");
    expect(markup).toContain("금액 계산 포함");
    expect(markup).toContain("98건");
    expect(markup).toContain("날짜 기반 분석 포함");
    expect(markup).toContain("96건");
    expect(markup).toContain("금액 확인 필요");
    expect(markup).toContain("날짜 확인 필요");
    expect(markup).toContain("입출금 구분 확인 필요");
  });

  it("null 날짜를 날짜 확인 필요로 표시한다", () => {
    expect(
      renderToStaticMarkup(<TransactionDateValue date={null} />),
    ).toContain("날짜 확인 필요");
    expect(
      renderToStaticMarkup(
        <TransactionDateValue date="2024-01-02" />,
      ),
    ).toBe("2024-01-02");
  });

  it("금액 오류 거래에 확인 문구와 원본값을 표시한다", () => {
    const markup = renderToStaticMarkup(
      <TransactionAmountCells
        income={null}
        expense={null}
        amountStatus="unknownDirection"
        originalAmountValues={{
          income: null,
          expense: null,
          amount: "1,000",
          direction: "미확인",
        }}
      />,
    );

    expect(markup).toContain("입출금 구분 확인 필요");
    expect(markup).toContain("금액 1,000");
    expect(markup).toContain("구분 미확인");
    expect(markup).toContain('colSpan="2"');
  });

  it("정상 거래는 기존 입금·출금 두 칸으로 표시한다", () => {
    const markup = renderToStaticMarkup(
      <TransactionAmountCells
        income={1000}
        expense={0}
        amountStatus="valid"
        originalAmountValues={{
          income: "1000",
          expense: "0",
          amount: null,
          direction: null,
        }}
      />,
    );

    expect(markup).toContain("1,000원");
    expect(markup).not.toContain("확인 필요");
    expect(markup.match(/<td/g)).toHaveLength(2);
  });

  it("유효한 날짜 거래가 없으면 예측 상태를 비운다", () => {
    expect(createForecastAnalysis([], null)).toEqual({
      forecasts: [],
      cashRisk: null,
    });
  });

  it("Excel 업로드 행부터 반복 수입 추세 Forecast까지 연결한다", () => {
    const workbook = XLSX.utils.book_new();
    const rows: unknown[][] = [
      ["거래일", "적요", "입금액", "출금액", "잔액"],
    ];
    const incomes = [900_000, 950_000, 1_000_000];
    const electricityExpenses = [80_000, 82_000, 85_000];

    for (let index = 0; index < 3; index += 1) {
      const month = index + 1;

      rows.push([
        new Date(2026, index, 5),
        "상품판매",
        incomes[index],
        0,
        0,
      ]);
      rows.push([
        new Date(2026, index, 10),
        "월세",
        0,
        700_000,
        0,
      ]);

      if (index === 2) {
        rows.push([
          new Date(2026, index, 15),
          "장비구매",
          0,
          2_000_000,
          0,
        ]);
      }

      rows.push([
        new Date(2026, index, 20),
        "전기요금",
        0,
        electricityExpenses[index],
        month === 3 ? -497_000 : 0,
      ]);
    }

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(rows),
      "거래내역",
    );
    const workbookData = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });
    const uploadedWorkbook = XLSX.read(workbookData, { type: "array" });
    const sheet = uploadedWorkbook.Sheets[uploadedWorkbook.SheetNames[0]];
    const objectRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      sheet,
      { defval: "" },
    );
    const mappings = mapColumns(Object.keys(objectRows[0]));
    const standardizedRows = standardizeTransactionRows(
      objectRows,
      mappings,
    );
    const parsed = parseTransactions(standardizedRows);
    const recurringTransactions = detectRecurringTransactions(
      parsed.transactions,
    );
    const incomeTransaction = recurringTransactions.find(
      (transaction) => transaction.description === "상품판매",
    );
    const analysis = createForecastAnalysis(
      recurringTransactions,
      getLatestBalance(parsed.transactions),
    );
    const scenarioAnalyses = createScenarioForecastAnalyses(
      recurringTransactions,
      getLatestBalance(parsed.transactions),
    );

    expect(parsed.invalidDateCount).toBe(0);
    expect(parsed.totalIncome).toBe(2_850_000);
    expect(parsed.totalExpense).toBe(4_347_000);
    expect(parsed.totalIncome - parsed.totalExpense).toBe(-1_497_000);
    expect(
      recurringTransactions.map((transaction) => transaction.description),
    ).toEqual(expect.arrayContaining(["월세", "전기요금", "상품판매"]));
    expect(recurringTransactions).toHaveLength(3);
    expect(incomeTransaction?.monthlyAmounts).toEqual([
      { month: "2026-01", amount: 900_000 },
      { month: "2026-02", amount: 950_000 },
      { month: "2026-03", amount: 1_000_000 },
    ]);
    expect(analysis.forecasts.map((forecast) => forecast.recurringIncome)).toEqual([
      1_050_000,
      1_100_000,
      1_150_000,
    ]);
    expect(analysis.forecasts[0]?.expectedEndingBalance).toBeCloseTo(
      -229_333.33,
      2,
    );
    expect(analysis.forecasts[1]?.expectedEndingBalance).toBeCloseTo(
      88_333.33,
      2,
    );
    expect(analysis.forecasts[2]?.expectedEndingBalance).toBeCloseTo(
      456_000,
      2,
    );
    expect(
      scenarioAnalyses.conservative.forecasts[0]?.recurringIncome,
    ).toBeLessThan(analysis.forecasts[0]?.recurringIncome ?? 0);
    expect(
      scenarioAnalyses.optimistic.forecasts[0]?.recurringIncome,
    ).toBeGreaterThan(analysis.forecasts[0]?.recurringIncome ?? 0);
    expect(scenarioAnalyses.base.forecasts).toEqual(analysis.forecasts);
    expect(
      createPartialAnalysisIssues(analyzeDataQuality(parsed.transactions), {
        invalidAmountCount: parsed.invalidAmountCount,
        unknownDirectionCount: parsed.unknownDirectionCount,
        directionConflictCount: parsed.directionConflictCount,
        directionOverrideCount: parsed.directionOverrideCount,
        columnConflictCount: parsed.columnConflictCount,
      }),
    ).toEqual([]);
  });

  it("Excel 오류 행을 parser 품질 건수에서 partial issue까지 그대로 연결한다", () => {
    const rows = [
      {
        거래일: "2026-01-01",
        적요: "정상 매출",
        거래구분: "입금",
        금액: "100000",
        잔액: "100000",
      },
      {
        거래일: "날짜미정",
        적요: "날짜 오류 지출",
        거래구분: "출금",
        금액: "20000",
        잔액: "80000",
      },
      {
        거래일: "2026-01-03",
        적요: "금액 오류",
        거래구분: "입금",
        금액: "금액미정",
        잔액: "80000",
      },
      {
        거래일: "2026-01-04",
        적요: "방향 오류",
        거래구분: "미정",
        금액: "30000",
        잔액: "80000",
      },
    ];
    const mappings = mapColumns(Object.keys(rows[0]), rows);
    const parsed = parseTransactions(
      standardizeTransactionRows(rows, mappings),
    );
    const quality = analyzeDataQuality(parsed.transactions);
    const issues = createPartialAnalysisIssues(quality, {
      invalidAmountCount: parsed.invalidAmountCount,
      unknownDirectionCount: parsed.unknownDirectionCount,
      directionConflictCount: parsed.directionConflictCount,
      directionOverrideCount: parsed.directionOverrideCount,
      columnConflictCount: parsed.columnConflictCount,
    });

    expect(quality).toMatchObject({
      totalTransactionCount: 4,
      amountIncludedCount: 2,
      dateAnalysisIncludedCount: 1,
      invalidAmountCount: 1,
      invalidDateCount: 1,
      directionIssueCount: 1,
    });
    expect(issues.map((issue) => issue.id)).toEqual([
      "invalidAmount",
      "unknownDirection",
      "invalidDate",
    ]);
  });
});
