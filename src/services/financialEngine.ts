import type { Transaction } from "./transactionParser";

export interface FinancialSummary {
  totalIncome: number;
  totalExpense: number;
  netCashFlow: number;
  transactionCount: number;
  averageTransactionAmount: number;
  largestIncome: number;
  largestExpense: number;
}

export function calculateFinancialSummary(
  transactions: Transaction[],
): FinancialSummary {
  const totalIncome = transactions.reduce(
    (sum, transaction) => sum + transaction.income,
    0,
  );

  const totalExpense = transactions.reduce(
    (sum, transaction) => sum + transaction.expense,
    0,
  );

  const transactionCount = transactions.length;

  const totalTransactionAmount = transactions.reduce(
    (sum, transaction) =>
      sum + transaction.income + transaction.expense,
    0,
  );

  const averageTransactionAmount =
    transactionCount > 0
      ? totalTransactionAmount / transactionCount
      : 0;

  const largestIncome = transactions.reduce(
    (largest, transaction) =>
      Math.max(largest, transaction.income),
    0,
  );

  const largestExpense = transactions.reduce(
    (largest, transaction) =>
      Math.max(largest, transaction.expense),
    0,
  );

  return {
    totalIncome,
    totalExpense,
    netCashFlow: totalIncome - totalExpense,
    transactionCount,
    averageTransactionAmount,
    largestIncome,
    largestExpense,
  };
}