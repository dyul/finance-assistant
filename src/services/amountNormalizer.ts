export type AmountStatus =
  | "valid"
  | "invalidAmount"
  | "unknownDirection"
  | "directionConflict"
  | "columnConflict";

export type AmountSource = "separate" | "single" | "unresolved";

export type AmountSignEvidence =
  | "negative"
  | "explicitPositive"
  | "unsignedPositive"
  | "zero";

export interface OriginalAmountValues {
  income: string | null;
  expense: string | null;
  amount: string | null;
  direction: string | null;
}

interface ResolvedAmount {
  amountStatus: "valid" | "columnConflict";
  amountSource: "separate" | "single";
  income: number;
  expense: number;
  originalAmountValues: OriginalAmountValues;
}

interface UnresolvedAmount {
  amountStatus:
    | "invalidAmount"
    | "unknownDirection"
    | "directionConflict";
  amountSource: "unresolved";
  income: null;
  expense: null;
  originalAmountValues: OriginalAmountValues;
}

export type TransactionAmountResolution =
  | ResolvedAmount
  | UnresolvedAmount;

type ParsedMoney =
  | { kind: "missing" }
  | { kind: "invalid" }
  | {
      kind: "valid";
      value: number;
      signEvidence: AmountSignEvidence;
    };

type ParsedDirection =
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "valid"; direction: "income" | "expense" };

const INCOME_DIRECTIONS = new Set([
  "입금",
  "수입",
  "매출",
  "deposit",
  "income",
  "revenue",
  "credit",
  "cr",
  "in",
]);

const EXPENSE_DIRECTIONS = new Set([
  "출금",
  "지출",
  "비용",
  "withdrawal",
  "expense",
  "cost",
  "debit",
  "dr",
  "out",
]);

function isMissing(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  );
}

function toOriginalText(value: unknown): string | null {
  if (isMissing(value)) {
    return null;
  }

  return String(value).trim();
}

function parseNumericText(value: string): number | null {
  const validNumberPattern =
    /^[+-]?(?:(?:\d{1,3}(?:,\d{3})+)|\d+|\d*\.\d+)$/;

  if (!validNumberPattern.test(value)) {
    return null;
  }

  const parsed = Number(value.replace(/,/g, ""));

  return Number.isFinite(parsed) ? parsed : null;
}

export function parseMoney(value: unknown): ParsedMoney {
  if (isMissing(value)) {
    return { kind: "missing" };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return { kind: "invalid" };
    }

    if (value === 0) {
      return { kind: "valid", value: 0, signEvidence: "zero" };
    }

    return {
      kind: "valid",
      value,
      signEvidence: value < 0 ? "negative" : "unsignedPositive",
    };
  }

  if (typeof value !== "string") {
    return { kind: "invalid" };
  }

  const normalized = value.trim();
  const parenthesesMatch = normalized.match(/^\((.+)\)$/);

  if (parenthesesMatch) {
    const absoluteValue = parseNumericText(parenthesesMatch[1].trim());

    if (absoluteValue === null || absoluteValue < 0) {
      return { kind: "invalid" };
    }

    if (absoluteValue === 0) {
      return { kind: "valid", value: 0, signEvidence: "zero" };
    }

    return {
      kind: "valid",
      value: -absoluteValue,
      signEvidence: "negative",
    };
  }

  const parsed = parseNumericText(normalized);

  if (parsed === null) {
    return { kind: "invalid" };
  }

  if (parsed === 0) {
    return { kind: "valid", value: 0, signEvidence: "zero" };
  }

  return {
    kind: "valid",
    value: parsed,
    signEvidence: normalized.startsWith("+")
      ? "explicitPositive"
      : parsed < 0
        ? "negative"
        : "unsignedPositive",
  };
}

function normalizeDirection(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./()[\]]/g, "");
}

export function parseDirection(value: unknown): ParsedDirection {
  if (isMissing(value)) {
    return { kind: "missing" };
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return { kind: "invalid" };
  }

  const normalized = normalizeDirection(String(value));

  if (INCOME_DIRECTIONS.has(normalized)) {
    return { kind: "valid", direction: "income" };
  }

  if (EXPENSE_DIRECTIONS.has(normalized)) {
    return { kind: "valid", direction: "expense" };
  }

  return { kind: "invalid" };
}

function getOriginalValues(
  row: Record<string, unknown>,
): OriginalAmountValues {
  return {
    income: toOriginalText(row.income),
    expense: toOriginalText(row.expense),
    amount: toOriginalText(row.amount),
    direction: toOriginalText(row.direction),
  };
}

function unresolved(
  amountStatus: UnresolvedAmount["amountStatus"],
  originalAmountValues: OriginalAmountValues,
): UnresolvedAmount {
  return {
    amountStatus,
    amountSource: "unresolved",
    income: null,
    expense: null,
    originalAmountValues,
  };
}

function resolveSingleAmount(
  amount: ParsedMoney,
  direction: ParsedDirection,
  hasSignedAmountEvidence: boolean,
  originalAmountValues: OriginalAmountValues,
): TransactionAmountResolution {
  if (amount.kind !== "valid") {
    return unresolved("invalidAmount", originalAmountValues);
  }

  if (amount.signEvidence === "zero") {
    return {
      amountStatus: "valid",
      amountSource: "single",
      income: 0,
      expense: 0,
      originalAmountValues,
    };
  }

  const absoluteValue = Math.abs(amount.value);

  if (direction.kind === "invalid") {
    return unresolved("unknownDirection", originalAmountValues);
  }

  if (direction.kind === "valid") {
    if (
      (direction.direction === "income" &&
        amount.signEvidence === "negative") ||
      (direction.direction === "expense" &&
        amount.signEvidence === "explicitPositive")
    ) {
      return unresolved("directionConflict", originalAmountValues);
    }

    return {
      amountStatus: "valid",
      amountSource: "single",
      income: direction.direction === "income" ? absoluteValue : 0,
      expense: direction.direction === "expense" ? absoluteValue : 0,
      originalAmountValues,
    };
  }

  if (amount.signEvidence === "negative") {
    return {
      amountStatus: "valid",
      amountSource: "single",
      income: 0,
      expense: absoluteValue,
      originalAmountValues,
    };
  }

  if (
    amount.signEvidence === "explicitPositive" ||
    hasSignedAmountEvidence
  ) {
    return {
      amountStatus: "valid",
      amountSource: "single",
      income: absoluteValue,
      expense: 0,
      originalAmountValues,
    };
  }

  return unresolved("unknownDirection", originalAmountValues);
}

function amountsMatch(
  separateIncome: number,
  separateExpense: number,
  singleResolution: TransactionAmountResolution,
): boolean {
  return (
    isResolvedAmount(singleResolution) &&
    separateIncome === singleResolution.income &&
    separateExpense === singleResolution.expense
  );
}

export function hasSignedAmountEvidence(
  rows: Record<string, unknown>[],
): boolean {
  return rows.some((row) => {
    if (
      !isMissing(row.income) ||
      !isMissing(row.expense) ||
      !isMissing(row.direction)
    ) {
      return false;
    }

    const amount = parseMoney(row.amount);

    return amount.kind === "valid" && amount.signEvidence === "negative";
  });
}

export function resolveTransactionAmount(
  row: Record<string, unknown>,
  hasSignedEvidence: boolean,
): TransactionAmountResolution {
  const originalAmountValues = getOriginalValues(row);
  const income = parseMoney(row.income);
  const expense = parseMoney(row.expense);
  const hasSeparateValues =
    income.kind !== "missing" || expense.kind !== "missing";

  if (!hasSeparateValues) {
    return resolveSingleAmount(
      parseMoney(row.amount),
      parseDirection(row.direction),
      hasSignedEvidence,
      originalAmountValues,
    );
  }

  if (income.kind === "invalid" || expense.kind === "invalid") {
    return unresolved("invalidAmount", originalAmountValues);
  }

  const incomeValue = income.kind === "valid" ? income.value : 0;
  const expenseValue = expense.kind === "valid" ? expense.value : 0;

  if (
    incomeValue < 0 ||
    expenseValue < 0 ||
    (incomeValue !== 0 && expenseValue !== 0)
  ) {
    return unresolved("directionConflict", originalAmountValues);
  }

  const singleAmount = parseMoney(row.amount);

  if (singleAmount.kind === "valid") {
    const singleResolution = resolveSingleAmount(
      singleAmount,
      parseDirection(row.direction),
      hasSignedEvidence,
      originalAmountValues,
    );

    if (
      isResolvedAmount(singleResolution) &&
      !amountsMatch(incomeValue, expenseValue, singleResolution)
    ) {
      return {
        amountStatus: "columnConflict",
        amountSource: "separate",
        income: incomeValue,
        expense: expenseValue,
        originalAmountValues,
      };
    }
  }

  return {
    amountStatus: "valid",
    amountSource: "separate",
    income: incomeValue,
    expense: expenseValue,
    originalAmountValues,
  };
}

export function isResolvedAmount(
  amount: TransactionAmountResolution,
): amount is ResolvedAmount {
  return (
    amount.amountStatus === "valid" ||
    amount.amountStatus === "columnConflict"
  );
}
