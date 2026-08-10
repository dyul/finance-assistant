import type { CashRiskAnalysis } from "./cashRiskAnalyzer";
import type { CategorySummary } from "./categoryAggregator";
import type { MonthlyForecast } from "./forecastEngine";
import type { MonthlyCategorySummary } from "./monthlyCategoryAggregator";
import type { ScheduledTransaction } from "./scheduledTransaction";

export type ActionPriority = "critical" | "high" | "medium" | "low";

export type ActionType =
  | "cash_shortage"
  | "extended_shortage"
  | "expense_concentration"
  | "scheduled_income"
  | "cash_recovery"
  | "healthy_cashflow";

export interface ActionGuideItem {
  id: string;
  type: ActionType;
  priority: ActionPriority;
  title: string;
  message: string;
  action: string;
  amount?: number;
  month?: string;
}

export interface ActionGuideInput {
  forecasts: MonthlyForecast[];
  cashRisk: CashRiskAnalysis | null;
  categorySummaries: CategorySummary[];
  monthlyCategorySummaries: MonthlyCategorySummary[];
  scheduledTransactions: ScheduledTransaction[];
}

export const MAX_ACTION_GUIDE_ITEMS = 4;

const PRIORITY_ORDER: Record<ActionPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function formatCurrency(value: number): string {
  const roundedValue = Math.round(value);
  const amount = Math.abs(roundedValue).toLocaleString("ko-KR");

  return roundedValue < 0 ? `-${amount}원` : `${amount}원`;
}

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-");

  return year && monthNumber
    ? `${year}년 ${Number(monthNumber)}월`
    : month;
}

function formatDate(date: string): string {
  const [year, month, day] = date.split("-");

  return year && month && day
    ? `${year}년 ${Number(month)}월 ${Number(day)}일`
    : date;
}

function getAverageRecurringExpense(
  forecasts: MonthlyForecast[],
): number {
  if (forecasts.length === 0) {
    return 0;
  }

  return (
    forecasts.reduce(
      (total, forecast) => total + forecast.recurringExpense,
      0,
    ) / forecasts.length
  );
}

function getCashShortagePriority(
  requiredCashBuffer: number,
  averageRecurringExpense: number,
  negativeMonthCount: number,
): ActionPriority {
  if (averageRecurringExpense <= 0) {
    return negativeMonthCount >= 2 ? "high" : "medium";
  }

  const bufferRatio = requiredCashBuffer / averageRecurringExpense;

  if (bufferRatio >= 1) {
    return "critical";
  }

  if (bufferRatio >= 0.5) {
    return "high";
  }

  return "medium";
}

function findRepresentativeScheduledIncome(
  forecasts: MonthlyForecast[],
  scheduledTransactions: ScheduledTransaction[],
): ScheduledTransaction | null {
  const forecastMonths = new Set(
    forecasts.map((forecast) => forecast.month),
  );
  const scheduledIncomes = scheduledTransactions
    .filter(
      (transaction) =>
        transaction.type === "income" &&
        forecastMonths.has(transaction.date.slice(0, 7)),
    )
    .sort(
      (first, second) =>
        first.date.localeCompare(second.date) ||
        second.amount - first.amount,
    );

  return scheduledIncomes[0] ?? null;
}

function findLargestExpenseCategory(
  categorySummaries: CategorySummary[],
): CategorySummary | null {
  return categorySummaries.reduce<CategorySummary | null>(
    (largest, current) =>
      largest === null || current.amount > largest.amount
        ? current
        : largest,
    null,
  );
}

function deduplicateAndSort(
  items: ActionGuideItem[],
): ActionGuideItem[] {
  const uniqueByType = new Map<ActionType, ActionGuideItem>();

  for (const item of items) {
    if (!uniqueByType.has(item.type)) {
      uniqueByType.set(item.type, item);
    }
  }

  return Array.from(uniqueByType.values())
    .sort(
      (first, second) =>
        PRIORITY_ORDER[first.priority] - PRIORITY_ORDER[second.priority],
    )
    .slice(0, MAX_ACTION_GUIDE_ITEMS);
}

export function createActionGuide(
  input: ActionGuideInput,
): ActionGuideItem[] {
  const {
    forecasts,
    cashRisk,
    categorySummaries,
    scheduledTransactions,
  } = input;
  const items: ActionGuideItem[] = [];

  if (cashRisk && cashRisk.requiredCashBuffer > 0) {
    const averageRecurringExpense =
      getAverageRecurringExpense(forecasts);

    items.push({
      id: "cash-shortage",
      type: "cash_shortage",
      priority: getCashShortagePriority(
        cashRisk.requiredCashBuffer,
        averageRecurringExpense,
        cashRisk.negativeMonthCount,
      ),
      title: "단기 자금 확보 필요",
      message: `향후 ${cashRisk.negativeMonthCount}개월 동안 예상 잔액이 마이너스이며, 최저 예상 잔액은 ${formatCurrency(cashRisk.lowestBalance)}입니다.`,
      action: `최소 ${formatCurrency(cashRisk.requiredCashBuffer)} 이상의 추가 현금 여유를 확보하세요.`,
      amount: cashRisk.requiredCashBuffer,
      month: cashRisk.lowestBalanceMonth,
    });
  }

  if (cashRisk && cashRisk.negativeMonthCount >= 2) {
    items.push({
      id: "extended-shortage",
      type: "extended_shortage",
      priority: "high",
      title: "자금 부족 기간 장기화",
      message: `전망 기간 중 ${cashRisk.negativeMonthCount}개월 동안 월말 잔액이 마이너스로 예상됩니다.`,
      action: "지출 시기를 조정하거나 추가 입금 계획을 검토하세요.",
    });
  }

  const largestExpenseCategory = findLargestExpenseCategory(
    categorySummaries,
  );

  if (
    largestExpenseCategory &&
    largestExpenseCategory.amount > 0 &&
    largestExpenseCategory.shareOfExpense >= 50
  ) {
    items.push({
      id: `expense-concentration-${largestExpenseCategory.category}`,
      type: "expense_concentration",
      priority:
        largestExpenseCategory.shareOfExpense >= 70 ? "high" : "medium",
      title: "지출 집중도 높음",
      message: `${largestExpenseCategory.categoryName}가 전체 지출의 ${largestExpenseCategory.shareOfExpense.toFixed(1)}%를 차지하고 있습니다.`,
      action: "해당 고정비의 계약 조건 또는 절감 가능성을 우선 점검하세요.",
      amount: largestExpenseCategory.amount,
    });
  }

  const scheduledIncome = findRepresentativeScheduledIncome(
    forecasts,
    scheduledTransactions,
  );

  if (scheduledIncome) {
    items.push({
      id: `scheduled-income-${scheduledIncome.id}`,
      type: "scheduled_income",
      priority:
        (cashRisk?.requiredCashBuffer ?? 0) > 0 ? "high" : "medium",
      title: "예정 입금 일정 확인",
      message: `${formatDate(scheduledIncome.date)} ${scheduledIncome.description} ${formatCurrency(scheduledIncome.amount)}이 향후 3개월 전망에 반영되어 있습니다.`,
      action: "입금 일정이 지연되지 않도록 거래처 지급 일정을 확인하세요.",
      amount: scheduledIncome.amount,
      month: scheduledIncome.date.slice(0, 7),
    });
  }

  if (
    cashRisk &&
    cashRisk.recoveryMonth &&
    cashRisk.negativeMonthCount > 0
  ) {
    items.push({
      id: "cash-recovery",
      type: "cash_recovery",
      priority: "low",
      title: "현금흐름 회복 예상",
      message: `${formatMonth(cashRisk.recoveryMonth)}부터 예상 월말 잔액이 플러스로 전환됩니다.`,
      action: "회복 전까지 단기 유동성을 유지하고 추가 지출을 보수적으로 관리하세요.",
      month: cashRisk.recoveryMonth,
    });
  }

  const firstForecast = forecasts[0];
  const lastForecast = forecasts.at(-1);

  if (
    cashRisk &&
    cashRisk.requiredCashBuffer === 0 &&
    cashRisk.negativeMonthCount === 0 &&
    firstForecast &&
    lastForecast &&
    lastForecast.expectedEndingBalance > firstForecast.startingBalance
  ) {
    items.push({
      id: "healthy-cashflow",
      type: "healthy_cashflow",
      priority: "low",
      title: "현금흐름 안정",
      message: `향후 ${forecasts.length}개월 동안 예상 월말 잔액이 모두 0원 이상이며 최종 잔액이 시작 잔액보다 증가합니다.`,
      action: "현재 현금 여유를 유지하면서 예정 투자·비정기 지출을 검토할 수 있습니다.",
      amount: lastForecast.expectedEndingBalance,
      month: lastForecast.month,
    });
  }

  return deduplicateAndSort(items);
}
