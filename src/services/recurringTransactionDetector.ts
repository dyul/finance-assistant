import type { Transaction } from "./transactionParser";

export type RecurringTransactionType = "income" | "expense";

export type RecurringConfidence = "high" | "medium";

export interface RecurringTransaction {
  description: string;
  category: string;
  categoryName: string;

  type: RecurringTransactionType;

  averageAmount: number;
  occurrenceCount: number;
  activeMonthCount: number;

  firstMonth: string;
  lastMonth: string;

  confidence: RecurringConfidence;
}

interface RecurringGroup {
  description: string;
  category: string;
  categoryName: string;

  type: RecurringTransactionType;

  amounts: number[];
  months: Set<string>;
}

function normalizeDescription(description: string): string {
  return description
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function calculateAverage(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const total = values.reduce(
    (sum, value) => sum + value,
    0,
  );

  return total / values.length;
}

function calculateAmountVariation(
  values: number[],
  average: number,
): number {
  if (values.length === 0 || average === 0) {
    return 0;
  }

  const averageDifference =
    values.reduce(
      (sum, value) => sum + Math.abs(value - average),
      0,
    ) / values.length;

  return averageDifference / average;
}

export function detectRecurringTransactions(
  transactions: Transaction[],
): RecurringTransaction[] {
  const groups = new Map<string, RecurringGroup>();

  for (const transaction of transactions) {
    if (transaction.date === null) {
      continue;
    }

    const month = transaction.date.slice(0, 7);

    const isIncome = transaction.income > 0;
    const isExpense = transaction.expense > 0;

    if (!isIncome && !isExpense) {
      continue;
    }

    const type: RecurringTransactionType = isIncome
      ? "income"
      : "expense";

    const amount = isIncome
      ? transaction.income
      : transaction.expense;

    if (amount <= 0) {
      continue;
    }

    const normalizedDescription = normalizeDescription(
      transaction.description,
    );

    if (!normalizedDescription) {
      continue;
    }

    const key = [
      normalizedDescription,
      transaction.category,
      type,
    ].join("|");

    const existingGroup = groups.get(key);

    if (existingGroup) {
      existingGroup.amounts.push(amount);
      existingGroup.months.add(month);

      continue;
    }

    groups.set(key, {
      description: transaction.description,
      category: transaction.category,
      categoryName: transaction.categoryName,
      type,
      amounts: [amount],
      months: new Set([month]),
    });
  }

  const recurringTransactions: RecurringTransaction[] = [];

  for (const group of groups.values()) {
    const months = Array.from(group.months).sort();

    /*
     * 최소 2개 이상의 서로 다른 월에서 발생해야
     * 반복 거래 후보로 판단합니다.
     */
    if (months.length < 2) {
      continue;
    }

    const averageAmount = calculateAverage(group.amounts);

    const variation = calculateAmountVariation(
      group.amounts,
      averageAmount,
    );

    /*
     * 금액 변동폭이 평균 대비 10% 이하면
     * 반복 가능성이 높은 거래로 판단합니다.
     *
     * 30% 이하이면 중간 신뢰도로 판단합니다.
     *
     * 그보다 변동폭이 크면 현재 단계에서는
     * 반복 거래에서 제외합니다.
     */
    let confidence: RecurringConfidence;

    if (variation <= 0.1) {
      confidence = "high";
    } else if (variation <= 0.3) {
      confidence = "medium";
    } else {
      continue;
    }

    recurringTransactions.push({
      description: group.description,
      category: group.category,
      categoryName: group.categoryName,

      type: group.type,

      averageAmount,
      occurrenceCount: group.amounts.length,
      activeMonthCount: months.length,

      firstMonth: months[0],
      lastMonth: months[months.length - 1],

      confidence,
    });
  }

  return recurringTransactions.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "expense" ? -1 : 1;
    }

    return b.averageAmount - a.averageAmount;
  });
}
