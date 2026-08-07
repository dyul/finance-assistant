import type { MonthlySummary } from "./monthlyAggregator";
import type { CategorySummary } from "./categoryAggregator";
import type { MonthlyCategorySummary } from "./monthlyCategoryAggregator";

export type InsightLevel = "positive" | "warning" | "info";

export interface FinancialInsight {
  level: InsightLevel;
  title: string;
  message: string;
}

function formatCurrency(value: number): string {
  return `${Math.abs(Math.round(value)).toLocaleString("ko-KR")}원`;
}

export function generateFinancialInsights(
  monthlySummaries: MonthlySummary[],
  categorySummaries: CategorySummary[],
  monthlyCategorySummaries: MonthlyCategorySummary[],
): FinancialInsight[] {
  const insights: FinancialInsight[] = [];

  if (monthlySummaries.length === 0) {
    return insights;
  }

  const latestMonth = monthlySummaries[monthlySummaries.length - 1];

  const previousMonth =
    monthlySummaries.length >= 2
      ? monthlySummaries[monthlySummaries.length - 2]
      : undefined;

  const latestMonthCategories = monthlyCategorySummaries
    .filter((summary) => summary.month === latestMonth.month)
    .sort((a, b) => b.amount - a.amount);

  const largestLatestCategory = latestMonthCategories[0];

  const secondLargestLatestCategory = latestMonthCategories[1];

  const largestOverallCategory = categorySummaries[0];

  // 1. 최근 월 현금흐름 상태
  if (latestMonth.netCashFlow < 0) {
    insights.push({
      level: "warning",
      title: `${latestMonth.month} 현금흐름 적자`,
      message: `${latestMonth.month}의 순현금흐름은 -${formatCurrency(
        latestMonth.netCashFlow,
      )}입니다.`,
    });
  } else {
    insights.push({
      level: "positive",
      title: `${latestMonth.month} 현금흐름 흑자`,
      message: `${latestMonth.month}의 순현금흐름은 +${formatCurrency(
        latestMonth.netCashFlow,
      )}입니다.`,
    });
  }

  // 2. 전월 대비 변화
  if (previousMonth) {
    const change =
      latestMonth.netCashFlow - previousMonth.netCashFlow;

    if (change > 0) {
      insights.push({
        level: "positive",
        title: "전월 대비 현금흐름 개선",
        message: `${latestMonth.month}의 순현금흐름은 전월 대비 ${formatCurrency(
          change,
        )} 개선되었습니다.`,
      });
    }

    if (change < 0) {
      insights.push({
        level: "warning",
        title: "전월 대비 현금흐름 악화",
        message: `${latestMonth.month}의 순현금흐름은 전월 대비 ${formatCurrency(
          change,
        )} 감소했습니다.`,
      });
    }
  }

  // 3. 최근 월 주요 지출 원인
  if (largestLatestCategory) {
    insights.push({
      level:
        largestLatestCategory.shareOfMonthlyExpense >= 50
          ? "warning"
          : "info",
      title: `${latestMonth.month} 주요 지출 원인`,
      message: `${latestMonth.month} 출금액 중 ${
        largestLatestCategory.categoryName
      }가 ${formatCurrency(
        largestLatestCategory.amount,
      )}으로 전체 월 지출의 ${largestLatestCategory.shareOfMonthlyExpense.toFixed(
        1,
      )}%를 차지했습니다.`,
    });
  }

  // 4. 최근 월 지출 집중도
  if (
    largestLatestCategory &&
    largestLatestCategory.shareOfMonthlyExpense >= 50
  ) {
    insights.push({
      level: "warning",
      title: `${latestMonth.month} 지출 집중도 높음`,
      message: `${latestMonth.month} 전체 지출의 절반 이상이 ${largestLatestCategory.categoryName}에 집중되어 있습니다.`,
    });
  }

  // 5. 최근 월 상위 두 개 지출
  if (largestLatestCategory && secondLargestLatestCategory) {
    insights.push({
      level: "info",
      title: `${latestMonth.month} 주요 비용 구성`,
      message: `${largestLatestCategory.categoryName} ${formatCurrency(
        largestLatestCategory.amount,
      )}, ${secondLargestLatestCategory.categoryName} ${formatCurrency(
        secondLargestLatestCategory.amount,
      )}이 주요 지출 항목입니다.`,
    });
  }

  // 6. 전체 기간 지출 집중도
  if (
    largestOverallCategory &&
    largestOverallCategory.shareOfExpense >= 50
  ) {
    insights.push({
      level: "info",
      title: "전체 기간 주요 지출",
      message: `${largestOverallCategory.categoryName}가 전체 기간 지출의 ${largestOverallCategory.shareOfExpense.toFixed(
        1,
      )}%를 차지했습니다.`,
    });
  }

  return insights;
}