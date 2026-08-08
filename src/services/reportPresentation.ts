import type { ActionPriority } from "./actionGuide";
import type { CashRiskLevel } from "./cashRiskAnalyzer";
import type { ForecastScenario } from "./forecastScenario";

const SCENARIO_LABELS: Record<ForecastScenario, string> = {
  conservative: "보수",
  base: "기준",
  optimistic: "낙관",
};

const RISK_LABELS: Record<CashRiskLevel, string> = {
  safe: "안전",
  warning: "주의",
  danger: "위험",
};

const PRIORITY_LABELS: Record<ActionPriority, string> = {
  critical: "긴급",
  high: "높음",
  medium: "보통",
  low: "낮음",
};

export function formatReportCurrency(value: number): string {
  const roundedValue = Math.round(value);
  const amount = Math.abs(roundedValue).toLocaleString("ko-KR");

  return roundedValue < 0 ? `-${amount}원` : `${amount}원`;
}

export function formatReportSignedCurrency(value: number): string {
  return value > 0
    ? `+${formatReportCurrency(value)}`
    : formatReportCurrency(value);
}

export function formatReportMonth(month: string): string {
  const [year, monthNumber] = month.split("-");

  return year && monthNumber
    ? `${year}년 ${Number(monthNumber)}월`
    : month;
}

export function formatReportDate(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export function getScenarioLabel(scenario: ForecastScenario): string {
  return SCENARIO_LABELS[scenario];
}

export function getRiskLabel(level: CashRiskLevel): string {
  return RISK_LABELS[level];
}

export function getActionPriorityLabel(
  priority: ActionPriority,
): string {
  return PRIORITY_LABELS[priority];
}

export function printAnalysisReport() {
  window.print();
}
