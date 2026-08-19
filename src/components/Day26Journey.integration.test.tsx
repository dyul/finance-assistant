/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

import AnalysisIssuePanel from "./AnalysisIssuePanel";
import AnalysisReport from "./AnalysisReport";
import ForecastSection from "./ForecastSection";
import OnboardingSection, { SAMPLE_EXCEL_PATH } from "./OnboardingSection";
import {
  DataQualitySummary,
  ReportPrintButton,
} from "./UploadArea";
import { TransactionDateValue } from "./TransactionClassificationTable";
import { createActionGuide } from "../services/actionGuide";
import {
  createBlockingAnalysisIssue,
  createPartialAnalysisIssues,
} from "../services/analysisIssuePresentation";
import { aggregateExpensesByCategory } from "../services/categoryAggregator";
import { mapColumns } from "../services/columnMapper";
import { analyzeDataQuality } from "../services/dataQualityAnalyzer";
import {
  createExcelWorkbook,
  type ExcelWorkbook,
} from "../services/excelWorkbook";
import { loadExcelWorkbook } from "../services/excelWorkbookLoader";
import { calculateFinancialSummary } from "../services/financialEngine";
import {
  createScenarioForecastAnalyses,
  getLatestBalance,
} from "../services/forecastEngine";
import { createForecastSummary } from "../services/forecastPresentation";
import {
  countValidManualTransactions,
  convertManualMappingToColumnMappings,
  validateManualMapping,
  type ManualTransactionMapping,
} from "../services/manualMapping";
import { aggregateMonthly } from "../services/monthlyAggregator";
import { aggregateMonthlyExpensesByCategory } from "../services/monthlyCategoryAggregator";
import { detectRecurringTransactions } from "../services/recurringTransactionDetector";
import { parseTransactions } from "../services/transactionParser";
import { standardizeTransactionRows } from "../services/transactionRowStandardizer";
import { detectTransactionSheet } from "../services/transactionSheetDetector";
import {
  loadUserFileSession,
  saveUserFileSession,
  type StorageAdapter,
} from "../services/userSessionStorage";
import type { ScheduledTransaction } from "../services/scheduledTransaction";

class JourneyStorage implements StorageAdapter {
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

function workbookFromRows(rows: unknown[][], sheetName: string): ExcelWorkbook {
  const source = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    source,
    XLSX.utils.aoa_to_sheet(rows),
    sheetName,
  );
  return createExcelWorkbook(source);
}

function analyzeAutomatically(workbook: ExcelWorkbook) {
  const detection = detectTransactionSheet(workbook.getSheetCandidates(), {
    date1904: workbook.date1904,
  });

  if (!detection) {
    throw new Error("automatic-detection-required");
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
  const summary = calculateFinancialSummary(parsed.transactions);
  const monthlySummaries = aggregateMonthly(parsed.transactions);
  const categorySummaries = aggregateExpensesByCategory(parsed.transactions);
  const monthlyCategorySummaries = aggregateMonthlyExpensesByCategory(
    parsed.transactions,
  );
  const recurringTransactions = detectRecurringTransactions(
    parsed.transactions,
  );

  return {
    detection,
    parsed,
    summary,
    monthlySummaries,
    categorySummaries,
    monthlyCategorySummaries,
    recurringTransactions,
    latestBalance: getLatestBalance(parsed.transactions),
    dataQuality: analyzeDataQuality(parsed.transactions),
  };
}

async function loadSampleJourney() {
  const sampleBytes = readFileSync(
    resolve("public", "samples", "finance-assistant-sample.xlsx"),
  );
  const workbook = await loadExcelWorkbook(
    Uint8Array.from(sampleBytes).buffer,
  );

  return analyzeAutomatically(workbook);
}

function amountIssueCounts(
  parsed: ReturnType<typeof parseTransactions>,
) {
  return {
    invalidAmountCount: parsed.invalidAmountCount,
    unknownDirectionCount: parsed.unknownDirectionCount,
    directionConflictCount: parsed.directionConflictCount,
    directionOverrideCount: parsed.directionOverrideCount,
    columnConflictCount: parsed.columnConflictCount,
  };
}

describe("Day 26 실제 사용자 Journey 통합", () => {
  it("Journey A: 온보딩부터 샘플 자동 분석·시나리오·위험·액션·리포트까지 연결한다", async () => {
    const onboarding = renderToStaticMarkup(<OnboardingSection visible />);
    const result = await loadSampleJourney();
    const analyses = createScenarioForecastAnalyses(
      result.recurringTransactions,
      result.latestBalance,
    );

    expect(onboarding).toContain("처음 사용하시나요?");
    expect(onboarding).toContain(`href="${SAMPLE_EXCEL_PATH}"`);
    expect(renderToStaticMarkup(<ReportPrintButton visible />)).toContain(
      "리포트 인쇄 / PDF 저장",
    );
    expect(result.detection.sheetName).toBe("거래내역");
    expect(result.summary).toMatchObject({
      totalIncome: 2_850_000,
      totalExpense: 4_347_000,
      netCashFlow: -1_497_000,
    });

    for (const scenario of [
      "conservative",
      "base",
      "optimistic",
    ] as const) {
      const analysis = analyses[scenario];
      const actions = createActionGuide({
        forecasts: analysis.forecasts,
        cashRisk: analysis.cashRisk,
        categorySummaries: result.categorySummaries,
        monthlyCategorySummaries: result.monthlyCategorySummaries,
        scheduledTransactions: [],
      });
      const forecastMarkup = renderToStaticMarkup(
        <ForecastSection
          analysis={analysis}
          summary={createForecastSummary(
            analysis.forecasts,
            analysis.cashRisk,
          )}
          selectedScenario={scenario}
          onScenarioChange={vi.fn()}
          actionGuideItems={actions}
        />,
      );

      expect(forecastMarkup).toContain('aria-selected="true"');
      expect(forecastMarkup).toContain("자금 부족 가능성");
      expect(forecastMarkup).toContain("3. 필요한 행동");
      expect(analysis.forecasts).toHaveLength(3);
      expect(analysis.cashRisk).not.toBeNull();
    }

    expect(analyses.base.forecasts.at(-1)?.expectedEndingBalance).toBeCloseTo(
      456_000,
      2,
    );
  });

  it("Journey B: 예정입금 추가·삭제·시나리오 저장 복원과 리포트 결과가 같은 상태를 사용한다", async () => {
    const result = await loadSampleJourney();
    const original = createScenarioForecastAnalyses(
      result.recurringTransactions,
      result.latestBalance,
    );
    const scheduledIncome: ScheduledTransaction = {
      id: "journey-income",
      date: "2026-04-10",
      description: "확정 매출 입금",
      type: "income",
      amount: 500_000,
    };
    const withScheduled = createScenarioForecastAnalyses(
      result.recurringTransactions,
      result.latestBalance,
      [scheduledIncome],
    );
    const restoredAfterDelete = createScenarioForecastAnalyses(
      result.recurringTransactions,
      result.latestBalance,
      [],
    );
    const storage = new JourneyStorage();
    const originalActions = createActionGuide({
      forecasts: original.base.forecasts,
      cashRisk: original.base.cashRisk,
      categorySummaries: result.categorySummaries,
      monthlyCategorySummaries: result.monthlyCategorySummaries,
      scheduledTransactions: [],
    });
    const scheduledActions = createActionGuide({
      forecasts: withScheduled.base.forecasts,
      cashRisk: withScheduled.base.cashRisk,
      categorySummaries: result.categorySummaries,
      monthlyCategorySummaries: result.monthlyCategorySummaries,
      scheduledTransactions: [scheduledIncome],
    });

    expect(
      withScheduled.base.forecasts.at(-1)?.expectedEndingBalance,
    ).toBeCloseTo(
      (original.base.forecasts.at(-1)?.expectedEndingBalance ?? 0) + 500_000,
      2,
    );
    expect(withScheduled.base.cashRisk?.level).not.toBe(
      original.base.cashRisk?.level,
    );
    expect(scheduledActions).not.toEqual(originalActions);
    expect(restoredAfterDelete.base).toEqual(original.base);

    saveUserFileSession(
      "sample.xlsx",
      {
        selectedScenario: "optimistic",
        scheduledTransactions: [scheduledIncome],
      },
      storage,
    );
    expect(loadUserFileSession("sample.xlsx", storage).session).toEqual({
      selectedScenario: "optimistic",
      scheduledTransactions: [scheduledIncome],
    });

    const selectedAnalysis = withScheduled.optimistic;
    const actionGuide = createActionGuide({
      forecasts: selectedAnalysis.forecasts,
      cashRisk: selectedAnalysis.cashRisk,
      categorySummaries: result.categorySummaries,
      monthlyCategorySummaries: result.monthlyCategorySummaries,
      scheduledTransactions: [scheduledIncome],
    });
    const report = renderToStaticMarkup(
      <AnalysisReport
        fileName="sample.xlsx"
        sheetName={result.detection.sheetName}
        generatedAt={new Date(2026, 7, 10)}
        summary={result.summary}
        latestBalance={result.latestBalance}
        dataQuality={result.dataQuality}
        monthlySummaries={result.monthlySummaries}
        analysis={selectedAnalysis}
        selectedScenario="optimistic"
        actionGuideItems={actionGuide}
        categorySummaries={result.categorySummaries}
      />,
    );
    const endingBalance = Math.round(
      selectedAnalysis.forecasts.at(-1)?.expectedEndingBalance ?? 0,
    ).toLocaleString("ko-KR");
    const mainForecast = renderToStaticMarkup(
      <ForecastSection
        analysis={selectedAnalysis}
        summary={createForecastSummary(
          selectedAnalysis.forecasts,
          selectedAnalysis.cashRisk,
        )}
        selectedScenario="optimistic"
        onScenarioChange={vi.fn()}
        actionGuideItems={actionGuide}
      />,
    );

    expect(report).toContain("예상 범위: 낙관");
    expect(report).toContain(`${endingBalance}원`);
    expect(mainForecast).toContain(`${endingBalance}원`);
    expect(report).toContain("500,000원");
    expect(report).toContain(
      Math.round(
        selectedAnalysis.cashRisk?.requiredCashBuffer ?? 0,
      ).toLocaleString("ko-KR"),
    );
  });

  it("Journey C: 날짜 오류 거래는 전체 금액과 날짜 기반 분석 범위를 분리하고 복구 CTA를 제공한다", () => {
    const workbook = workbookFromRows(
      [
        ["거래일", "적요", "입금액", "출금액", "잔액"],
        ["2026-01-01", "정상 매출", 100_000, 0, 100_000],
        ["날짜미정", "날짜 오류 지출", 0, 20_000, 80_000],
      ],
      "거래내역",
    );
    const result = analyzeAutomatically(workbook);
    const issues = createPartialAnalysisIssues(
      result.dataQuality,
      amountIssueCounts(result.parsed),
    );
    const issueMarkup = renderToStaticMarkup(
      <AnalysisIssuePanel issues={issues} />,
    );
    const qualityMarkup = renderToStaticMarkup(
      <DataQualitySummary summary={result.dataQuality} />,
    );

    expect(result.summary.totalExpense).toBe(20_000);
    expect(result.dataQuality).toMatchObject({
      totalTransactionCount: 2,
      amountIncludedCount: 2,
      dateAnalysisIncludedCount: 1,
      invalidDateCount: 1,
    });
    expect(issueMarkup).toContain("문제");
    expect(issueMarkup).toContain("분석 영향");
    expect(issueMarkup).toContain("해결 방법");
    expect(issueMarkup).toContain('href="#transaction-classification"');
    expect(qualityMarkup).toContain("날짜 기반 분석 포함");
    expect(
      renderToStaticMarkup(<TransactionDateValue date={null} />),
    ).toContain("날짜 확인 필요");
  });

  it("Journey D: 자동 탐지 실패 후 수동 시트·컬럼 설정으로 Forecast 파이프라인에 복귀한다", () => {
    const workbook = workbookFromRows(
      [
        ["일자값", "내용값", "받은돈", "나간돈", "잔액값"],
        ["2026-01-05", "상품판매", 900_000, "", 200_000],
        ["2026-01-10", "월세", "", 700_000, -500_000],
        ["2026-02-05", "상품판매", 950_000, "", 450_000],
        ["2026-02-10", "월세", "", 700_000, -250_000],
        ["2026-03-05", "상품판매", 1_000_000, "", 750_000],
        ["2026-03-10", "월세", "", 700_000, 50_000],
      ],
      "사업데이터",
    );
    const detection = detectTransactionSheet(workbook.getSheetCandidates());
    const blocking = createBlockingAnalysisIssue(
      "transactionSheetNotFound",
    );
    const mapping: ManualTransactionMapping = {
      sheetName: "사업데이터",
      headerRowIndex: 0,
      dateColumn: "일자값",
      descriptionColumn: "내용값",
      balanceColumn: "잔액값",
      amountMode: "split",
      incomeColumn: "받은돈",
      expenseColumn: "나간돈",
    };
    const preview = workbook.getPreview("사업데이터", 0);

    expect(detection).toBeNull();
    expect(blocking.severity).toBe("blocking");
    expect(
      validateManualMapping(mapping, {
        sheetNames: workbook.sheetNames,
        columns: preview.columns,
        headerRowLimit: preview.headerRowLimit,
      }),
    ).toEqual([]);

    const parsed = parseTransactions(
      standardizeTransactionRows(
        workbook.getRows("사업데이터", 0),
        convertManualMappingToColumnMappings(mapping, preview.columns),
      ),
    );
    const summary = calculateFinancialSummary(parsed.transactions);
    const recurring = detectRecurringTransactions(parsed.transactions);
    const analysis = createScenarioForecastAnalyses(
      recurring,
      getLatestBalance(parsed.transactions),
    );

    expect(countValidManualTransactions(parsed.transactions)).toBe(6);
    expect(summary).toMatchObject({
      totalIncome: 2_850_000,
      totalExpense: 2_100_000,
    });
    expect(analysis.base.forecasts).toHaveLength(3);
    expect(analysis.base.cashRisk).not.toBeNull();
  });

  it("Journey E: 읽을 수 있는 Excel에 유효 거래가 없으면 파일 읽기 실패가 아닌 분석 불가로 구분한다", () => {
    const workbook = workbookFromRows(
      [
        ["거래일", "적요", "입금액", "출금액"],
        ["날짜미정", "확인 필요", "금액미정", ""],
      ],
      "거래내역",
    );
    const preview = workbook.getPreview("거래내역", 0);
    const rows = workbook.getRows("거래내역", 0);
    const parsed = parseTransactions(
      standardizeTransactionRows(rows, mapColumns(preview.columns, rows)),
    );
    const issue = createBlockingAnalysisIssue("noValidTransactions");
    const markup = renderToStaticMarkup(
      <AnalysisIssuePanel issues={[issue]} />,
    );

    expect(workbook.sheetNames).toEqual(["거래내역"]);
    expect(countValidManualTransactions(parsed.transactions)).toBe(0);
    expect(issue.id).toBe("noValidTransactions");
    expect(markup).toContain("분석할 수 있는 거래를 찾지 못했습니다");
    expect(markup).toContain("재무 요약과 향후 전망을 계산하지 않았습니다");
    expect(markup).not.toContain("Excel 파일을 읽을 수 없습니다");
    expect(markup).not.toContain("0원");
  });

  it("파일 A 다음 파일 B를 분석해도 현재 분석과 파일별 저장 설정이 섞이지 않는다", async () => {
    const fileA = await loadSampleJourney();
    const fileBWorkbook = workbookFromRows(
      [
        ["거래일", "적요", "입금액", "출금액", "잔액"],
        ["2026-01-01", "B매출", 200_000, 0, 200_000],
        ["2026-01-02", "B임차료", 0, 100_000, 100_000],
        ["2026-02-01", "B매출", 200_000, 0, 300_000],
        ["2026-02-02", "B임차료", 0, 100_000, 200_000],
      ],
      "B거래",
    );
    const fileB = analyzeAutomatically(fileBWorkbook);
    const storage = new JourneyStorage();

    saveUserFileSession(
      "A.xlsx",
      { selectedScenario: "optimistic", scheduledTransactions: [] },
      storage,
    );

    expect(fileA.summary.totalIncome).toBe(2_850_000);
    expect(fileB.summary).toMatchObject({
      totalIncome: 400_000,
      totalExpense: 200_000,
      transactionCount: 4,
    });
    expect(fileB.detection.sheetName).toBe("B거래");
    expect(fileB.recurringTransactions.map((item) => item.description)).toEqual(
      expect.arrayContaining(["B매출", "B임차료"]),
    );
    expect(
      createPartialAnalysisIssues(
        fileB.dataQuality,
        amountIssueCounts(fileB.parsed),
      ),
    ).toEqual([]);
    expect(loadUserFileSession("B.xlsx", storage).session).toEqual({
      selectedScenario: "base",
      scheduledTransactions: [],
    });
    expect(loadUserFileSession("A.xlsx", storage).session.selectedScenario).toBe(
      "optimistic",
    );
  });
});
