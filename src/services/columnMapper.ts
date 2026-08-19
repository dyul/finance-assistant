import { parseDirection } from "./amountNormalizer";

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
    "내역",
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
    "수입/지출",
    "거래구분",
    "입출금",
    "입출금구분",
    "입출금유형",
    "입출구분",
    "거래유형",
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

const SENSITIVE_PARTIAL_COLUMNS = new Set<StandardColumn>([
  "income",
  "expense",
  "amount",
  "direction",
]);

const SAFE_COLUMN_AFFIXES = new Set([
  "",
  "총",
  "누적",
  "원",
  "krw",
  "합계",
  "상세",
  "코드",
  "명",
]);

const CONTEXTUAL_DIRECTION_HEADERS = new Set(["구분", "유형", "type"]);

function isSafeSensitivePartialMatch(
  normalizedName: string,
  normalizedKeyword: string,
): boolean {
  if (normalizedName.startsWith(normalizedKeyword)) {
    return SAFE_COLUMN_AFFIXES.has(
      normalizedName.slice(normalizedKeyword.length),
    );
  }

  if (normalizedName.endsWith(normalizedKeyword)) {
    return SAFE_COLUMN_AFFIXES.has(
      normalizedName.slice(0, -normalizedKeyword.length),
    );
  }

  return false;
}

function hasDirectionValueEvidence(
  columnName: string,
  rows: Record<string, unknown>[],
): boolean {
  const values = rows
    .map((row) => row[columnName])
    .filter(
      (value) =>
        value !== null &&
        value !== undefined &&
        !(typeof value === "string" && value.trim() === ""),
    );

  return values.some(
    (value) => parseDirection(value).kind === "valid",
  );
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
              normalizedKeyword,
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

      if (
        SENSITIVE_PARTIAL_COLUMNS.has(standardName) &&
        !isSafeSensitivePartialMatch(
          normalizedName,
          longestMatches[0].normalizedKeyword,
        )
      ) {
        return {
          originalName: columnName,
          standardName: "unknown",
          displayName: DISPLAY_NAMES.unknown,
          confidence: "low",
          matchStatus: "unknown",
        };
      }

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

export function mapColumns(
  columnNames: string[],
  rows: Record<string, unknown>[] = [],
): ColumnMapping[] {
  const initialMappings = columnNames.map(mapColumn);
  const hasPrimaryDescription = initialMappings.some(
    (mapping) =>
      normalizeColumnName(mapping.originalName) === "내역" &&
      mapping.standardName === "description",
  );
  const mappings = hasPrimaryDescription
    ? initialMappings.map((mapping) =>
        normalizeColumnName(mapping.originalName) === "메모" &&
        mapping.standardName === "description"
          ? {
              ...mapping,
              standardName: "unknown" as const,
              displayName: DISPLAY_NAMES.unknown,
              confidence: "low" as const,
              matchStatus: "unknown" as const,
            }
          : mapping,
      )
    : initialMappings;
  const hasAmountColumn = mappings.some(
    (mapping) => mapping.standardName === "amount",
  );
  const hasSeparateAmountColumns = mappings.some(
    (mapping) =>
      mapping.standardName === "income" ||
      mapping.standardName === "expense",
  );
  const hasDirectionColumn = mappings.some(
    (mapping) => mapping.standardName === "direction",
  );

  if (
    !hasAmountColumn ||
    hasSeparateAmountColumns ||
    hasDirectionColumn ||
    rows.length === 0
  ) {
    return mappings;
  }

  return mappings.map((mapping) => {
    const normalizedName = normalizeColumnName(mapping.originalName);

    if (
      !CONTEXTUAL_DIRECTION_HEADERS.has(normalizedName) ||
      !hasDirectionValueEvidence(mapping.originalName, rows)
    ) {
      return mapping;
    }

    return {
      ...mapping,
      standardName: "direction",
      displayName: DISPLAY_NAMES.direction,
      confidence: "medium",
      matchStatus: "mapped",
    };
  });
}
