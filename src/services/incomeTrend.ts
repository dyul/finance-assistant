export interface MonthlyAmount {
  month: string;
  amount: number;
}

export interface IncomeTrend {
  averageMonthlyAmount: number;
  rawMonthlyChange: number;
  cappedMonthlyChange: number;
  latestMonth: string;
  latestAmount: number;
  wasCapped: boolean;
}

function parseMonth(month: string): number | null {
  const match = month.match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    return null;
  }

  return year * 12 + monthNumber - 1;
}

export function calculateIncomeTrend(
  monthlyAmounts: MonthlyAmount[],
): IncomeTrend | null {
  const amountsByMonth = new Map<string, number>();

  for (const item of monthlyAmounts) {
    if (
      parseMonth(item.month) === null ||
      !Number.isFinite(item.amount) ||
      item.amount <= 0
    ) {
      return null;
    }

    amountsByMonth.set(
      item.month,
      (amountsByMonth.get(item.month) ?? 0) + item.amount,
    );
  }

  const history = Array.from(amountsByMonth, ([month, amount]) => ({
    month,
    amount,
  })).sort((a, b) => a.month.localeCompare(b.month));

  if (history.length < 3) {
    return null;
  }

  const recentHistory = history.slice(-3);
  const monthlyChanges: number[] = [];

  for (let index = 1; index < recentHistory.length; index += 1) {
    const previous = recentHistory[index - 1];
    const current = recentHistory[index];
    const previousMonthIndex = parseMonth(previous.month);
    const currentMonthIndex = parseMonth(current.month);

    if (previousMonthIndex === null || currentMonthIndex === null) {
      return null;
    }

    const monthGap = currentMonthIndex - previousMonthIndex;

    if (monthGap <= 0) {
      return null;
    }

    monthlyChanges.push(
      (current.amount - previous.amount) / monthGap,
    );
  }

  const averageMonthlyAmount =
    recentHistory.reduce((total, item) => total + item.amount, 0) /
    recentHistory.length;
  const rawMonthlyChange =
    monthlyChanges.reduce((total, change) => total + change, 0) /
    monthlyChanges.length;
  const maximumChange = averageMonthlyAmount * 0.5;
  const cappedMonthlyChange = Math.max(
    -maximumChange,
    Math.min(maximumChange, rawMonthlyChange),
  );
  const latest = recentHistory[recentHistory.length - 1];

  return {
    averageMonthlyAmount,
    rawMonthlyChange,
    cappedMonthlyChange,
    latestMonth: latest.month,
    latestAmount: latest.amount,
    wasCapped: cappedMonthlyChange !== rawMonthlyChange,
  };
}

export function getTrendAdjustedIncome(
  monthlyAmounts: MonthlyAmount[],
  forecastMonth: string,
  fallbackAverageAmount: number,
): number {
  const trend = calculateIncomeTrend(monthlyAmounts);
  const forecastMonthIndex = parseMonth(forecastMonth);

  if (!trend || forecastMonthIndex === null) {
    return fallbackAverageAmount;
  }

  const latestMonthIndex = parseMonth(trend.latestMonth);

  if (latestMonthIndex === null || forecastMonthIndex <= latestMonthIndex) {
    return fallbackAverageAmount;
  }

  const monthsAhead = forecastMonthIndex - latestMonthIndex;

  return Math.max(
    0,
    trend.latestAmount + trend.cappedMonthlyChange * monthsAhead,
  );
}
