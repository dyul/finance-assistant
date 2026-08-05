export type TransactionCategory =
  | "revenue"
  | "food"
  | "supplies"
  | "rent"
  | "payroll"
  | "insurance"
  | "tax"
  | "utilities"
  | "transportation"
  | "fees"
  | "other";

export interface CategoryClassification {
  category: TransactionCategory;
  displayName: string;
  confidence: "high" | "medium" | "low";
  matchedKeyword?: string;
}

interface CategoryRule {
  category: TransactionCategory;
  displayName: string;
  keywords: string[];
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "revenue",
    displayName: "매출",
    keywords: ["상품판매", "매출", "판매대금", "정산금", "입금"],
  },
  {
    category: "food",
    displayName: "식비",
    keywords: [
      "스타벅스",
      "커피",
      "카페",
      "식당",
      "음식점",
      "배달",
      "도시락",
    ],
  },
  {
    category: "supplies",
    displayName: "소모품비",
    keywords: [
      "사무용품",
      "문구",
      "다이소",
      "쿠팡",
      "소모품",
      "복사용지",
    ],
  },
  {
    category: "rent",
    displayName: "임차료",
    keywords: ["월세", "임대료", "사무실임대", "관리비"],
  },
  {
    category: "payroll",
    displayName: "인건비",
    keywords: ["급여", "월급", "상여", "인건비", "퇴직금"],
  },
  {
    category: "insurance",
    displayName: "보험료",
    keywords: [
      "국민연금",
      "건강보험",
      "고용보험",
      "산재보험",
      "4대보험",
      "보험료",
    ],
  },
  {
    category: "tax",
    displayName: "세금과공과",
    keywords: [
      "부가세",
      "종합소득세",
      "원천세",
      "지방세",
      "국세",
      "세금",
    ],
  },
  {
    category: "utilities",
    displayName: "공과금",
    keywords: [
      "전기요금",
      "수도요금",
      "가스요금",
      "통신비",
      "인터넷",
      "휴대폰",
    ],
  },
  {
    category: "transportation",
    displayName: "교통비",
    keywords: [
      "택시",
      "버스",
      "지하철",
      "주유",
      "주차",
      "톨게이트",
    ],
  },
  {
    category: "fees",
    displayName: "지급수수료",
    keywords: ["수수료", "카드수수료", "송금수수료", "플랫폼수수료"],
  },
];

function normalizeDescription(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, "");
}

export function classifyTransaction(
  description: string,
): CategoryClassification {
  const normalizedDescription = normalizeDescription(description);

  for (const rule of CATEGORY_RULES) {
    const matchedKeyword = rule.keywords.find((keyword) =>
      normalizedDescription.includes(normalizeDescription(keyword)),
    );

    if (matchedKeyword) {
      return {
        category: rule.category,
        displayName: rule.displayName,
        confidence: "high",
        matchedKeyword,
      };
    }
  }

  return {
    category: "other",
    displayName: "기타",
    confidence: "low",
  };
}