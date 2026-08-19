import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AnalysisReport from "./AnalysisReport";
import { createActionGuide } from "../services/actionGuide";
import type { CategorySummary } from "../services/categoryAggregator";
import {
  createScenarioForecastAnalyses,
  type ScenarioForecastAnalyses,
} from "../services/forecastEngine";
import type { ForecastScenario } from "../services/forecastScenario";
import type { RecurringTransaction } from "../services/recurringTransactionDetector";
import type { ScheduledTransaction } from "../services/scheduledTransaction";

function recurring(
  overrides: Partial<RecurringTransaction>,
): RecurringTransaction {
  return {
    description: "정기 거래",
    category: "other",
    categoryName: "기타",
    type: "expense",
    averageAmount: 0,
    monthlyAmounts: [],
    occurrenceCount: 3,
    activeMonthCount: 3,
    firstMonth: "2026-01",
    lastMonth: "2026-03",
    confidence: "high",
    ...overrides,
  };
}

function createAnalyses(
  scheduledTransactions: ScheduledTransaction[] = [],
): ScenarioForecastAnalyses {
  return createScenarioForecastAnalyses(
    [
      recurring({
        description: "상품판매",
        category: "revenue",
        categoryName: "매출",
        type: "income",
        averageAmount: 950000,
        monthlyAmounts: [
          { month: "2026-01", amount: 900000 },
          { month: "2026-02", amount: 950000 },
          { month: "2026-03", amount: 1000000 },
        ],
      }),
      recurring({ description: "월세", averageAmount: 700000 }),
      recurring({ description: "전기요금", averageAmount: 82333.33 }),
    ],
    -497000,
    scheduledTransactions,
  );
}

const categories: CategorySummary[] = [
  {
    category: "rent",
    categoryName: "임차료",
    amount: 2100000,
    transactionCount: 3,
    shareOfExpense: 48.3,
  },
  {
    category: "equipment",
    categoryName: "장비구매",
    amount: 2000000,
    transactionCount: 1,
    shareOfExpense: 46,
  },
  {
    category: "utilities",
    categoryName: "공과금",
    amount: 247000,
    transactionCount: 3,
    shareOfExpense: 5.7,
  },
];

function renderReport(
  analyses: ScenarioForecastAnalyses,
  scenario: ForecastScenario,
  scheduledTransactions: ScheduledTransaction[] = [],
  categorySummaries: CategorySummary[] = categories,
  invalidDateCount = 0,
): string {
  const analysis = analyses[scenario];
  const actionGuideItems = createActionGuide({
    forecasts: analysis.forecasts,
    cashRisk: analysis.cashRisk,
    categorySummaries,
    monthlyCategorySummaries: [],
    scheduledTransactions,
  });

  return renderToStaticMarkup(
    <AnalysisReport
      fileName="day8-test.xlsx"
      sheetName="거래내역"
      generatedAt={new Date(2026, 7, 8)}
      summary={{
        totalIncome: 2850000,
        totalExpense: 4347000,
        netCashFlow: -1497000,
        transactionCount: 10,
        validAmountTransactionCount: 10,
        averageTransactionAmount: 719700,
        largestIncome: 1000000,
        largestExpense: 2000000,
      }}
      latestBalance={-497000}
      dataQuality={{
        totalTransactionCount: 10,
        historicalTransactionCount: 10,
        amountIncludedCount: 10,
        dateAnalysisIncludedCount: 10 - invalidDateCount,
        validDateCount: 10 - invalidDateCount,
        invalidAmountCount: 0,
        invalidDateCount,
        directionIssueCount: 0,
        futureDatedTransactionCount: 0,
        futureDatedIncome: 0,
        futureDatedExpense: 0,
      }}
      monthlySummaries={[
        {
          month: "2026-01",
          income: 900000,
          expense: 780000,
          netCashFlow: 120000,
          transactionCount: 3,
        },
        {
          month: "2026-02",
          income: 950000,
          expense: 782000,
          netCashFlow: 168000,
          transactionCount: 3,
        },
        {
          month: "2026-03",
          income: 1000000,
          expense: 2785000,
          netCashFlow: -1785000,
          transactionCount: 4,
        },
      ]}
      analysis={analysis}
      selectedScenario={scenario}
      actionGuideItems={actionGuideItems}
      categorySummaries={categorySummaries}
    />,
  );
}

describe("AnalysisReport", () => {
  it("파일·시트·생성일과 Day 8 핵심 재무·품질·월별 결과를 표시한다", () => {
    const markup = renderReport(createAnalyses(), "base");

    expect(markup).toContain("print-only analysis-report");
    expect(markup).toContain("현금흐름 분석 리포트");
    expect(markup).toContain("day8-test.xlsx");
    expect(markup).toContain("거래내역");
    expect(markup).toContain("2026년 8월 8일");
    expect(markup).toContain("2,850,000원");
    expect(markup).toContain("4,347,000원");
    expect(markup).toContain("-1,497,000원");
    expect(markup).toContain("-497,000원");
    expect(markup).toContain("날짜 기반 분석 포함");
    expect(markup).toContain("2026년 1월");
    expect(markup).toContain("+120,000원");
  });

  it.each([
    ["base", "기준"],
    ["conservative", "보수"],
    ["optimistic", "낙관"],
  ] as const)("%s 시나리오의 Forecast·위험·Action을 연결한다", (scenario, label) => {
    const analyses = createAnalyses();
    const analysis = analyses[scenario];
    const markup = renderReport(analyses, scenario);
    const endingBalance = Math.round(
      analysis.forecasts.at(-1)?.expectedEndingBalance ?? 0,
    ).toLocaleString("ko-KR");
    const requiredBuffer = Math.round(
      analysis.cashRisk?.requiredCashBuffer ?? 0,
    ).toLocaleString("ko-KR");

    expect(markup).toContain(`예상 범위: ${label}`);
    expect(markup).toContain(`${endingBalance}원`);
    expect(markup).toContain(`${requiredBuffer}원`);
    expect(markup).toContain("단기 자금 확보 필요");
  });

  it("Day 8 기준 Forecast 요약과 현금 위험 값을 화면과 동일하게 표시한다", () => {
    const markup = renderReport(createAnalyses(), "base");

    expect(markup).toContain("-229,333원");
    expect(markup).toContain("88,333원");
    expect(markup).toContain("456,000원");
    expect(markup).toContain("+953,000원");
    expect(markup).toContain("1개월");
    expect(markup).toContain("2026년 5월");
    expect(markup).toContain("필요한 현금 여유(버퍼)");
    expect(markup).toContain("기반으로 한 추정치입니다");
    expect(markup).toContain("미래 결과를 보장하지 않습니다");
  });

  it("예정 입금 500,000원 반영 결과와 Action을 그대로 표시한다", () => {
    const scheduledTransactions: ScheduledTransaction[] = [
      {
        id: "confirmed-income",
        date: "2026-05-10",
        description: "거래처 입금",
        type: "income",
        amount: 500000,
      },
    ];
    const analyses = createAnalyses(scheduledTransactions);
    const markup = renderReport(
      analyses,
      "base",
      scheduledTransactions,
    );

    expect(markup).toContain("588,333원");
    expect(markup).toContain("956,000원");
    expect(markup).toContain("+1,453,000원");
    expect(markup).toContain("예정 입금 일정 확인");
    expect(markup).toContain("2026년 5월 10일");
  });

  it("주요 지출은 금액순 최대 5개만 표시한다", () => {
    const sixCategories = Array.from({ length: 6 }, (_, index) => ({
      category: `category-${index + 1}`,
      categoryName: `카테고리 ${index + 1}`,
      amount: 600 - index * 100,
      transactionCount: 1,
      shareOfExpense: 20 - index,
    }));
    const markup = renderReport(
      createAnalyses(),
      "base",
      [],
      sixCategories,
    );

    expect(markup).toContain("카테고리 5");
    expect(markup).not.toContain("카테고리 6");
  });

  it("오류 거래가 있으면 품질 주의를 표시하고 Forecast 원본을 변경하지 않는다", () => {
    const analyses = createAnalyses();
    const originalForecasts = structuredClone(analyses.base.forecasts);
    const markup = renderReport(analyses, "base", [], categories, 2);

    expect(markup).toContain("날짜 오류");
    expect(markup).toContain("일부 거래가 날짜 또는 금액 기반 분석에서 제외");
    expect(analyses.base.forecasts).toEqual(originalForecasts);
  });

  it("사용자 파일명과 시트명을 HTML이 아닌 안전한 텍스트로 렌더링한다", () => {
    const analyses = createAnalyses();
    const analysis = analyses.base;
    const markup = renderToStaticMarkup(
      <AnalysisReport
        fileName={'<img src=x onerror="alert(1)">.xlsx'}
        sheetName={'<script>alert("sheet")</script>'}
        generatedAt={new Date(2026, 7, 8)}
        summary={{
          totalIncome: 0,
          totalExpense: 0,
          netCashFlow: 0,
          transactionCount: 0,
          validAmountTransactionCount: 0,
          averageTransactionAmount: 0,
          largestIncome: 0,
          largestExpense: 0,
        }}
        latestBalance={null}
        dataQuality={{
          totalTransactionCount: 0,
          historicalTransactionCount: 0,
          amountIncludedCount: 0,
          dateAnalysisIncludedCount: 0,
          validDateCount: 0,
          invalidAmountCount: 0,
          invalidDateCount: 0,
          directionIssueCount: 0,
          futureDatedTransactionCount: 0,
          futureDatedIncome: 0,
          futureDatedExpense: 0,
        }}
        monthlySummaries={[]}
        analysis={analysis}
        selectedScenario="base"
        actionGuideItems={[]}
        categorySummaries={[]}
      />,
    );

    expect(markup).toContain(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;.xlsx',
    );
    expect(markup).toContain(
      '&lt;script&gt;alert(&quot;sheet&quot;)&lt;/script&gt;',
    );
    expect(markup).not.toContain("<img src=x");
    expect(markup).not.toContain("<script>alert");
  });
});
