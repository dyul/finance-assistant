import { describe, expect, it } from "vitest";

import { getLatestBalance } from "./forecastEngine";
import { aggregateHistoricalPeriods } from "./historicalPeriodAggregator";
import {
  createTransactionChronologyCandidates,
  createTransactionChronologyComparator,
} from "./transactionChronology";
import { parseTransactions, type Transaction } from "./transactionParser";

const permutationIndexes = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
] as const;

function createMixedTransactions(): Transaction[] {
  return parseTransactions([
    {
      date: "2026-09-03 10:00",
      description: "A",
      income: 100,
      balance: 1_000,
    },
    {
      date: "2026-09-03",
      description: "B",
      expense: 50,
      balance: 950,
    },
    {
      date: "2026-09-03 09:00",
      description: "C",
      income: 25,
      balance: 975,
    },
  ]).transactions;
}

function createPermutations(transactions: Transaction[]): Transaction[][] {
  return permutationIndexes.map((indexes) =>
    indexes.map((index) => transactions[index]!),
  );
}

describe("거래 chronology total order", () => {
  it("같은 날짜의 explicit time 2개와 date-only 1개에 원본 source row를 보존한다", () => {
    const transactions = createMixedTransactions();

    expect(
      transactions.map(({ description, time, sourceRowIndex }) => ({
        description,
        time,
        sourceRowIndex,
      })),
    ).toEqual([
      { description: "A", time: "10:00:00", sourceRowIndex: 0 },
      { description: "B", time: undefined, sourceRowIndex: 1 },
      { description: "C", time: "09:00:00", sourceRowIndex: 2 },
    ]);
  });

  it("모든 배열 permutation에서 latest와 월·분기·연도 closing balance가 같다", () => {
    const permutations = createPermutations(createMixedTransactions());

    expect(permutations.map(getLatestBalance)).toEqual(
      Array.from({ length: 6 }, () => 975),
    );

    for (const permutation of permutations) {
      const periods = aggregateHistoricalPeriods(permutation);

      expect(periods.monthly[0]?.closingBalance).toBe(975);
      expect(periods.quarterly[0]?.closingBalance).toBe(975);
      expect(periods.yearly[0]?.closingBalance).toBe(975);
    }
  });

  it("mixed date 전체에 source-row total order를 적용해 comparator transitivity를 지킨다", () => {
    const candidates = createTransactionChronologyCandidates(
      createMixedTransactions(),
    );
    const compare = createTransactionChronologyComparator(candidates);

    for (const first of candidates) {
      for (const second of candidates) {
        for (const third of candidates) {
          if (compare(first, second) <= 0 && compare(second, third) <= 0) {
            expect(compare(first, third)).toBeLessThanOrEqual(0);
          }
        }
      }
    }

    for (const permutation of createPermutations(createMixedTransactions())) {
      const permutationCandidates = createTransactionChronologyCandidates(
        permutation,
      );
      const permutationComparator =
        createTransactionChronologyComparator(permutationCandidates);

      expect(
        [...permutationCandidates]
          .sort(permutationComparator)
          .map(({ transaction }) => transaction.description),
      ).toEqual(["A", "B", "C"]);
    }
  });
});
