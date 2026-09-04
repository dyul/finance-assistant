import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { mapColumns } from "./columnMapper";
import { loadCsvDataSource } from "./csvDataSource";
import { aggregateMonthly } from "./monthlyAggregator";
import { parseTransactions } from "./transactionParser";
import { partitionTransactionsByReferenceDate } from "./transactionDateScope";
import {
  aggregateHistoricalPeriods,
  isHistoricalPeriodInProgress,
} from "./historicalPeriodAggregator";
import { standardizeTransactionRows } from "./transactionRowStandardizer";
import { detectTransactionSheet } from "./transactionSheetDetector";

function sumBy(
  values: Array<{ income: number; expense: number; netCashFlow: number; transactionCount: number }>,
) {
  return values.reduce(
    (total, value) => ({
      income: total.income + value.income,
      expense: total.expense + value.expense,
      netCashFlow: total.netCashFlow + value.netCashFlow,
      transactionCount: total.transactionCount + value.transactionCount,
    }),
    { income: 0, expense: 0, netCashFlow: 0, transactionCount: 0 },
  );
}

describe("historical period aggregation", () => {
  it("월·분기·연도를 calendar 기준으로 집계하고 Q1 acceptance 숫자를 맞춘다", () => {
    const parsed = parseTransactions([
      { date: "2025-01-05", description: "매출", income: 1_000_000, balance: 1_000_000 },
      { date: "2025-01-31", description: "월세", expense: 400_000, balance: 1_800_000 },
      { date: "2025-02-05", description: "매출", income: 1_200_000 },
      { date: "2025-02-20", description: "생활비", expense: 500_000 },
      { date: "2025-03-05", description: "매출", income: 900_000 },
      { date: "2025-03-31", description: "월세", expense: 300_000, balance: 2_400_000 },
      { date: "2025-04-01", description: "Q2 수입", income: 200_000 },
      { date: "2025-06-30", description: "Q2 지출", expense: 50_000 },
      { date: "2025-07-01", description: "Q3 수입", income: 300_000 },
      { date: "2025-09-30", description: "Q3 지출", expense: 100_000 },
      { date: "2025-10-01", description: "Q4 수입", income: 400_000 },
      { date: "2025-12-31", description: "Q4 지출", expense: 150_000, balance: 3_000_000 },
      { date: "2026-01-01", description: "새해 수입", income: 500_000 },
      { date: "2026-01-31", description: "새해 지출", expense: 200_000, balance: 3_300_000 },
    ]);

    const result = aggregateHistoricalPeriods(parsed.transactions);
    const january = result.monthly.find((item) => item.periodKey === "2025-01");
    const q1 = result.quarterly.find((item) => item.periodKey === "2025-Q1");
    const year2025 = result.yearly.find((item) => item.periodKey === "2025");

    expect(january).toMatchObject({
      label: "2025년 1월",
      startDate: "2025-01-01",
      endDate: "2025-01-31",
      income: 1_000_000,
      expense: 400_000,
      netCashFlow: 600_000,
      transactionCount: 2,
      closingBalance: 1_800_000,
    });
    expect(q1).toMatchObject({
      label: "2025년 1분기",
      income: 3_100_000,
      expense: 1_200_000,
      netCashFlow: 1_900_000,
      transactionCount: 6,
      closingBalance: 2_400_000,
    });
    expect(result.quarterly.map((item) => item.periodKey)).toEqual([
      "2025-Q1",
      "2025-Q2",
      "2025-Q3",
      "2025-Q4",
      "2026-Q1",
    ]);
    expect(year2025).toMatchObject({
      income: 4_000_000,
      expense: 1_500_000,
      netCashFlow: 2_500_000,
      closingBalance: 3_000_000,
    });
  });

  it("월·분기·연도의 수입·지출·순현금흐름·건수를 교차검산한다", () => {
    const parsed = parseTransactions([
      { date: "2024-12-31", income: 100_000 },
      { date: "2025-01-05", income: 1_000_000 },
      { date: "2025-01-20", expense: 400_000 },
      { date: "2025-07-10", income: 300_000 },
      { date: "2026-01-01", expense: 200_000 },
    ]);
    const result = aggregateHistoricalPeriods(parsed.transactions);

    expect(sumBy(result.monthly)).toEqual(sumBy(result.quarterly));
    expect(sumBy(result.quarterly)).toEqual(sumBy(result.yearly));
    expect(sumBy(result.monthly).netCashFlow).toBe(
      sumBy(result.monthly).income - sumBy(result.monthly).expense,
    );
    expect(
      result.monthly.map(({ periodKey, income, expense, netCashFlow, transactionCount }) => ({
        periodKey,
        income,
        expense,
        netCashFlow,
        transactionCount,
      })),
    ).toEqual(
      aggregateMonthly(parsed.transactions).map((item) => ({
        periodKey: item.month,
        income: item.income,
        expense: item.expense,
        netCashFlow: item.netCashFlow,
        transactionCount: item.transactionCount,
      })),
    );
  });

  it("입력 순서와 무관하게 가장 늦은 날짜의 잔액을 쓰고 같은 날짜는 기존 latest balance tie-break를 따른다", () => {
    const parsed = parseTransactions([
      { date: "2025-03-31", income: 100, balance: 2_400_000 },
      { date: "2025-01-31", expense: 100, balance: 1_800_000 },
      { date: "2025-02-28", income: 100, balance: 2_000_000 },
      { date: "2025-03-31", amount: "오류", balance: 0 },
    ]);
    const result = aggregateHistoricalPeriods(parsed.transactions);

    expect(result.monthly.find((item) => item.periodKey === "2025-03")?.closingBalance).toBe(0);
    expect(result.quarterly[0]?.closingBalance).toBe(0);
    expect(result.yearly[0]?.closingBalance).toBe(0);
  });

  it("동일 날짜의 explicit time으로 정방향·역방향 모두 같은 월·분기·연도 마감 잔액을 만든다", () => {
    const forwardRows = [
      { date: "2025-03-31 09:10", income: 100, balance: 2_300_000 },
      { date: "2025-03-31 13:35", expense: 50, balance: 2_250_000 },
    ];

    for (const rows of [forwardRows, [...forwardRows].reverse()]) {
      const result = aggregateHistoricalPeriods(
        parseTransactions(rows).transactions,
      );

      expect(result.monthly[0]).toMatchObject({
        periodKey: "2025-03",
        closingBalance: 2_250_000,
      });
      expect(result.quarterly[0]).toMatchObject({
        periodKey: "2025-Q1",
        closingBalance: 2_250_000,
      });
      expect(result.yearly[0]).toMatchObject({
        periodKey: "2025",
        closingBalance: 2_250_000,
      });
    }
  });

  it("잔액 없는 파일은 null을 유지하고 직접 입력 잔액을 과거 값으로 역산하지 않는다", () => {
    const parsed = parseTransactions([
      { date: "2025-01-01", income: 1_000_000 },
      { date: "2025-01-10", expense: 400_000 },
    ]);
    const result = aggregateHistoricalPeriods(parsed.transactions);

    expect(result.monthly[0]?.closingBalance).toBeNull();
    expect(result.quarterly[0]?.closingBalance).toBeNull();
    expect(result.yearly[0]?.closingBalance).toBeNull();
  });

  it("유효 금액·날짜 오류 거래를 기간 합계에서 제외하고 reconciliation metadata를 반환한다", () => {
    const parsed = parseTransactions([
      { date: "날짜 오류", income: 100_000 },
      { date: "날짜 오류", expense: 40_000 },
      { date: "2025-01-01", income: 300_000 },
    ]);
    const result = aggregateHistoricalPeriods(parsed.transactions);

    expect(result).toMatchObject({
      excludedInvalidDateCount: 2,
      excludedInvalidDateIncome: 100_000,
      excludedInvalidDateExpense: 40_000,
    });
    expect(sumBy(result.monthly)).toMatchObject({
      income: 300_000,
      expense: 0,
      netCashFlow: 300_000,
      transactionCount: 1,
    });
  });

  it("미래 source는 historical 월·분기·연도에서 제외하고 현재 partial period는 보정 없이 유지한다", () => {
    const parsed = parseTransactions([
      { date: "2026-08-01", income: 1_000_000 },
      { date: "2026-08-21", expense: 400_000 },
      { date: "2026-09-10", expense: 120_000 },
    ]);
    const scope = partitionTransactionsByReferenceDate(
      parsed.transactions,
      "2026-08-21",
    );
    const result = aggregateHistoricalPeriods(scope.historicalTransactions);

    expect(result.monthly.map((item) => item.periodKey)).toEqual(["2026-08"]);
    expect(result.quarterly[0]).toMatchObject({
      periodKey: "2026-Q3",
      expense: 400_000,
    });
    expect(result.yearly[0]).toMatchObject({
      periodKey: "2026",
      expense: 400_000,
    });
    expect(isHistoricalPeriodInProgress(result.monthly[0]!, "2026-08-21")).toBe(true);
    expect(isHistoricalPeriodInProgress(result.quarterly[0]!, "2026-08-21")).toBe(true);
    expect(isHistoricalPeriodInProgress(result.yearly[0]!, "2026-08-21")).toBe(true);
  });

  it("빈 입력과 한 기간 입력을 처리하고 1,000·10,000건을 실질적으로 선형 집계한다", () => {
    expect(aggregateHistoricalPeriods([])).toMatchObject({
      monthly: [],
      quarterly: [],
      yearly: [],
    });

    const onePeriod = aggregateHistoricalPeriods(
      parseTransactions([{ date: "2025-01-01", income: 100 }]).transactions,
    );
    expect(onePeriod.monthly).toHaveLength(1);
    expect(onePeriod.quarterly).toHaveLength(1);
    expect(onePeriod.yearly).toHaveLength(1);

    for (const rowCount of [1_000, 10_000]) {
      const rows = Array.from({ length: rowCount }, (_, index) => ({
        date: `2025-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
        description: index % 2 === 0 ? "합성 수입" : "합성 지출",
        income: index % 2 === 0 ? 1_000 : "",
        expense: index % 2 === 0 ? "" : 500,
      }));
      const transactions = parseTransactions(rows).transactions;
      const startedAt = performance.now();
      const result = aggregateHistoricalPeriods(transactions);
      const elapsedMs = performance.now() - startedAt;

      expect(result.monthly).toHaveLength(12);
      expect(result.quarterly).toHaveLength(4);
      expect(result.yearly).toHaveLength(1);
      expect(sumBy(result.monthly).transactionCount).toBe(rowCount);
      expect(elapsedMs).toBeLessThan(1_000);
    }
  });

  it("3개 연도 합성 CSV에서 미래·날짜 오류를 분리하고 기간 숫자를 교차검산한다", () => {
    const fileBytes = readFileSync(
      new URL("./fixtures/historical-periods.csv", import.meta.url),
    );
    const source = loadCsvDataSource(
      fileBytes.buffer.slice(
        fileBytes.byteOffset,
        fileBytes.byteOffset + fileBytes.byteLength,
      ) as ArrayBuffer,
    );
    const detection = detectTransactionSheet(source.getSheetCandidates());
    const sheetName = detection?.sheetName ?? "CSV";
    const headerRowIndex = detection?.headerRowIndex ?? 0;
    const rows = source.getRows(sheetName, headerRowIndex);
    const mappings = mapColumns(
      source.getPreview(sheetName, headerRowIndex).columns,
      rows,
    );
    const parsed = parseTransactions(
      standardizeTransactionRows(rows, mappings),
    );
    const scope = partitionTransactionsByReferenceDate(
      parsed.transactions,
      "2026-08-21",
    );
    const result = aggregateHistoricalPeriods(scope.historicalTransactions);

    expect(scope.futureDatedTransactions).toHaveLength(1);
    expect(result.monthly).toHaveLength(32);
    expect(result.quarterly).toHaveLength(11);
    expect(result.yearly).toHaveLength(3);
    expect(result.excludedInvalidDateCount).toBe(1);
    expect(sumBy(result.monthly)).toEqual({
      income: 32_000_000,
      expense: 9_600_000,
      netCashFlow: 22_400_000,
      transactionCount: 64,
    });
    expect(result.monthly.at(-1)).toMatchObject({
      periodKey: "2026-08",
      closingBalance: 22_400_000,
    });
  });
});
