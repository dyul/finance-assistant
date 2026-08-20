import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import RecurringTransactionsTable, {
  RecurringTransactionsTableView,
} from "./RecurringTransactionsTable";
import { createScenarioForecastAnalyses } from "../services/forecastEngine";
import type { RecurringTransaction } from "../services/recurringTransactionDetector";

function createRecurringTransactions(
  count: number,
): RecurringTransaction[] {
  return Array.from({ length: count }, (_, index) => ({
    description: `합성 반복 거래 ${index + 1}`,
    category: "other",
    categoryName: "기타",
    type: "expense",
    averageAmount: 1_000,
    monthlyAmounts: [
      { month: "2026-01", amount: 1_000 },
      { month: "2026-02", amount: 1_000 },
    ],
    occurrenceCount: 2,
    activeMonthCount: 2,
    firstMonth: "2026-01",
    lastMonth: "2026-02",
    confidence: "high",
  }));
}

function countRenderedRows(markup: string): number {
  return markup.match(/data-recurring-row=/g)?.length ?? 0;
}

describe("대량 반복 거래 표시", () => {
  it.each([5, 10])("%i개 이하면 모두 표시한다", (count) => {
    const markup = renderToStaticMarkup(
      <RecurringTransactionsTable
        recurringTransactions={createRecurringTransactions(count)}
      />,
    );

    expect(countRenderedRows(markup)).toBe(count);
    expect(markup).toContain(`전체 ${count}개 중 ${count}개 표시`);
    expect(markup).not.toContain("반복 거래 전체 보기");
  });

  it("11개부터 기존 배열 순서의 앞 10개만 기본 표시한다", () => {
    const recurringTransactions = createRecurringTransactions(11);
    const originalOrder = recurringTransactions.map(
      (transaction) => transaction.description,
    );
    const markup = renderToStaticMarkup(
      <RecurringTransactionsTable
        recurringTransactions={recurringTransactions}
      />,
    );

    expect(countRenderedRows(markup)).toBe(10);
    expect(markup).toContain("총 11개의 반복 패턴을 찾았습니다.");
    expect(markup).toContain("전체 11개 중 10개 표시");
    expect(markup).toContain("합성 반복 거래 1");
    expect(markup).toContain("합성 반복 거래 10");
    expect(markup).not.toContain("합성 반복 거래 11<");
    expect(recurringTransactions.map((item) => item.description)).toEqual(
      originalOrder,
    );
  });

  it("전체 보기와 접기 상태를 명확한 native button으로 제공한다", () => {
    const recurringTransactions = createRecurringTransactions(11);
    const collapsedMarkup = renderToStaticMarkup(
      <RecurringTransactionsTableView
        recurringTransactions={recurringTransactions}
        expanded={false}
        onExpandedChange={vi.fn()}
      />,
    );
    const expandedMarkup = renderToStaticMarkup(
      <RecurringTransactionsTableView
        recurringTransactions={recurringTransactions}
        expanded
        onExpandedChange={vi.fn()}
      />,
    );

    expect(collapsedMarkup).toContain("반복 거래 전체 보기");
    expect(collapsedMarkup).toContain('aria-expanded="false"');
    expect(expandedMarkup).toContain("전체 11개 중 11개 표시");
    expect(expandedMarkup).toContain("반복 거래 접기");
    expect(expandedMarkup).toContain('aria-expanded="true"');
    expect(countRenderedRows(expandedMarkup)).toBe(11);
    expect(expandedMarkup).toContain("overflow-x-auto");
    expect(expandedMarkup).toContain("w-full");
    expect(expandedMarkup).toContain("sm:w-auto");
  });

  it("UI는 10개만 표시해도 Forecast는 전체 recurring 배열을 사용한다", () => {
    const recurringTransactions = createRecurringTransactions(30);
    const markup = renderToStaticMarkup(
      <RecurringTransactionsTable
        recurringTransactions={recurringTransactions}
      />,
    );
    const analyses = createScenarioForecastAnalyses(
      recurringTransactions,
      1_000_000,
    );

    expect(countRenderedRows(markup)).toBe(10);
    expect(analyses.base.forecasts[0]?.recurringExpense).toBe(30_000);
  });

  it("합성 200개에서 기본 10개 markup을 전체보다 크게 줄인다", () => {
    const recurringTransactions = createRecurringTransactions(200);
    const limitedStart = performance.now();
    const limitedMarkup = renderToStaticMarkup(
      <RecurringTransactionsTable
        recurringTransactions={recurringTransactions}
      />,
    );
    const limitedMs = performance.now() - limitedStart;
    const fullStart = performance.now();
    const fullMarkup = renderToStaticMarkup(
      <RecurringTransactionsTableView
        recurringTransactions={recurringTransactions}
        expanded
        onExpandedChange={vi.fn()}
      />,
    );
    const fullMs = performance.now() - fullStart;

    console.info(
      `[Day37 render] 10 rows=${limitedMs.toFixed(1)}ms, 200 rows=${fullMs.toFixed(1)}ms`,
    );
    expect(limitedMarkup.length).toBeLessThan(fullMarkup.length / 10);
  });
});
