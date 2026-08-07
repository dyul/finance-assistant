import type { Transaction } from "./transactionParser";

export interface MonthlyCategorySummary {
  month: string;
  category: string;
  categoryName: string;
  amount: number;
  transactionCount: number;
  shareOfMonthlyExpense: number;
}

export function aggregateMonthlyExpensesByCategory(
  transactions: Transaction[],
): MonthlyCategorySummary[] {
  const expenseTransactions = transactions.filter(
    (transaction) => transaction.expense > 0,
  );

  const monthlyExpenseTotals = new Map<string, number>();
  const summaryMap = new Map<string, MonthlyCategorySummary>();

  for (const transaction of expenseTransactions) {
    if (transaction.date === null) {
      continue;
    }

    const month = transaction.date.slice(0, 7);

    const currentMonthlyTotal = monthlyExpenseTotals.get(month) ?? 0;

    monthlyExpenseTotals.set(
      month,
      currentMonthlyTotal + transaction.expense,
    );

    const key = `${month}__${transaction.category}`;
    const existing = summaryMap.get(key);

    if (existing) {
      existing.amount += transaction.expense;
      existing.transactionCount += 1;
    } else {
      summaryMap.set(key, {
        month,
        category: transaction.category,
        categoryName: transaction.categoryName,
        amount: transaction.expense,
        transactionCount: 1,
        shareOfMonthlyExpense: 0,
      });
    }
  }

  const summaries = Array.from(summaryMap.values());

  for (const summary of summaries) {
    const monthlyTotal = monthlyExpenseTotals.get(summary.month) ?? 0;

    summary.shareOfMonthlyExpense =
      monthlyTotal > 0
        ? (summary.amount / monthlyTotal) * 100
        : 0;
  }

  return summaries.sort((a, b) => {
    const monthComparison = a.month.localeCompare(b.month);

    if (monthComparison !== 0) {
      return monthComparison;
    }

    return b.amount - a.amount;
  });
}
