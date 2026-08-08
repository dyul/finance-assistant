import type { MonthlyAmount } from "./incomeTrend";

export type ForecastScenario =
  | "conservative"
  | "base"
  | "optimistic";

const DEFAULT_SCENARIO_SPREAD = 0.1;
const MINIMUM_SCENARIO_SPREAD = 0.05;
const MAXIMUM_SCENARIO_SPREAD = 0.2;

function isValidMonth(month: string): boolean {
  const match = month.match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    return false;
  }

  const monthNumber = Number(match[2]);

  return monthNumber >= 1 && monthNumber <= 12;
}

export function calculateScenarioSpread(
  monthlyAmounts: MonthlyAmount[],
): number {
  const amountsByMonth = new Map<string, number>();

  for (const item of monthlyAmounts) {
    if (
      !isValidMonth(item.month) ||
      !Number.isFinite(item.amount) ||
      item.amount <= 0
    ) {
      continue;
    }

    amountsByMonth.set(
      item.month,
      (amountsByMonth.get(item.month) ?? 0) + item.amount,
    );
  }

  const recentAmounts = Array.from(
    amountsByMonth,
    ([month, amount]) => ({ month, amount }),
  )
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-3);

  if (recentAmounts.length < 3) {
    return DEFAULT_SCENARIO_SPREAD;
  }

  const absoluteChangeRates: number[] = [];

  for (let index = 1; index < recentAmounts.length; index += 1) {
    const previousAmount = recentAmounts[index - 1].amount;
    const currentAmount = recentAmounts[index].amount;

    absoluteChangeRates.push(
      Math.abs(currentAmount / previousAmount - 1),
    );
  }

  const calculatedSpread =
    absoluteChangeRates.reduce((total, rate) => total + rate, 0) /
    absoluteChangeRates.length;

  return Math.max(
    MINIMUM_SCENARIO_SPREAD,
    Math.min(MAXIMUM_SCENARIO_SPREAD, calculatedSpread),
  );
}

export function applyScenarioToRecurringIncome(
  baseIncome: number,
  scenarioSpread: number,
  scenario: ForecastScenario,
): number {
  if (scenario === "conservative") {
    return Math.max(0, baseIncome * (1 - scenarioSpread));
  }

  if (scenario === "optimistic") {
    return Math.max(0, baseIncome * (1 + scenarioSpread));
  }

  return Math.max(0, baseIncome);
}
