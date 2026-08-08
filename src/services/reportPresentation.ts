import type { ActionPriority } from "./actionGuide";
import type { CashRiskLevel } from "./cashRiskAnalyzer";
import type { ForecastScenario } from "./forecastScenario";
import {
  formatCurrency,
  formatMonth,
  formatSignedCurrency,
} from "../utils/formatters";

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
  return formatCurrency(value);
}

export function formatReportSignedCurrency(value: number): string {
  return formatSignedCurrency(value);
}

export function formatReportMonth(month: string): string {
  return formatMonth(month);
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
