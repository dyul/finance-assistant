import type { MonthlyForecast } from "./forecastEngine";

export type CashRiskLevel = "safe" | "warning" | "danger";

export interface CashRiskAnalysis {
  level: CashRiskLevel;

  negativeMonthCount: number;

  lowestBalance: number;

  lowestBalanceMonth: string;

  recoveryMonth: string | null;

  requiredCashBuffer: number;

  message: string;
}

function formatCurrency(value: number): string {
  return `${Math.abs(Math.round(value)).toLocaleString("ko-KR")}원`;
}

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-");

  if (!year || !monthNumber) {
    return month;
  }

  return `${year}년 ${Number(monthNumber)}월`;
}

export function analyzeCashRisk(
  forecasts: MonthlyForecast[],
): CashRiskAnalysis | null {
  if (forecasts.length === 0) {
    return null;
  }

  const negativeForecasts = forecasts.filter(
    (forecast) => forecast.expectedEndingBalance < 0,
  );

  const lowestForecast = forecasts.reduce(
    (lowest, current) =>
      current.expectedEndingBalance <
      lowest.expectedEndingBalance
        ? current
        : lowest,
    forecasts[0],
  );

  const firstRecoveryForecast = forecasts.find(
    (forecast) => forecast.expectedEndingBalance >= 0,
  );

  const requiredCashBuffer =
    lowestForecast.expectedEndingBalance < 0
      ? Math.abs(lowestForecast.expectedEndingBalance)
      : 0;

  let level: CashRiskLevel;
  let message: string;

  if (negativeForecasts.length === 0) {
    level = "safe";

    message =
      "향후 3개월 예상 월말 잔액이 모두 0원 이상으로 유지됩니다.";
  } else if (firstRecoveryForecast) {
    level = "warning";

    message = `향후 ${
      negativeForecasts.length
    }개월 동안 자금 부족이 예상되지만, ${formatMonth(
      firstRecoveryForecast.month,
    )}에는 잔액이 플러스로 전환될 것으로 예상됩니다. 최소 약 ${formatCurrency(
      requiredCashBuffer,
    )}의 추가 현금 여유가 필요합니다.`;
  } else {
    level = "danger";

    message = `향후 ${
      negativeForecasts.length
    }개월 모두 예상 월말 잔액이 마이너스입니다. 최소 약 ${formatCurrency(
      requiredCashBuffer,
    )}의 추가 현금 확보가 필요합니다.`;
  }

  return {
    level,

    negativeMonthCount: negativeForecasts.length,

    lowestBalance: lowestForecast.expectedEndingBalance,

    lowestBalanceMonth: lowestForecast.month,

    recoveryMonth: firstRecoveryForecast?.month ?? null,

    requiredCashBuffer,

    message,
  };
}