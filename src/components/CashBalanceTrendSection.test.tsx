import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { MonthlyForecast } from "../services/forecastEngine";
import type { HistoricalPeriodSummary } from "../services/historicalPeriodAggregator";
import { createCashBalanceTrendModel } from "../services/cashBalanceTrend";
import CashBalanceTrendSection from "./CashBalanceTrendSection";

function historical(
  periodKey: string,
  closingBalance: number | null,
): HistoricalPeriodSummary {
  return {
    periodKey,
    label: `${periodKey.slice(0, 4)}년 ${Number(periodKey.slice(5, 7))}월`,
    startDate: `${periodKey}-01` as HistoricalPeriodSummary["startDate"],
    endDate: `${periodKey}-28` as HistoricalPeriodSummary["endDate"],
    transactionCount: 1,
    income: 0,
    expense: 0,
    netCashFlow: 0,
    closingBalance,
    topExpense: null,
  };
}

function forecast(
  month: string,
  startingBalance: number,
  expectedEndingBalance: number,
): MonthlyForecast {
  return {
    month,
    scenario: "base",
    baseRecurringIncome: 0,
    recurringIncome: 0,
    scheduledIncome: 0,
    expectedIncome: 0,
    recurringExpense: 0,
    scheduledExpense: 0,
    expectedExpense: 0,
    expectedNetCashFlow: expectedEndingBalance - startingBalance,
    startingBalance,
    expectedEndingBalance,
    recurringIncomeCount: 0,
    recurringExpenseCount: 0,
  };
}

describe("CashBalanceTrendSection", () => {
  it("실제 실선·예상 점선·전망 시작·0원 기준선과 legend를 함께 표시한다", () => {
    const model = createCashBalanceTrendModel({
      monthlySummaries: [
        historical("2026-07", 1_800_000),
        historical("2026-08", 2_000_000),
      ],
      startingBalance: { value: 2_000_000, source: "file" },
      forecasts: [
        forecast("2026-09", 2_000_000, 2_500_000),
        forecast("2026-10", 2_500_000, 2_300_000),
      ],
      scenario: "base",
      referenceDate: "2026-08-24",
    });
    const markup = renderToStaticMarkup(
      <CashBalanceTrendSection model={model} />,
    );

    expect(markup).toContain("현금 잔액 추이");
    expect(markup).toContain('role="img"');
    expect(markup).toContain("과거 실제 잔액 2개와 기준 예상 2개월");
    expect(markup).toContain('data-line="historical"');
    expect(markup).toContain('data-line="forecast"');
    expect(markup).toContain('stroke-dasharray="7 6"');
    expect(markup).toContain('data-boundary="forecast-start"');
    expect(markup).toContain("0원 기준선");
    expect(markup).toContain("실제 잔액");
    expect(markup).toContain("예상 잔액 · 기준");
    expect(markup).toContain("전망 시작 (최근 거래 기준)");
  });

  it("그래프 값 확인에서 실제·시작·예상의 정확한 원 단위 값을 제공한다", () => {
    const model = createCashBalanceTrendModel({
      monthlySummaries: [historical("2026-08", 2_000_000)],
      startingBalance: { value: 2_000_000, source: "file" },
      forecasts: [forecast("2026-09", 2_000_000, 2_456_789)],
      scenario: "base",
      referenceDate: "2026-08-24",
    });
    const markup = renderToStaticMarkup(
      <CashBalanceTrendSection model={model} />,
    );

    expect(markup).toContain("그래프 값 확인");
    expect(markup).toContain('aria-label="현금 잔액 추이 상세 값"');
    expect(markup).toContain("2,456,789원");
    expect(markup).toContain("2026년 9월 기준 예상 잔액 2,456,789원");
  });

  it("historical balance가 없으면 직접 잔액을 과거로 만들지 않고 forecast-only 안내를 표시한다", () => {
    const model = createCashBalanceTrendModel({
      monthlySummaries: [historical("2026-08", null)],
      startingBalance: { value: 3_000_000, source: "manual" },
      forecasts: [forecast("2026-09", 3_000_000, 3_500_000)],
      scenario: "base",
      referenceDate: "2026-08-24",
    });
    const markup = renderToStaticMarkup(
      <CashBalanceTrendSection model={model} />,
    );

    expect(markup).toContain("과거 잔액 정보가 없어 과거 잔액 추이는 표시하지 않습니다");
    expect(markup).toContain("전망 시작 (직접 입력)");
    expect(markup).not.toContain('data-point="historical"');
    expect(markup).toContain('data-point="forecast"');
  });

  it("Forecast가 없으면 historical-only chart와 중립 안내를 표시한다", () => {
    const model = createCashBalanceTrendModel({
      monthlySummaries: [historical("2026-08", 500_000)],
      startingBalance: { value: 500_000, source: "file" },
      forecasts: [],
      scenario: "base",
      referenceDate: "2026-08-24",
    });
    const markup = renderToStaticMarkup(
      <CashBalanceTrendSection model={model} />,
    );

    expect(markup).toContain("향후 전망을 계산할 수 없어 파일에서 확인된 과거 잔액만 표시");
    expect(markup).toContain('data-point="historical"');
    expect(markup).not.toContain('data-line="forecast"');
  });

  it("잔액이 전혀 없으면 blank SVG 대신 manual balance 연결 안내를 표시한다", () => {
    const model = createCashBalanceTrendModel({
      monthlySummaries: [historical("2026-08", null)],
      startingBalance: { value: null, source: null },
      forecasts: [],
      scenario: "base",
      referenceDate: "2026-08-24",
    });
    const markup = renderToStaticMarkup(
      <CashBalanceTrendSection model={model} />,
    );

    expect(markup).toContain("잔액 정보가 없어 현금 잔액 추이를 표시할 수 없습니다");
    expect(markup).toContain("현재 잔액을 직접 입력한 뒤 향후 전망");
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain("<svg");
  });

  it("negative point와 현재 partial month 설명을 잘리지 않는 viewBox SVG에 유지한다", () => {
    const model = createCashBalanceTrendModel({
      monthlySummaries: [historical("2026-08", -497_000)],
      startingBalance: { value: -497_000, source: "file" },
      forecasts: [forecast("2026-09", -497_000, -200_000)],
      scenario: "base",
      referenceDate: "2026-08-24",
    });
    const markup = renderToStaticMarkup(
      <CashBalanceTrendSection model={model} />,
    );

    expect(markup).toContain('viewBox="0 0 760 320"');
    expect(markup).toContain('class="block h-auto w-full"');
    expect(markup).toContain("2026년 8월 현재까지 확인된 잔액 -497,000원");
    expect(markup).toContain("-497,000원");
  });
});
