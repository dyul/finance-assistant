export type ScheduledTransactionType = "income" | "expense";

export interface ScheduledTransaction {
  id: string;
  date: string;
  description: string;
  type: ScheduledTransactionType;
  amount: number;
}
