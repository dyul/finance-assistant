import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ForecastSection, {
  ForecastScenarioTabs,
} from "./ForecastSection";
import {
  createScenarioForecastAnalyses,
  type ScenarioForecastAnalyses,
} from "../services/forecastEngine";
import {
  createForecastSummary,
  DEFAULT_FORECAST_SCENARIO,
} from "../services/forecastPresentation";
import type { ForecastScenario } from "../services/forecastScenario";
import type { RecurringTransaction } from "../services/recurringTransactionDetector";
import type { ScheduledTransaction } from "../services/scheduledTransaction";

type ScenarioButton = ReactElement<{
  children?: ReactNode;
  "data-scenario"?: ForecastScenario;
  onClick: () => void;
}>;

function findScenarioButton(
  node: ReactNode,
  scenario: ForecastScenario,
): ScenarioButton | null {
  if (!isValidElement(node)) {
    return null;
  }

  const props = node.props as {
    children?: ReactNode;
    "data-scenario"?: ForecastScenario;
    onClick?: () => void;
  };

  if (props["data-scenario"] === scenario && props.onClick) {
    return node as ScenarioButton;
  }

  for (const child of Children.toArray(props.children)) {
    const found = findScenarioButton(child, scenario);

    if (found) {
      return found;
    }
  }

  return null;
}

function createRecurringTransaction(
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
      createRecurringTransaction({
        description: "상품판매",
        category: "revenue",
        categoryName: "매출",
        type: "income",
        averageAmount: 950_000,
        monthlyAmounts: [
          { month: "2026-01", amount: 900_000 },
          { month: "2026-02", amount: 950_000 },
          { month: "2026-03", amount: 1_000_000 },
        ],
      }),
      createRecurringTransaction({
        description: "월세",
        averageAmount: 700_000,
      }),
      createRecurringTransaction({
        description: "전기요금",
        averageAmount: 82_333.33,
      }),
    ],
    -497_000,
    scheduledTransactions,
  );
}

function renderScenario(
  analyses: ScenarioForecastAnalyses,
  scenario: ForecastScenario,
): string {
  return renderToStaticMarkup(
    <ForecastSection
      analysis={analyses[scenario]}
      selectedScenario={scenario}
      onScenarioChange={() => undefined}
    />,
  );
}

describe("ForecastSection UI", () => {
  it("기본 시나리오를 기준으로 정의한다", () => {
    expect(DEFAULT_FORECAST_SCENARIO).toBe("base");
    expect(renderScenario(createAnalyses(), DEFAULT_FORECAST_SCENARIO)).toContain(
      "최근 수입 추세와 반복 지출을 반영한 기본 시나리오",
    );
  });

  it.each([
    ["conservative", "보수", "277,491원"],
    ["optimistic", "낙관", "634,509원"],
  ] as const)(
    "%s 버튼 선택 후 해당 Forecast를 표시한다",
    (scenario, label, expectedEndingBalance) => {
      const analyses = createAnalyses();
      let selectedScenario: ForecastScenario = DEFAULT_FORECAST_SCENARIO;
      const tabs = ForecastScenarioTabs({
        selectedScenario,
        onScenarioChange: (nextScenario) => {
          selectedScenario = nextScenario;
        },
      });
      const button = findScenarioButton(tabs, scenario);

      expect(button).not.toBeNull();
      button?.props.onClick();

      expect(selectedScenario).toBe(scenario);
      const markup = renderScenario(analyses, selectedScenario);
      expect(markup).toContain(`현금 위험 분석 (${label})`);
      expect(markup).toContain(expectedEndingBalance);
    },
  );

  it("요약값을 선택한 Forecast와 cashRisk에서 가져온다", () => {
    const analysis = createAnalyses().base;
    const summary = createForecastSummary(
      analysis.forecasts,
      analysis.cashRisk,
    );

    expect(summary.endingBalance).toBeCloseTo(
      analysis.forecasts[2].expectedEndingBalance,
      6,
    );
    expect(summary.cumulativeNetCashFlow).toBeCloseTo(
      analysis.forecasts.reduce(
        (total, forecast) => total + forecast.expectedNetCashFlow,
        0,
      ),
      6,
    );
    expect(summary.lowestBalance).toBe(analysis.cashRisk?.lowestBalance);
    expect(summary.negativeMonthCount).toBe(
      analysis.cashRisk?.negativeMonthCount,
    );

    const markup = renderScenario(createAnalyses(), "base");
    expect(markup).toContain("456,000원");
    expect(markup).toContain("+953,000원");
    expect(markup).toContain("-229,333원");
    expect(markup).toContain("1개월");
  });

  it("월별 Forecast 카드 3개와 필수 상세값을 렌더링한다", () => {
    const markup = renderScenario(createAnalyses(), "base");

    expect(markup.match(/data-testid="forecast-month-card"/g)).toHaveLength(3);
    expect(markup).toContain("예상 월말 잔액");
    expect(markup).toContain("예상 순현금흐름");
    expect(markup).toContain("추세·시나리오 반복 입금");
    expect(markup).toContain("예정 입금");
    expect(markup).toContain("기본 반복 예상 출금");
    expect(markup).toContain("예정 출금");
  });

  it("예정거래 추가 후 요약이 변경되고 삭제 후 원복된다", () => {
    const originalAnalyses = createAnalyses();
    const scheduledAnalyses = createAnalyses([
      {
        id: "confirmed-income",
        date: "2026-05-15",
        description: "확정 입금",
        type: "income",
        amount: 500_000,
      },
    ]);
    const restoredAnalyses = createAnalyses([]);
    const originalSummary = createForecastSummary(
      originalAnalyses.base.forecasts,
      originalAnalyses.base.cashRisk,
    );
    const scheduledSummary = createForecastSummary(
      scheduledAnalyses.base.forecasts,
      scheduledAnalyses.base.cashRisk,
    );
    const restoredSummary = createForecastSummary(
      restoredAnalyses.base.forecasts,
      restoredAnalyses.base.cashRisk,
    );

    expect(scheduledSummary.endingBalance).toBeCloseTo(
      (originalSummary.endingBalance ?? 0) + 500_000,
      6,
    );
    expect(scheduledSummary.cumulativeNetCashFlow).toBeCloseTo(
      originalSummary.cumulativeNetCashFlow + 500_000,
      6,
    );
    expect(restoredSummary).toEqual(originalSummary);
  });
});
