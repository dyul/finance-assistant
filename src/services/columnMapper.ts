export type StandardColumn =
  | "date"
  | "description"
  | "income"
  | "expense"
  | "amount"
  | "direction"
  | "balance"
  | "category"
  | "unknown";

export interface ColumnMapping {
  originalName: string;
  standardName: StandardColumn;
  displayName: string;
  confidence: "high" | "medium" | "low";
  matchStatus: "mapped" | "ambiguous" | "unknown";
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

  direction: [
    "입출금구분",
    "입출금유형",
    "입출구분",
    "수입지출구분",
    "수입지출유형",
    "direction",
    "transactiondirection",
    "inout",
    "inouttype",
    "incomeexpense",
    "debitcredit",
  ],

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
  direction: "입출금 구분",
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
  const entries = Object.entries(COLUMN_KEYWORDS) as [
    Exclude<StandardColumn, "unknown">,
    string[],
  ][];

  if (!normalizedName) {
    return {
      originalName: columnName,
      standardName: "unknown",
      displayName: DISPLAY_NAMES.unknown,
      confidence: "low",
      matchStatus: "unknown",
    };
  }

  const exactMatches = entries.filter(([, keywords]) =>
    keywords.some(
      (keyword) => normalizeColumnName(keyword) === normalizedName,
    ),
  );

  if (exactMatches.length === 1) {
    const standardName = exactMatches[0][0];

    return {
      originalName: columnName,
      standardName,
      displayName: DISPLAY_NAMES[standardName],
      confidence: "high",
      matchStatus: "mapped",
    };
  }

  if (exactMatches.length > 1) {
    return {
      originalName: columnName,
      standardName: "unknown",
      displayName: "매핑 확인 필요",
      confidence: "low",
      matchStatus: "ambiguous",
    };
  }

  const partialMatches = entries.flatMap(
    ([standardName, keywords]) =>
      keywords.flatMap((keyword) => {
        const normalizedKeyword = normalizeColumnName(keyword);

        if (
          normalizedName.includes(normalizedKeyword) ||
          normalizedKeyword.includes(normalizedName)
        ) {
          return [
            {
              standardName,
              keywordLength: normalizedKeyword.length,
            },
          ];
        }

        return [];
      }),
  );

  if (partialMatches.length > 0) {
    const longestLength = Math.max(
      ...partialMatches.map((match) => match.keywordLength),
    );
    const longestMatches = partialMatches.filter(
      (match) => match.keywordLength === longestLength,
    );
    const standardNames = new Set(
      longestMatches.map((match) => match.standardName),
    );

    if (standardNames.size === 1) {
      const standardName = longestMatches[0].standardName;

      return {
        originalName: columnName,
        standardName,
        displayName: DISPLAY_NAMES[standardName],
        confidence: "medium",
        matchStatus: "mapped",
      };
    }

    return {
      originalName: columnName,
      standardName: "unknown",
      displayName: "매핑 확인 필요",
      confidence: "low",
      matchStatus: "ambiguous",
    };
  }

  return {
    originalName: columnName,
    standardName: "unknown",
    displayName: DISPLAY_NAMES.unknown,
    confidence: "low",
    matchStatus: "unknown",
  };
}

export function mapColumns(columnNames: string[]): ColumnMapping[] {
  return columnNames.map(mapColumn);
}
