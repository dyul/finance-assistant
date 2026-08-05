import { classifyTransaction } from "./categoryClassifier";

export interface Transaction {
  date: string;
  description: string;
  income: number;
  expense: number;
  balance: number;
  category: string;
  categoryName: string;
  confidence: "high" | "medium" | "low";
}

export interface ParsedTransactionResult {
  transactions: Transaction[];
  totalIncome: number;
  totalExpense: number;
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  return Number(String(value).replace(/,/g, "")) || 0;
}

export function parseTransactions(
  rows: Record<string, unknown>[],
): ParsedTransactionResult {
  const transactions: Transaction[] = [];

  let totalIncome = 0;
  let totalExpense = 0;

  for (const row of rows) {
    const description = String(row.description ?? "");
    const classification = classifyTransaction(description);

    const transaction: Transaction = {
      date: String(row.date ?? ""),
      description,
      income: toNumber(row.income),
      expense: toNumber(row.expense),
      balance: toNumber(row.balance),
      category: classification.category,
      categoryName: classification.displayName,
      confidence: classification.confidence,
    };

    totalIncome += transaction.income;
    totalExpense += transaction.expense;

    transactions.push(transaction);
  }

  return {
    transactions,
    totalIncome,
    totalExpense,
  };
}