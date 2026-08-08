import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

import {
  DataQualitySummary,
  InvalidAmountWarning,
  InvalidDateWarning,
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

  it("날짜 오류 건수와 분석 제외 안내를 표시한다", () => {
    const markup = renderToStaticMarkup(
      <InvalidDateWarning count={2} />,
    );

    expect(markup).toContain("날짜를 해석하지 못한 거래 2건");
    expect(markup).toContain("전체 입출금과 전체 거래 건수");
    expect(markup).toContain("월별·반복거래·최근 잔액·Forecast");
    expect(markup).toContain("전체 합계와 날짜 기반 합계가 다를 수");
    expect(markup).toContain("‘날짜 확인 필요’ 거래를 확인");
    expect(markup).toContain("원본 Excel의 거래일을 수정");
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

  it("계산 제외 금액 오류와 컬럼 충돌을 분리해 안내한다", () => {
    const markup = renderToStaticMarkup(
      <InvalidAmountWarning
        invalidAmountCount={1}
        unknownDirectionCount={2}
        directionConflictCount={3}
        directionOverrideCount={5}
        columnConflictCount={4}
      />,
    );

    expect(markup).toContain("금액 계산에서 제외된 거래 6건");
    expect(markup).toContain("금액 오류 1건");
    expect(markup).toContain("방향 미확정 2건");
    expect(markup).toContain("방향 충돌 3건");
    expect(markup).toContain("다른 거래 4건");
    expect(markup).toContain("분리 입금·출금 컬럼 값을 우선");
    expect(markup).toContain("입출금 구분이 다른 거래 5건");
    expect(markup).toContain("명시된 입출금 구분을 우선");
    expect(markup).toContain("‘확인 필요’ 표시와 원본 값을 보고");
    expect(markup).toContain("금액 또는 입출금 구분을 수정");
  });

  it("금액 경고가 없으면 안내를 표시하지 않는다", () => {
    expect(
      renderToStaticMarkup(
        <InvalidAmountWarning
          invalidAmountCount={0}
          unknownDirectionCount={0}
          directionConflictCount={0}
          directionOverrideCount={0}
          columnConflictCount={0}
        />,
      ),
    ).toBe("");
  });

  it("날짜 오류가 없으면 안내를 표시하지 않는다", () => {
    expect(
      renderToStaticMarkup(<InvalidDateWarning count={0} />),
    ).toBe("");
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
  });
});
