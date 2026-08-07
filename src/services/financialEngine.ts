import {
  hasResolvedTransactionAmount,
  type Transaction,
} from "./transactionParser";

export interface FinancialSummary {
  totalIncome: number;
  totalExpense: number;
  netCashFlow: number;
  transactionCount: number;
  validAmountTransactionCount: number;
  averageTransactionAmount: number;
  largestIncome: number;
  largestExpense: number;
}

export function calculateFinancialSummary(
  transactions: Transaction[],
): FinancialSummary {
  const validAmountTransactions = transactions.filter(
    hasResolvedTransactionAmount,
  );
  const totalIncome = validAmountTransactions.reduce(
    (sum, transaction) => sum + transaction.income,
    0,
  );

  const totalExpense = validAmountTransactions.reduce(
    (sum, transaction) => sum + transaction.expense,
    0,
  );

  const transactionCount = transactions.length;
  const validAmountTransactionCount = validAmountTransactions.length;

  const totalTransactionAmount = validAmountTransactions.reduce(
    (sum, transaction) =>
      sum + transaction.income + transaction.expense,
    0,
  );

  const averageTransactionAmount =
    validAmountTransactionCount > 0
      ? totalTransactionAmount / validAmountTransactionCount
      : 0;

  const largestIncome = validAmountTransactions.reduce(
    (largest, transaction) =>
      Math.max(largest, transaction.income),
    0,
  );

  const largestExpense = validAmountTransactions.reduce(
    (largest, transaction) =>
      Math.max(largest, transaction.expense),
    0,
  );

  return {
    totalIncome,
    totalExpense,
    netCashFlow: totalIncome - totalExpense,
    transactionCount,
    validAmountTransactionCount,
    averageTransactionAmount,
    largestIncome,
    largestExpense,
  };
}
