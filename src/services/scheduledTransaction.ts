export type ScheduledTransactionType = "income" | "expense";
export type ScheduledTransactionSource = "manual" | "file";

export interface ScheduledTransaction {
  id: string;
  date: string;
  description: string;
  type: ScheduledTransactionType;
  amount: number;
  source?: ScheduledTransactionSource;
  recurringKey?: string;
}

export interface ScheduledTransactionForecastScope {
  applicable: ScheduledTransaction[];
  outOfPeriod: ScheduledTransaction[];
}

export function partitionScheduledTransactionsByForecastMonths(
  scheduledTransactions: ScheduledTransaction[],
  forecastMonths: string[],
): ScheduledTransactionForecastScope {
  const forecastMonthSet = new Set(forecastMonths);
  const applicable: ScheduledTransaction[] = [];
  const outOfPeriod: ScheduledTransaction[] = [];

  for (const transaction of scheduledTransactions) {
    if (forecastMonthSet.has(transaction.date.slice(0, 7))) {
      applicable.push(transaction);
    } else {
      outOfPeriod.push(transaction);
    }
  }

  return { applicable, outOfPeriod };
}
