import type { Transaction } from "./transactionParser";

export interface MonthlySummary {
  month: string;

  income: number;

  expense: number;

  netCashFlow: number;

  transactionCount: number;
}

export function aggregateMonthly(
  transactions: Transaction[],
): MonthlySummary[] {
  const monthlyMap = new Map<string, MonthlySummary>();

for (const transaction of transactions) {
  if (transaction.date === null) {
    continue;
  }

  const month = transaction.date.slice(0, 7);

  if (!monthlyMap.has(month)) {
    monthlyMap.set(month, {
      month,
      income: 0,
      expense: 0,
      netCashFlow: 0,
      transactionCount: 0,
    });
  }

  const summary = monthlyMap.get(month)!;

  summary.income += transaction.income;
  summary.expense += transaction.expense;
  summary.netCashFlow += transaction.income - transaction.expense;
  summary.transactionCount += 1;
}

return Array.from(monthlyMap.values()).sort((a, b) =>
  a.month.localeCompare(b.month),
);
}
