import { describe, expect, it } from "vitest";

import { createActionGuide } from "./actionGuide";
import {
  aggregateExpensesByCategory,
  aggregateExpensesByDisplayCategory,
} from "./categoryAggregator";
import { mapColumns } from "./columnMapper";
import { calculateFinancialSummary } from "./financialEngine";
import { createScenarioForecastAnalyses, getLatestBalance } from "./forecastEngine";
import { createFutureSourceTransactions } from "./futureSourceTransaction";
import { analyzeHistoricalRange } from "./historicalRangeAnalyzer";
import { aggregateHistoricalPeriods } from "./historicalPeriodAggregator";
import { aggregateMonthlyExpensesByCategory } from "./monthlyCategoryAggregator";
import { detectRecurringTransactions } from "./recurringTransactionDetector";
import { standardizeTransactionRows } from "./transactionRowStandardizer";
import { parseTransactions, type Transaction } from "./transactionParser";

const PERSONAL_HEADERS = [
  "거래일",
  "수입/지출",
  "금액",
  "분류",
  "하위 분류",
  "내역",
  "잔액",
];

function parsePersonalRows(rows: Record<string, unknown>[]): Transaction[] {
  const mappings = mapColumns(PERSONAL_HEADERS, rows);
  return parseTransactions(
    standardizeTransactionRows(rows, mappings),
  ).transactions;
}

function createPersonalTransactions(): Transaction[] {
  return parsePersonalRows([
    {
      거래일: "2026-01-01",
      "수입/지출": "수입",
      금액: 3_000_000,
      분류: "일반",
      "하위 분류": "",
      내역: "월급",
      잔액: 3_000_000,
    },
    {
      거래일: "2026-01-02",
      "수입/지출": "지출",
      금액: 600_000,
      분류: "생활",
      "하위 분류": "",
      내역: "합성 생활비",
      잔액: 2_400_000,
    },
    {
      거래일: "2026-01-03",
      "수입/지출": "지출",
      금액: 500_000,
      분류: "금융",
      "하위 분류": "정기적금",
      내역: "정기적금 납입",
      잔액: 1_900_000,
    },
    {
      거래일: "2026-01-04",
      "수입/지출": "지출",
      금액: 300_000,
      분류: "투자",
      "하위 분류": "",
      내역: "투자 계좌 송금",
      잔액: 1_600_000,
    },
    {
      거래일: "2026-01-05",
      "수입/지출": "지출",
      금액: 200_000,
      분류: "금융",
      "하위 분류": "대출상환",
      내역: "대출 원금 상환",
      잔액: 1_400_000,
    },
    {
      거래일: "2026-01-06",
      "수입/지출": "지출",
      금액: 100_000,
      분류: "내부이체",
      "하위 분류": "",
      내역: "이체",
      잔액: 1_300_000,
    },
  ]);
}

describe("개인 금융 거래 성격 흐름", () => {
  it("원본 분류 metadata를 Transaction까지 보존하고 FA category와 분리한다", () => {
    const savings = createPersonalTransactions()[2];

    expect(savings).toMatchObject({
      sourceCategory: "금융",
      sourceSubcategory: "정기적금",
      category: "other",
      categoryName: "기타",
      financialNature: "savings",
    });
  });

  it("합성 개인 거래를 다섯 경제적 성격으로 보수적으로 분류한다", () => {
    expect(createPersonalTransactions().map(({ financialNature }) => financialNature)).toEqual([
      "ordinary",
      "ordinary",
      "savings",
      "investment",
      "debt",
      "internal_transfer",
    ]);
  });

  it("거래 성격을 추가해도 입금·출금·순현금흐름·건수·잔액이 유지된다", () => {
    const transactions = createPersonalTransactions();

    expect(calculateFinancialSummary(transactions)).toMatchObject({
      totalIncome: 3_000_000,
      totalExpense: 1_700_000,
      netCashFlow: 1_300_000,
      transactionCount: 6,
      validAmountTransactionCount: 6,
    });
    expect(getLatestBalance(transactions)).toBe(1_300_000);
  });

  it("core category는 유지하고 표시 집계에서만 금융성 거래를 구분한다", () => {
    const transactions = createPersonalTransactions();
    const core = aggregateExpensesByCategory(transactions);
    const presented = aggregateExpensesByDisplayCategory(transactions);

    expect(core).toEqual([
      expect.objectContaining({
        category: "other",
        categoryName: "기타",
        amount: 1_700_000,
      }),
    ]);
    expect(
      presented.map(({ categoryName, amount }) => ({ categoryName, amount })),
    ).toEqual([
      { categoryName: "기타", amount: 600_000 },
      { categoryName: "저축/적금", amount: 500_000 },
      { categoryName: "투자", amount: 300_000 },
      { categoryName: "대출/상환", amount: 200_000 },
      { categoryName: "내부이체", amount: 100_000 },
    ]);
    expect(presented.reduce((sum, item) => sum + item.amount, 0)).toBe(
      1_700_000,
    );
  });

  it("전체 기간과 직접 설정 기간 모두 표시 카테고리를 사용한다", () => {
    const transactions = createPersonalTransactions();
    const full = analyzeHistoricalRange(transactions, null);
    const custom = analyzeHistoricalRange(transactions, {
      startDate: "2026-01-03",
      endDate: "2026-01-03",
    });

    expect(full.categorySummaries.map((item) => item.categoryName)).toContain(
      "저축/적금",
    );
    expect(custom.categorySummaries).toEqual([
      expect.objectContaining({
        categoryName: "저축/적금",
        amount: 500_000,
      }),
    ]);
    expect(custom.summary.expense).toBe(500_000);
  });

  it("기간별 주요 지출에도 표시 카테고리를 사용한다", () => {
    const transactions = parsePersonalRows([
      {
        거래일: "2026-02-01",
        "수입/지출": "지출",
        금액: 500_000,
        분류: "적금",
        "하위 분류": "",
        내역: "정기적금 납입",
      },
      {
        거래일: "2026-02-02",
        "수입/지출": "지출",
        금액: 100_000,
        분류: "생활",
        "하위 분류": "",
        내역: "합성 생활비",
      },
    ]);

    expect(aggregateHistoricalPeriods(transactions).monthly[0]?.topExpense).toMatchObject({
      categoryName: "저축/적금",
      amount: 500_000,
    });
  });

  it("financialNature를 반복 키와 Forecast 입력에 추가하지 않는다", () => {
    const savingsTransactions = parsePersonalRows([
      {
        거래일: "2026-01-10",
        "수입/지출": "지출",
        금액: 500_000,
        분류: "적금",
        "하위 분류": "",
        내역: "정기적금 납입",
      },
      {
        거래일: "2026-02-10",
        "수입/지출": "지출",
        금액: 500_000,
        분류: "적금",
        "하위 분류": "",
        내역: "정기적금 납입",
      },
    ]);
    const ordinaryCopies = savingsTransactions.map((transaction) => ({
      ...transaction,
      financialNature: "ordinary" as const,
    }));
    const savingsRecurring = detectRecurringTransactions(savingsTransactions);
    const ordinaryRecurring = detectRecurringTransactions(ordinaryCopies);

    expect(savingsRecurring).toEqual(ordinaryRecurring);
    expect(
      createScenarioForecastAnalyses(savingsRecurring, 1_000_000),
    ).toEqual(createScenarioForecastAnalyses(ordinaryRecurring, 1_000_000));
  });

  it("Action Guide는 기존 core category 입력을 유지한다", () => {
    const transactions = createPersonalTransactions();
    const ordinaryCopies = transactions.map((transaction) => ({
      ...transaction,
      financialNature: "ordinary" as const,
    }));
    const recurring = detectRecurringTransactions(transactions);
    const analysis = createScenarioForecastAnalyses(
      recurring,
      getLatestBalance(transactions),
    ).base;
    const createGuide = (inputTransactions: Transaction[]) =>
      createActionGuide({
        forecasts: analysis.forecasts,
        cashRisk: analysis.cashRisk,
        categorySummaries: aggregateExpensesByCategory(inputTransactions),
        monthlyCategorySummaries:
          aggregateMonthlyExpensesByCategory(inputTransactions),
        scheduledTransactions: [],
      });

    expect(createGuide(transactions)).toEqual(createGuide(ordinaryCopies));
  });

  it("미래 원본 거래에 성격을 보존하되 기존 category 반복 키를 유지한다", () => {
    const [transaction] = parsePersonalRows([
      {
        거래일: "2026-10-10",
        "수입/지출": "지출",
        금액: 500_000,
        분류: "적금",
        "하위 분류": "",
        내역: "정기적금 납입",
      },
    ]);
    const [future] = createFutureSourceTransactions(
      [transaction],
      "2026-09-22",
    );

    expect(future).toMatchObject({
      category: "other",
      financialNature: "savings",
      recurringKey: "정기적금납입|other|expense",
    });
  });
});
