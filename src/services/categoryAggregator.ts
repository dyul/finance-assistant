import {
  hasResolvedTransactionAmount,
  type Transaction,
} from "./transactionParser";

export interface CategorySummary {
  category: string;
  categoryName: string;
  amount: number;
  transactionCount: number;
  shareOfExpense: number;
}

export function aggregateExpensesByCategory(
  transactions: Transaction[],
): CategorySummary[] {
  const expenseTransactions = transactions
    .filter(hasResolvedTransactionAmount)
    .filter((transaction) => transaction.expense > 0);

  const totalExpense = expenseTransactions.reduce(
    (sum, transaction) => sum + transaction.expense,
    0,
  );

  const categoryMap = new Map<string, CategorySummary>();

  for (const transaction of expenseTransactions) {
    const existing = categoryMap.get(transaction.category);

    if (existing) {
      existing.amount += transaction.expense;
      existing.transactionCount += 1;
    } else {
      categoryMap.set(transaction.category, {
        category: transaction.category,
        categoryName: transaction.categoryName,
        amount: transaction.expense,
        transactionCount: 1,
        shareOfExpense: 0,
      });
    }
  }

  const summaries = Array.from(categoryMap.values());

  for (const summary of summaries) {
    summary.shareOfExpense =
      totalExpense > 0
        ? (summary.amount / totalExpense) * 100
        : 0;
  }

  return summaries.sort((a, b) => b.amount - a.amount);
}
