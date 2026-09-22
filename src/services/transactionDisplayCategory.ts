import type { FinancialNature } from "./financialNatureClassifier";
import type { Transaction } from "./transactionParser";

export interface TransactionDisplayCategory {
  category: string;
  categoryName: string;
}

const FINANCIAL_NATURE_DISPLAY: Record<
  Exclude<FinancialNature, "ordinary">,
  TransactionDisplayCategory
> = {
  savings: {
    category: "financial-nature:savings",
    categoryName: "저축/적금",
  },
  investment: {
    category: "financial-nature:investment",
    categoryName: "투자",
  },
  debt: {
    category: "financial-nature:debt",
    categoryName: "대출/상환",
  },
  internal_transfer: {
    category: "financial-nature:internal-transfer",
    categoryName: "내부이체",
  },
};

export function getTransactionDisplayCategory(
  transaction: Pick<
    Transaction,
    "category" | "categoryName" | "financialNature"
  >,
): TransactionDisplayCategory {
  if (transaction.financialNature === "ordinary") {
    return {
      category: transaction.category,
      categoryName: transaction.categoryName,
    };
  }

  return FINANCIAL_NATURE_DISPLAY[transaction.financialNature];
}
