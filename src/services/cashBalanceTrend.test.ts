import { describe, expect, it } from "vitest";

import type { MonthlyForecast } from "./forecastEngine";
import { createScenarioForecastAnalyses } from "./forecastEngine";
import type { HistoricalPeriodSummary } from "./historicalPeriodAggregator";
import type { RecurringTransaction } from "./recurringTransactionDetector";
import {
  createCashBalanceChartLayout,
  createCashBalanceTrendModel,
  createCashBalanceYDomain,
  createHistoricalBalanceSegments,
  formatCompactWon,
  selectCashBalanceXAxisLabelIndices,
} from "./cashBalanceTrend";

function createHistoricalSummary(
  periodKey: string,
  closingBalance: number | null,
): HistoricalPeriodSummary {
  const [year, month] = periodKey.split("-");
  return {
    periodKey,
    label: `${year}년 ${Number(month)}월`,
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

function createForecast(
  month: string,
  startingBalance: number,
  expectedEndingBalance: number,
  scenario: MonthlyForecast["scenario"] = "base",
): MonthlyForecast {
  return {
    month,
    scenario,
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

const referenceDate = "2026-08-24" as const;

describe("cash balance trend model", () => {
  it("월별 historical closing balance만 시간순 실제 point로 만든다", () => {
    const model = createCashBalanceTrendModel({
      monthlySummaries: [
        createHistoricalSummary("2026-08", 300),
        createHistoricalSummary("2026-06", 100),
        createHistoricalSummary("2026-07", 200),
      ],
      startingBalance: { value: null, source: null },
      forecasts: [],
      scenario: "base",
      referenceDate,
    });

    expect(model.historicalPoints.map((point) => point.periodKey)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
    expect(model.historicalPoints.map((point) => point.balance)).toEqual([
      100,
      200,
      300,
    ]);
    expect(model.historicalPoints.at(-1)?.accessibleLabel).toContain(
      "현재까지 확인된 잔액",
    );
    expect(model.state).toBe("historicalOnly");
  });

  it("null balance와 누락 월에서 historical segment를 끊는다", () => {
    const continuous = [
      createHistoricalSummary("2026-01", 100),
      createHistoricalSummary("2026-02", 200),
      createHistoricalSummary("2026-03", 300),
    ].map((summary) => ({
      id: summary.periodKey,
      periodKey: summary.periodKey,
      label: summary.label,
      balance: summary.closingBalance,
      phase: "historical" as const,
      source: "file" as const,
      accessibleLabel: summary.label,
    }));
    const nullGap = [
      continuous[0]!,
      { ...continuous[1]!, balance: null },
      continuous[2]!,
    ];
    const missingMonth = [continuous[0]!, continuous[2]!];

    expect(createHistoricalBalanceSegments(continuous)).toHaveLength(1);
    expect(createHistoricalBalanceSegments(continuous)[0]).toHaveLength(3);
    expect(createHistoricalBalanceSegments(nullGap).map((segment) => segment.length)).toEqual([1, 1]);
    expect(createHistoricalBalanceSegments(missingMonth).map((segment) => segment.length)).toEqual([1, 1]);
  });

  it("파일 잔액을 전망 시작점으로 쓰고 starting부터 Forecast 3개월만 점선 series로 연결한다", () => {
    const forecasts = [
      createForecast("2026-09", 2_000_000, 2_500_000),
      createForecast("2026-10", 2_500_000, 2_300_000),
      createForecast("2026-11", 2_300_000, 2_800_000),
    ];
    const model = createCashBalanceTrendModel({
      monthlySummaries: [createHistoricalSummary("2026-08", 2_000_000)],
      startingBalance: { value: 2_000_000, source: "file" },
      forecasts,
      scenario: "base",
      referenceDate,
    });

    expect(model.state).toBe("full");
    expect(model.startingPoint).toMatchObject({
      balance: 2_000_000,
      phase: "starting",
      source: "file",
    });
    expect(model.forecastSegment.map((point) => point.balance)).toEqual([
      2_000_000,
      2_500_000,
      2_300_000,
      2_800_000,
    ]);
    expect(model.historicalSegments[0]).toHaveLength(1);
  });

  it("직접 입력 잔액은 forecast-only 시작점으로만 사용하고 historical point를 만들지 않는다", () => {
    const model = createCashBalanceTrendModel({
      monthlySummaries: [
        createHistoricalSummary("2026-07", null),
        createHistoricalSummary("2026-08", null),
      ],
      startingBalance: { value: 3_000_000, source: "manual" },
      forecasts: [createForecast("2026-09", 3_000_000, 3_500_000)],
      scenario: "base",
      referenceDate,
    });

    expect(model.state).toBe("forecastOnly");
    expect(model.startingPoint).toMatchObject({
      balance: 3_000_000,
      source: "manual",
    });
    expect(model.historicalSegments).toEqual([]);
    expect(model.historicalPoints.every((point) => point.balance === null)).toBe(true);
  });

  it("starting balance가 없으면 absolute forecast point를 만들지 않고 empty state를 유지한다", () => {
    const withoutBalance = createCashBalanceTrendModel({
      monthlySummaries: [],
      startingBalance: { value: null, source: null },
      forecasts: [createForecast("2026-09", 0, 500_000)],
      scenario: "base",
      referenceDate,
    });
    const historicalOnly = createCashBalanceTrendModel({
      monthlySummaries: [createHistoricalSummary("2026-08", 100)],
      startingBalance: { value: 100, source: "file" },
      forecasts: [],
      scenario: "base",
      referenceDate,
    });

    expect(withoutBalance.state).toBe("noData");
    expect(withoutBalance.startingPoint).toBeNull();
    expect(withoutBalance.forecastPoints).toEqual([]);
    expect(historicalOnly.state).toBe("historicalOnly");
    expect(historicalOnly.startingPoint).toBeNull();
  });

  it("scenario 전환은 historical point를 유지하고 선택 Forecast 값과 label만 바꾼다", () => {
    const monthlySummaries = [createHistoricalSummary("2026-08", 1_000_000)];
    const conservative = createCashBalanceTrendModel({
      monthlySummaries,
      startingBalance: { value: 1_000_000, source: "file" },
      forecasts: [createForecast("2026-09", 1_000_000, 900_000, "conservative")],
      scenario: "conservative",
      referenceDate,
    });
    const optimistic = createCashBalanceTrendModel({
      monthlySummaries,
      startingBalance: { value: 1_000_000, source: "file" },
      forecasts: [createForecast("2026-09", 1_000_000, 1_400_000, "optimistic")],
      scenario: "optimistic",
      referenceDate,
    });

    expect(conservative.historicalPoints).toEqual(optimistic.historicalPoints);
    expect(conservative.forecastPoints[0]?.balance).toBe(900_000);
    expect(optimistic.forecastPoints[0]?.balance).toBe(1_400_000);
    expect(conservative.scenarioLabel).toBe("보수");
    expect(optimistic.scenarioLabel).toBe("낙관");
  });

  it("y-domain에 0과 음수·양수를 모두 포함하고 all-zero scale을 안전하게 만든다", () => {
    expect(createCashBalanceYDomain([2_000_000, 5_000_000])).toMatchObject({
      min: expect.any(Number),
      max: expect.any(Number),
    });
    expect(createCashBalanceYDomain([2_000_000, 5_000_000]).min).toBeLessThan(0);
    expect(createCashBalanceYDomain([-500_000, 2_000_000]).min).toBeLessThan(-500_000);
    expect(createCashBalanceYDomain([-500_000, 2_000_000]).max).toBeGreaterThan(2_000_000);
    expect(createCashBalanceYDomain([0, 0])).toEqual({
      min: -100_000,
      max: 100_000,
    });
  });

  it("negative balance를 zero line 아래에 배치하고 line phase를 별도 layout으로 유지한다", () => {
    const model = createCashBalanceTrendModel({
      monthlySummaries: [
        createHistoricalSummary("2026-07", 100_000),
        createHistoricalSummary("2026-08", -200_000),
      ],
      startingBalance: { value: -200_000, source: "file" },
      forecasts: [createForecast("2026-09", -200_000, -300_000)],
      scenario: "base",
      referenceDate,
    });
    const layout = createCashBalanceChartLayout(model);
    const negativeHistorical = layout.historicalPoints.find(
      (point) => point.balance < 0,
    );

    expect(negativeHistorical?.y).toBeGreaterThan(layout.zeroY);
    expect(layout.historicalSegments).toHaveLength(1);
    expect(layout.forecastSegment.map((point) => point.phase)).toEqual([
      "starting",
      "forecast",
    ]);
    expect(layout.plotTop).toBeLessThan(layout.forecastPoints[0]!.y);
    expect(layout.forecastPoints[0]!.y).toBeLessThan(layout.plotBottom);
  });

  it("60·120·240개월에서도 x-axis label을 최대 7개로 제한하고 중요한 forecast 월을 유지한다", () => {
    for (const pointCount of [60, 120, 240]) {
      const monthlySummaries = Array.from({ length: pointCount }, (_, index) => {
        const year = 2000 + Math.floor(index / 12);
        const month = (index % 12) + 1;
        return createHistoricalSummary(
          `${year}-${String(month).padStart(2, "0")}`,
          index * 10_000,
        );
      });
      const model = createCashBalanceTrendModel({
        monthlySummaries,
        startingBalance: { value: 2_400_000, source: "file" },
        forecasts: [
          createForecast("2026-09", 2_400_000, 2_500_000),
          createForecast("2026-10", 2_500_000, 2_600_000),
          createForecast("2026-11", 2_600_000, 2_700_000),
        ],
        scenario: "base",
        referenceDate,
      });
      const indices = selectCashBalanceXAxisLabelIndices(model.timeline);
      const labels = indices.map((index) => model.timeline[index]!.periodKey);

      expect(indices.length).toBeLessThanOrEqual(7);
      expect(labels).toEqual(
        expect.arrayContaining(["2026-09", "2026-10", "2026-11"]),
      );
      expect(createCashBalanceChartLayout(model).historicalPoints).toHaveLength(pointCount);
    }
  });

  it("모바일 폭에서는 plot 여백과 x-axis label 수를 줄인 layout을 만든다", () => {
    const model = createCashBalanceTrendModel({
      monthlySummaries: Array.from({ length: 8 }, (_, index) =>
        createHistoricalSummary(
          `2026-${String(index + 1).padStart(2, "0")}`,
          index * 100_000,
        ),
      ),
      startingBalance: { value: 700_000, source: "file" },
      forecasts: [
        createForecast("2026-09", 700_000, 800_000),
        createForecast("2026-10", 800_000, 900_000),
        createForecast("2026-11", 900_000, 1_000_000),
      ],
      scenario: "base",
      referenceDate,
    });
    const layout = createCashBalanceChartLayout(model, 360, 280, 6);

    expect(layout.width).toBe(360);
    expect(layout.height).toBe(280);
    expect(layout.plotLeft).toBe(58);
    expect(layout.plotRight).toBe(350);
    expect(layout.xLabels).toHaveLength(6);
    expect(layout.xLabels.map((label) => label.id)).toEqual(
      expect.arrayContaining([
        "forecast-starting-balance",
        "forecast-2026-09",
        "forecast-2026-10",
        "forecast-2026-11",
      ]),
    );
  });

  it("future source와 manual scheduled의 기존 Forecast 변경값을 그대로 graph에 투영한다", () => {
    const recurring: RecurringTransaction[] = [
      {
        description: "합성 정기 수입",
        category: "income",
        categoryName: "수입",
        type: "income",
        averageAmount: 1_000_000,
        monthlyAmounts: [
          { month: "2026-06", amount: 1_000_000 },
          { month: "2026-07", amount: 1_000_000 },
          { month: "2026-08", amount: 1_000_000 },
        ],
        occurrenceCount: 3,
        activeMonthCount: 3,
        firstMonth: "2026-06",
        lastMonth: "2026-08",
        confidence: "high",
      },
    ];
    const included = createScenarioForecastAnalyses(recurring, 3_000_000, [
      {
        id: "file-future",
        date: "2026-09-10",
        description: "합성 미래 지출",
        type: "expense",
        amount: 120_000,
        source: "file",
      },
    ]).base;
    const excluded = createScenarioForecastAnalyses(recurring, 3_000_000).base;
    const withManual = createScenarioForecastAnalyses(recurring, 3_000_000, [
      {
        id: "manual",
        date: "2026-10-10",
        description: "합성 수동 예정 지출",
        type: "expense",
        amount: 200_000,
        source: "manual",
      },
    ]).base;
    const toGraphBalances = (forecasts: MonthlyForecast[]) =>
      createCashBalanceTrendModel({
        monthlySummaries: [],
        startingBalance: { value: 3_000_000, source: "manual" },
        forecasts,
        scenario: "base",
        referenceDate,
      }).forecastPoints.map((point) => point.balance);

    expect(toGraphBalances(included.forecasts)).toEqual(
      included.forecasts.map((forecast) => forecast.expectedEndingBalance),
    );
    expect(toGraphBalances(excluded.forecasts)).toEqual(
      excluded.forecasts.map((forecast) => forecast.expectedEndingBalance),
    );
    expect(toGraphBalances(included.forecasts)[0]).toBe(
      toGraphBalances(excluded.forecasts)[0]! - 120_000,
    );
    expect(toGraphBalances(withManual.forecasts)[1]).toBe(
      toGraphBalances(excluded.forecasts)[1]! - 200_000,
    );
    expect(toGraphBalances(excluded.forecasts)).toEqual([4_000_000, 5_000_000, 6_000_000]);
  });

  it("compact 축 금액을 결정적으로 표시한다", () => {
    expect(formatCompactWon(0)).toBe("0원");
    expect(formatCompactWon(500_000)).toBe("50만");
    expect(formatCompactWon(10_000_000)).toBe("1,000만");
    expect(formatCompactWon(-100_000_000)).toBe("-1억");
  });
});
