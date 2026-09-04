import { describe, expect, it } from "vitest";

import { createCashBalanceTrendModel } from "./cashBalanceTrend";
import {
  createScenarioForecastAnalyses,
  getLatestBalance,
} from "./forecastEngine";
import { aggregateHistoricalPeriods } from "./historicalPeriodAggregator";
import { resolveForecastStartingBalance } from "./manualBalance";
import type { RecurringTransaction } from "./recurringTransactionDetector";
import { parseTransactions } from "./transactionParser";

const recurringIncome: RecurringTransaction = {
  description: "합성 정기 수입",
  category: "revenue",
  categoryName: "매출",
  type: "income",
  averageAmount: 100_000,
  monthlyAmounts: [
    { month: "2026-08", amount: 100_000 },
    { month: "2026-09", amount: 100_000 },
  ],
  occurrenceCount: 2,
  activeMonthCount: 2,
  firstMonth: "2026-08",
  lastMonth: "2026-09",
  confidence: "high",
};

describe("거래 chronology downstream 연결", () => {
  it("최신 explicit-time 잔액을 Forecast 시작점과 graph 연결점에 그대로 전달한다", () => {
    const forwardRows = [
      {
        date: "2026-09-03 09:10",
        description: "합성 이전 거래",
        expense: 100_000,
        balance: 900_000,
      },
      {
        date: "2026-09-03 13:35",
        description: "합성 최신 거래",
        income: 200_000,
        balance: 1_100_000,
      },
    ];
    const results = [forwardRows, [...forwardRows].reverse()].map((rows) => {
      const transactions = parseTransactions(rows).transactions;
      const latestBalance = getLatestBalance(transactions);
      const startingBalance = resolveForecastStartingBalance(
        latestBalance,
        9_000_000,
      );
      const analyses = createScenarioForecastAnalyses(
        [recurringIncome],
        startingBalance.value,
      );
      const periods = aggregateHistoricalPeriods(transactions);
      const graph = createCashBalanceTrendModel({
        monthlySummaries: periods.monthly,
        startingBalance,
        forecasts: analyses.base.forecasts,
        scenario: "base",
        referenceDate: "2026-09-03",
      });

      return {
        startingBalance,
        forecastStartingBalance:
          analyses.base.forecasts[0]?.startingBalance,
        graphHistoricalBalance: graph.historicalPoints.at(-1)?.balance,
        graphStartingPoint: graph.startingPoint
          ? {
              balance: graph.startingPoint.balance,
              source: graph.startingPoint.source,
            }
          : null,
      };
    });

    expect(results[0]).toEqual(results[1]);
    expect(results[0]).toEqual({
      startingBalance: { value: 1_100_000, source: "file" },
      forecastStartingBalance: 1_100_000,
      graphHistoricalBalance: 1_100_000,
      graphStartingPoint: { balance: 1_100_000, source: "file" },
    });
  });
});
