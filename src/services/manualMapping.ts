import type {
  ColumnMapping,
  StandardColumn,
} from "./columnMapper";
import {
  hasResolvedTransactionAmount,
  type Transaction,
} from "./transactionParser";

export type ManualAmountMode =
  | "split"
  | "amount-direction"
  | "signed";

export interface ManualTransactionMapping {
  sheetName: string;
  headerRowIndex: number;
  dateColumn: string;
  descriptionColumn?: string;
  balanceColumn?: string;
  amountMode: ManualAmountMode;
  incomeColumn?: string;
  expenseColumn?: string;
  amountColumn?: string;
  directionColumn?: string;
}

export interface ManualWorksheetPreview {
  columns: string[];
  rows: Record<string, unknown>[];
  headerRowLimit: number;
}

export interface ManualMappingValidationContext {
  sheetNames: string[];
  columns: string[];
  headerRowLimit: number;
}

const MANUAL_HEADER_LIMIT = 30;

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

export function countValidManualTransactions(
  transactions: Transaction[],
): number {
  return transactions.filter(
    (transaction) =>
      transaction.date !== null &&
      hasResolvedTransactionAmount(transaction),
  ).length;
}

function findOriginalColumn(
  mappings: ColumnMapping[],
  standardName: StandardColumn,
): string | undefined {
  return mappings.find(
    (mapping) => mapping.standardName === standardName,
  )?.originalName;
}

export function createManualMappingPrefill(
  sheetName: string,
  headerRowIndex: number,
  automaticMappings: ColumnMapping[],
): ManualTransactionMapping {
  const incomeColumn = findOriginalColumn(automaticMappings, "income");
  const expenseColumn = findOriginalColumn(automaticMappings, "expense");
  const amountColumn = findOriginalColumn(automaticMappings, "amount");
  const directionColumn = findOriginalColumn(
    automaticMappings,
    "direction",
  );
  const amountMode: ManualAmountMode =
    incomeColumn || expenseColumn
      ? "split"
      : amountColumn && directionColumn
        ? "amount-direction"
        : "signed";

  return {
    sheetName,
    headerRowIndex,
    dateColumn:
      findOriginalColumn(automaticMappings, "date") ?? "",
    descriptionColumn: findOriginalColumn(
      automaticMappings,
      "description",
    ),
    balanceColumn: findOriginalColumn(automaticMappings, "balance"),
    amountMode,
    incomeColumn,
    expenseColumn,
    amountColumn,
    directionColumn,
  };
}

function selectedColumnEntries(
  mapping: ManualTransactionMapping,
): Array<[string, string]> {
  const entries: Array<[string, string | undefined]> = [
    ["거래일", mapping.dateColumn],
    ["거래내용", mapping.descriptionColumn],
    ["잔액", mapping.balanceColumn],
  ];

  if (mapping.amountMode === "split") {
    entries.push(
      ["입금", mapping.incomeColumn],
      ["출금", mapping.expenseColumn],
    );
  } else {
    entries.push(["금액", mapping.amountColumn]);

    if (mapping.amountMode === "amount-direction") {
      entries.push(["거래구분", mapping.directionColumn]);
    }
  }

  return entries.filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  );
}

export function validateManualMapping(
  mapping: ManualTransactionMapping,
  context: ManualMappingValidationContext,
): string[] {
  const errors: string[] = [];

  if (!mapping.sheetName || !context.sheetNames.includes(mapping.sheetName)) {
    errors.push("분석할 시트를 선택해주세요.");
  }

  if (
    !Number.isInteger(mapping.headerRowIndex) ||
    mapping.headerRowIndex < 0 ||
    mapping.headerRowIndex >= context.headerRowLimit ||
    mapping.headerRowIndex >= MANUAL_HEADER_LIMIT
  ) {
    errors.push("헤더 행은 실제 시트의 1~30행 안에서 선택해주세요.");
  }

  if (!mapping.dateColumn) {
    errors.push("거래일 컬럼은 필수입니다.");
  }

  if (mapping.amountMode === "split") {
    if (!mapping.incomeColumn && !mapping.expenseColumn) {
      errors.push("입금 또는 출금 컬럼 중 하나 이상을 선택해주세요.");
    }
  }

  if (mapping.amountMode === "amount-direction") {
    if (!mapping.amountColumn) {
      errors.push("금액 컬럼을 선택해주세요.");
    }

    if (!mapping.directionColumn) {
      errors.push("거래구분 컬럼을 선택해주세요.");
    }
  }

  if (mapping.amountMode === "signed" && !mapping.amountColumn) {
    errors.push("부호형 금액 컬럼을 선택해주세요.");
  }

  const selectedEntries = selectedColumnEntries(mapping);

  for (const [role, column] of selectedEntries) {
    if (!context.columns.includes(column)) {
      errors.push(`${role} 컬럼 '${column}'을 현재 헤더에서 찾을 수 없습니다.`);
    }
  }

  const rolesByColumn = new Map<string, string[]>();

  for (const [role, column] of selectedEntries) {
    rolesByColumn.set(column, [...(rolesByColumn.get(column) ?? []), role]);
  }

  for (const [column, roles] of rolesByColumn) {
    if (roles.length > 1) {
      errors.push(
        `같은 컬럼 '${column}'을 ${roles.join(", ")} 역할에 중복 선택할 수 없습니다.`,
      );
    }
  }

  return errors;
}

function createColumnMapping(
  originalName: string,
  standardName: StandardColumn,
): ColumnMapping {
  return {
    originalName,
    standardName,
    displayName: DISPLAY_NAMES[standardName],
    confidence: "high",
    matchStatus: "mapped",
  };
}

export function convertManualMappingToColumnMappings(
  mapping: ManualTransactionMapping,
  columns: string[],
): ColumnMapping[] {
  const standardNameByColumn = new Map<string, StandardColumn>();

  standardNameByColumn.set(mapping.dateColumn, "date");

  if (mapping.descriptionColumn) {
    standardNameByColumn.set(mapping.descriptionColumn, "description");
  }

  if (mapping.balanceColumn) {
    standardNameByColumn.set(mapping.balanceColumn, "balance");
  }

  if (mapping.amountMode === "split") {
    if (mapping.incomeColumn) {
      standardNameByColumn.set(mapping.incomeColumn, "income");
    }

    if (mapping.expenseColumn) {
      standardNameByColumn.set(mapping.expenseColumn, "expense");
    }
  } else if (mapping.amountColumn) {
    standardNameByColumn.set(mapping.amountColumn, "amount");

    if (
      mapping.amountMode === "amount-direction" &&
      mapping.directionColumn
    ) {
      standardNameByColumn.set(mapping.directionColumn, "direction");
    }
  }

  return columns.map((column) =>
    createColumnMapping(
      column,
      standardNameByColumn.get(column) ?? "unknown",
    ),
  );
}
