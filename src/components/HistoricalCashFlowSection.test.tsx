import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
  HistoricalPeriodAggregation,
  HistoricalPeriodSummary,
  HistoricalPeriodUnit,
} from "../services/historicalPeriodAggregator";
import { HistoricalCashFlowSectionView } from "./HistoricalCashFlowSection";
import { getVisibleHistoricalPeriods } from "./historicalPeriodPresentation";

function createSummary(
  periodKey: string,
  label = periodKey,
): HistoricalPeriodSummary {
  const year = periodKey.slice(0, 4);
  return {
    periodKey,
    label,
    startDate: `${year}-01-01` as HistoricalPeriodSummary["startDate"],
    endDate: `${year}-12-31` as HistoricalPeriodSummary["endDate"],
    transactionCount: 2,
    income: 1_000_000,
    expense: 400_000,
    netCashFlow: 600_000,
    closingBalance: null,
    topExpense: {
      category: "housing",
      categoryName: "주거비",
      amount: 300_000,
      shareOfPeriodExpense: 75,
    },
  };
}

function createAggregation(
  values: Partial<HistoricalPeriodAggregation> = {},
): HistoricalPeriodAggregation {
  return {
    monthly: [],
    quarterly: [],
    yearly: [],
    excludedInvalidDateCount: 0,
    excludedInvalidDateIncome: 0,
    excludedInvalidDateExpense: 0,
    ...values,
  };
}

function renderView(
  aggregation: HistoricalPeriodAggregation,
  unit: HistoricalPeriodUnit = "monthly",
  expanded = false,
) {
  return renderToStaticMarkup(
    <HistoricalCashFlowSectionView
      aggregation={aggregation}
      referenceDate="2026-08-21"
      unit={unit}
      expanded={expanded}
      onUnitChange={vi.fn()}
      onExpandedChange={vi.fn()}
    />,
  );
}

describe("HistoricalCashFlowSection", () => {
  it("월 36개 중 최신 12개, 분기 16개 중 최신 12개, 연도 5개 전체를 원본 mutation 없이 선택한다", () => {
    const monthly = Array.from({ length: 36 }, (_, index) =>
      createSummary(`month-${String(index + 1).padStart(2, "0")}`),
    );
    const quarterly = Array.from({ length: 16 }, (_, index) =>
      createSummary(`quarter-${String(index + 1).padStart(2, "0")}`),
    );
    const yearly = Array.from({ length: 5 }, (_, index) =>
      createSummary(String(2020 + index)),
    );
    const monthlyKeys = monthly.map((item) => item.periodKey);

    expect(getVisibleHistoricalPeriods(monthly, "monthly", false)).toHaveLength(12);
    expect(getVisibleHistoricalPeriods(monthly, "monthly", false)[0]?.periodKey).toBe("month-36");
    expect(getVisibleHistoricalPeriods(quarterly, "quarterly", false)).toHaveLength(12);
    expect(getVisibleHistoricalPeriods(quarterly, "quarterly", false)[0]?.periodKey).toBe("quarter-16");
    expect(getVisibleHistoricalPeriods(yearly, "yearly", false)).toHaveLength(5);
    expect(monthly.map((item) => item.periodKey)).toEqual(monthlyKeys);
  });

  it("전체 기간 보기와 접기 상태에 맞춰 월별 표시 범위를 바꾼다", () => {
    const monthly = Array.from({ length: 13 }, (_, index) =>
      createSummary(`2025-${String(index + 1).padStart(2, "0")}`),
    );
    const aggregation = createAggregation({ monthly });
    const collapsedMarkup = renderView(aggregation);
    const expandedMarkup = renderView(aggregation, "monthly", true);

    expect(collapsedMarkup).toContain("전체 기간 보기 (13개)");
    expect(collapsedMarkup).not.toContain("2025-01</span>");
    expect(expandedMarkup).toContain("접기");
    expect(expandedMarkup).toContain("2025-01</span>");
  });

  it("월별·분기별·연도별 selector와 현재 선택 상태를 접근 가능하게 표시한다", () => {
    const aggregation = createAggregation({
      monthly: [createSummary("2026-08", "2026년 8월")],
      quarterly: [createSummary("2026-Q3", "2026년 3분기")],
      yearly: [createSummary("2026", "2026년")],
    });
    const monthlyMarkup = renderView(aggregation, "monthly");
    const quarterlyMarkup = renderView(aggregation, "quarterly");
    const yearlyMarkup = renderView(aggregation, "yearly");

    expect(monthlyMarkup).toContain('role="group"');
    expect(monthlyMarkup).toContain('aria-label="과거 현금흐름 기간 단위"');
    expect(monthlyMarkup).toContain('aria-pressed="true"');
    expect(monthlyMarkup).toContain("2026년 8월");
    expect(quarterlyMarkup).toContain("2026년 3분기");
    expect(yearlyMarkup).toContain("2026년");
    expect(monthlyMarkup.match(/type="button"/g)).toHaveLength(3);
  });

  it("기간말 잔액 누락을 0원이 아닌 대시로 표시하고 현재 partial period를 안내한다", () => {
    const currentMonth = {
      ...createSummary("2026-08", "2026년 8월"),
      startDate: "2026-08-01" as const,
      endDate: "2026-08-31" as const,
      closingBalance: null,
    };
    const markup = renderView(createAggregation({ monthly: [currentMonth] }));

    expect(markup).toContain("진행 중");
    expect(markup).toContain("잔액 정보가 없으면 —로 표시");
    expect(markup).toContain(">—</td>");
  });

  it("월×카테고리 대신 기간당 대표 지출 한 행과 전체 카테고리 안내를 표시한다", () => {
    const markup = renderView(
      createAggregation({
        monthly: [createSummary("2025-01", "2025년 1월")],
      }),
    );

    expect(markup).toContain("기간별 주요 지출");
    expect(markup).toContain("가장 큰 지출 카테고리");
    expect(markup).toContain("주거비");
    expect(markup).toContain("300,000원");
    expect(markup).toContain("75.0%");
    expect(markup).toContain("카테고리별 지출 분석에서 확인");
  });

  it("기간 집계가 비어 있거나 날짜 오류 거래가 있으면 이유를 명확히 안내한다", () => {
    const markup = renderView(
      createAggregation({
        excludedInvalidDateCount: 2,
        excludedInvalidDateIncome: 100_000,
        excludedInvalidDateExpense: 40_000,
      }),
    );

    expect(markup).toContain("날짜를 확인할 수 없는 거래 2건은 기간별 집계에서 제외");
    expect(markup).toContain("수입 100,000원·지출 40,000원");
    expect(markup).toContain("기간별 현금흐름을 표시할 수 없습니다");
    expect(markup).toContain('role="status"');
  });
});
