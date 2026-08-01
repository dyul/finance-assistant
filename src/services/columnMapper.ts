export type StandardColumn =
  | "date"
  | "description"
  | "income"
  | "expense"
  | "amount"
  | "balance"
  | "category"
  | "unknown";

export interface ColumnMapping {
  originalName: string;
  standardName: StandardColumn;
  displayName: string;
  confidence: "high" | "medium" | "low";
}

const COLUMN_KEYWORDS: Record<
  Exclude<StandardColumn, "unknown">,
  string[]
> = {
  date: [
    "거래일",
    "거래일자",
    "일자",
    "날짜",
    "작성일",
    "발생일",
    "date",
    "transactiondate",
  ],

  description: [
    "적요",
    "내용",
    "거래내용",
    "거래처",
    "메모",
    "비고",
    "description",
    "memo",
    "details",
  ],

  income: [
    "입금",
    "입금액",
    "수입",
    "수입금액",
    "매출",
    "매출액",
    "income",
    "deposit",
    "revenue",
    "sales",
  ],

  expense: [
    "출금",
    "출금액",
    "지출",
    "지출금액",
    "비용",
    "expense",
    "withdrawal",
    "cost",
  ],

  amount: ["금액", "거래금액", "합계", "amount", "total"],

  balance: [
    "잔액",
    "거래후잔액",
    "누적잔액",
    "balance",
    "remainingbalance",
  ],

  category: [
    "분류",
    "구분",
    "항목",
    "카테고리",
    "계정과목",
    "category",
    "account",
  ],
};

const DISPLAY_NAMES: Record<StandardColumn, string> = {
  date: "거래일",
  description: "거래 내용",
  income: "입금",
  expense: "출금",
  amount: "금액",
  balance: "잔액",
  category: "분류",
  unknown: "미분류",
};

function normalizeColumnName(columnName: string): string {
  return columnName
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./()[\]]/g, "");
}

export function mapColumn(columnName: string): ColumnMapping {
  const normalizedName = normalizeColumnName(columnName);

  for (const [standardName, keywords] of Object.entries(
    COLUMN_KEYWORDS,
  ) as [Exclude<StandardColumn, "unknown">, string[]][]) {
    const exactMatch = keywords.some(
      (keyword) => normalizeColumnName(keyword) === normalizedName,
    );

    if (exactMatch) {
      return {
        originalName: columnName,
        standardName,
        displayName: DISPLAY_NAMES[standardName],
        confidence: "high",
      };
    }

    const partialMatch = keywords.some((keyword) => {
      const normalizedKeyword = normalizeColumnName(keyword);

      return (
        normalizedName.includes(normalizedKeyword) ||
        normalizedKeyword.includes(normalizedName)
      );
    });

    if (partialMatch) {
      return {
        originalName: columnName,
        standardName,
        displayName: DISPLAY_NAMES[standardName],
        confidence: "medium",
      };
    }
  }

  return {
    originalName: columnName,
    standardName: "unknown",
    displayName: DISPLAY_NAMES.unknown,
    confidence: "low",
  };
}

export function mapColumns(columnNames: string[]): ColumnMapping[] {
  return columnNames.map(mapColumn);
}