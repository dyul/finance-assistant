export type FinancialNature =
  | "ordinary"
  | "savings"
  | "investment"
  | "debt"
  | "internal_transfer";

export type TransactionCashDirection = "income" | "expense" | "unknown";

export interface FinancialNatureClassificationInput {
  description: string;
  direction: TransactionCashDirection;
  sourceCategory?: string;
  sourceSubcategory?: string;
}

const SOURCE_ALIASES: Record<Exclude<FinancialNature, "ordinary">, Set<string>> = {
  savings: new Set([
    "저축",
    "적금",
    "정기적금",
    "저축성계좌",
    "예금적금",
  ]),
  investment: new Set(["투자", "주식", "펀드", "증권", "투자계좌"]),
  debt: new Set([
    "대출",
    "대출상환",
    "원금상환",
    "대출원금상환",
    "대출실행",
  ]),
  internal_transfer: new Set([
    "내부이체",
    "내계좌이체",
    "내계좌간이체",
    "본인계좌이체",
  ]),
};

const DESCRIPTION_ALIASES: Record<
  Exclude<FinancialNature, "ordinary" | "debt">,
  Set<string>
> = {
  savings: new Set([
    "저축",
    "적금",
    "정기적금",
    "적금납입",
    "정기적금납입",
    "적금자동이체",
    "정기적금자동이체",
    "적금만기입금",
    "적금해지입금",
  ]),
  investment: new Set([
    "투자계좌송금",
    "증권계좌입금",
    "증권계좌출금",
    "주식매수대금",
    "펀드매수대금",
  ]),
  internal_transfer: new Set([
    "내계좌이체",
    "내계좌간이체",
    "본인계좌이체",
  ]),
};

const EXPENSE_DEBT_DESCRIPTIONS = new Set([
  "대출상환",
  "원금상환",
  "대출원금상환",
  "주택담보대출상환",
]);

const INCOME_DEBT_DESCRIPTIONS = new Set(["대출실행"]);

function normalizeNatureSignal(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./()[\]]/g, "");
}

function findExactNatureMatches(value: string): FinancialNature[] {
  if (!value) {
    return [];
  }

  return (Object.entries(SOURCE_ALIASES) as Array<
    [Exclude<FinancialNature, "ordinary">, Set<string>]
  >).flatMap(([nature, aliases]) => (aliases.has(value) ? [nature] : []));
}

function resolveUnambiguousNature(
  matches: FinancialNature[],
): FinancialNature | null {
  const uniqueMatches = new Set(matches);
  return uniqueMatches.size === 1 ? [...uniqueMatches][0] : null;
}

function classifyDescription(
  description: string,
  direction: TransactionCashDirection,
): FinancialNature {
  const matches: FinancialNature[] = (Object.entries(
    DESCRIPTION_ALIASES,
  ) as Array<
    [Exclude<FinancialNature, "ordinary" | "debt">, Set<string>]
  >).flatMap(([nature, aliases]) =>
    aliases.has(description) ? [nature] : [],
  );

  if (
    (direction === "expense" &&
      EXPENSE_DEBT_DESCRIPTIONS.has(description)) ||
    (direction === "income" && INCOME_DEBT_DESCRIPTIONS.has(description))
  ) {
    matches.push("debt");
  }

  return resolveUnambiguousNature(matches) ?? "ordinary";
}

export function classifyTransactionNature({
  description,
  direction,
  sourceCategory,
  sourceSubcategory,
}: FinancialNatureClassificationInput): FinancialNature {
  const sourceMatches = [sourceSubcategory, sourceCategory].flatMap((value) =>
    findExactNatureMatches(normalizeNatureSignal(value)),
  );

  if (sourceMatches.length > 0) {
    return resolveUnambiguousNature(sourceMatches) ?? "ordinary";
  }

  return classifyDescription(
    normalizeNatureSignal(description),
    direction,
  );
}
