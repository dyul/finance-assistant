import type { CashRiskAnalysis } from "./cashRiskAnalyzer";
import type { MonthlyForecast } from "./forecastEngine";
import type { ForecastScenario } from "./forecastScenario";

export const DEFAULT_FORECAST_SCENARIO: ForecastScenario = "base";

export interface ForecastSummary {
  endingBalance: number | null;
  cumulativeNetCashFlow: number;
  lowestBalance: number | null;
  negativeMonthCount: number;
}

export function createForecastSummary(
  forecasts: MonthlyForecast[],
  cashRisk: CashRiskAnalysis | null,
): ForecastSummary {
  return {
    endingBalance: forecasts.at(-1)?.expectedEndingBalance ?? null,
    cumulativeNetCashFlow: forecasts.reduce(
      (total, forecast) => total + forecast.expectedNetCashFlow,
      0,
    ),
    lowestBalance: cashRisk?.lowestBalance ?? null,
    negativeMonthCount: cashRisk?.negativeMonthCount ?? 0,
  };
}
