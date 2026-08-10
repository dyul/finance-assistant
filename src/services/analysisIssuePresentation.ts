import type { DataQualitySummary } from "./dataQualityAnalyzer";
import { MAX_EXCEL_FILE_SIZE_LABEL } from "./excelUploadValidation";
import { MAX_MANUAL_HEADER_ROWS } from "./manualMapping";

export type AnalysisIssueSeverity = "blocking" | "warning" | "info";

export interface AnalysisIssue {
  id: string;
  severity: AnalysisIssueSeverity;
  title: string;
  description: string;
  impact: string;
  action?: string;
  actionHref?: string;
}

export type BlockingAnalysisIssueKind =
  | "unsupportedFile"
  | "fileTooLarge"
  | "workbookReadFailed"
  | "transactionSheetNotFound"
  | "noValidTransactions";

export interface AmountIssueCounts {
  invalidAmountCount: number;
  unknownDirectionCount: number;
  directionConflictCount: number;
  directionOverrideCount: number;
  columnConflictCount: number;
}

export function createBlockingAnalysisIssue(
  kind: BlockingAnalysisIssueKind,
): AnalysisIssue {
  if (kind === "unsupportedFile") {
    return {
      id: kind,
      severity: "blocking",
      title: "지원하지 않는 파일 형식입니다.",
      description: "선택한 파일은 현재 Excel 파일로 확인되지 않습니다.",
      impact: "파일을 읽지 않았으며 재무 요약과 향후 전망을 계산하지 않았습니다.",
      action: ".xlsx 또는 .xls 파일을 선택해주세요.",
    };
  }

  if (kind === "fileTooLarge") {
    return {
      id: kind,
      severity: "blocking",
      title: "파일 크기가 너무 큽니다.",
      description: `현재 브라우저 분석은 ${MAX_EXCEL_FILE_SIZE_LABEL} 이하 Excel 파일을 지원합니다.`,
      impact:
        "브라우저 메모리 과부하를 막기 위해 파일을 읽지 않았으며 재무 분석을 시작하지 않았습니다.",
      action:
        "기간을 나누거나 불필요한 시트를 제거해 파일 크기를 줄인 뒤 다시 업로드해주세요.",
    };
  }

  if (kind === "transactionSheetNotFound") {
    return {
      id: kind,
      severity: "blocking",
      title: "거래내역 시트를 자동으로 찾지 못했습니다.",
      description:
        "시트 이름, 헤더 위치 또는 거래일·금액 컬럼 구성이 자동 인식 기준과 달랐습니다.",
      impact: "아직 재무 요약과 향후 전망을 계산하지 않았습니다.",
      action: `직접 설정에서 거래내역 시트, 헤더 행, 거래일과 금액 컬럼을 선택해주세요. 직접 설정은 ${MAX_MANUAL_HEADER_ROWS}행까지 지원하며, 헤더가 ${MAX_MANUAL_HEADER_ROWS + 1}행 이후라면 Excel에서 ${MAX_MANUAL_HEADER_ROWS}행 안으로 옮겨주세요.`,
    };
  }

  if (kind === "noValidTransactions") {
    return {
      id: kind,
      severity: "blocking",
      title: "분석할 수 있는 거래를 찾지 못했습니다.",
      description:
        "선택된 거래일과 금액 컬럼에서 날짜와 입출금 금액이 모두 유효한 거래가 없었습니다.",
      impact: "재무 요약과 향후 전망을 계산하지 않았습니다.",
      action:
        "원본 데이터와 거래일·금액 컬럼을 확인하거나 직접 설정에서 선택을 수정해주세요.",
    };
  }

  return {
    id: kind,
    severity: "blocking",
    title: "Excel 파일을 읽을 수 없습니다.",
    description:
      "파일이 손상되었거나 지원되는 Excel 통합 문서로 해석되지 않았습니다.",
    impact: "파일을 분석하지 않았으며 재무 숫자를 표시하지 않습니다.",
    action:
      "파일이 .xlsx 또는 .xls인지 확인하고, Excel에서 파일을 다시 저장한 뒤 업로드해주세요.",
  };
}

export function createPartialAnalysisIssues(
  dataQuality: DataQualitySummary,
  amountCounts: AmountIssueCounts,
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  if (amountCounts.invalidAmountCount > 0) {
    issues.push({
      id: "invalidAmount",
      severity: "warning",
      title: `금액을 확인할 수 없는 거래 ${amountCounts.invalidAmountCount}건`,
      description: "입금 또는 출금 금액을 숫자로 해석하지 못했습니다.",
      impact:
        "해당 거래는 전체 거래 건수에는 포함되지만 입출금 합계·월별·카테고리·반복 거래 분석에서 제외됩니다.",
      action:
        "아래 거래 자동 분류 결과에서 ‘금액 확인 필요’ 행을 확인하고 Excel의 금액을 수정한 뒤 다시 업로드해주세요.",
      actionHref: "#transaction-classification",
    });
  }

  const unresolvedDirectionCount =
    amountCounts.unknownDirectionCount + amountCounts.directionConflictCount;

  if (unresolvedDirectionCount > 0) {
    issues.push({
      id: "unknownDirection",
      severity: "warning",
      title: `입금·출금 구분을 확인할 수 없는 거래 ${unresolvedDirectionCount}건`,
      description: `방향 미확정 ${amountCounts.unknownDirectionCount}건, 금액과 방향 충돌 ${amountCounts.directionConflictCount}건입니다.`,
      impact:
        "입금인지 출금인지 확정할 수 없어 해당 거래를 입출금 합계와 날짜 기반 분석에서 제외했습니다.",
      action:
        "아래 거래 자동 분류 결과의 원본 금액과 구분을 확인하고 Excel을 수정한 뒤 다시 업로드해주세요.",
      actionHref: "#transaction-classification",
    });
  }

  if (dataQuality.invalidDateCount > 0) {
    issues.push({
      id: "invalidDate",
      severity: "warning",
      title: `날짜를 확인할 수 없는 거래 ${dataQuality.invalidDateCount}건`,
      description: "거래일을 날짜로 해석하지 못했습니다.",
      impact:
        "금액이 정상인 거래는 전체 입출금에는 포함되지만 월별 현금흐름·반복거래·최근 잔액·향후 전망에서는 제외됩니다.",
      action:
        "아래 거래 자동 분류 결과에서 ‘날짜 확인 필요’ 행을 확인하고 Excel의 거래일을 수정한 뒤 다시 업로드해주세요.",
      actionHref: "#transaction-classification",
    });
  }

  if (amountCounts.columnConflictCount > 0) {
    issues.push({
      id: "columnConflict",
      severity: "warning",
      title: `금액 컬럼 값이 서로 다른 거래 ${amountCounts.columnConflictCount}건`,
      description:
        "입금·출금 분리 컬럼과 단일 금액 컬럼의 값이 일치하지 않았습니다.",
      impact:
        "거래를 제외하지 않고 기존 정책대로 입금·출금 분리 컬럼 값을 계산에 사용했습니다.",
      action:
        "아래 거래 자동 분류 결과에서 원본 컬럼 값을 확인하고 잘못된 값을 수정해주세요.",
      actionHref: "#transaction-classification",
    });
  }

  if (amountCounts.directionOverrideCount > 0) {
    issues.push({
      id: "directionOverride",
      severity: "warning",
      title: `금액 부호와 입출금 구분이 다른 거래 ${amountCounts.directionOverrideCount}건`,
      description: "금액 부호와 별도 입출금 구분 값이 서로 달랐습니다.",
      impact:
        "거래를 제외하지 않고 기존 정책대로 명시된 입출금 구분을 계산에 사용했습니다.",
      action:
        "아래 거래 자동 분류 결과에서 금액 부호와 입출금 구분을 확인해주세요.",
      actionHref: "#transaction-classification",
    });
  }

  return issues;
}

export function createAnalysisLimitationIssues({
  latestBalanceAvailable,
  recurringTransactionCount,
  storageAvailable,
}: {
  latestBalanceAvailable: boolean;
  recurringTransactionCount: number;
  storageAvailable: boolean;
}): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  if (!latestBalanceAvailable) {
    issues.push({
      id: "latestBalanceUnavailable",
      severity: "info",
      title: "향후 잔액 전망을 계산할 수 없습니다.",
      description:
        "유효한 거래일과 잔액을 함께 가진 거래가 없습니다.",
      impact:
        "입출금 분석은 확인할 수 있지만 향후 예상 월말잔액과 현금 위험 분석은 제공되지 않습니다.",
      action:
        "Excel에 잔액 컬럼이 있는지 확인하거나 자동 인식 수정에서 잔액 컬럼을 지정해주세요.",
    });
  } else if (recurringTransactionCount === 0) {
    issues.push({
      id: "recurringTransactionsInsufficient",
      severity: "info",
      title: "향후 3개월 전망을 계산하기 위한 반복 거래가 충분하지 않습니다.",
      description:
        "현재 엔진은 같은 거래가 서로 다른 2개월 이상에서 반복되어야 전망에 사용합니다.",
      impact:
        "현재 입출금과 상세 분석은 확인할 수 있지만 향후 전망과 현금 위험 분석은 제공되지 않습니다.",
      action:
        "2개월 이상의 거래내역인지 확인하고 거래내용·거래일 컬럼이 올바르게 인식됐는지 살펴봐주세요.",
    });
  }

  if (!storageAvailable) {
    issues.push({
      id: "localStorageUnavailable",
      severity: "info",
      title: "브라우저에 설정을 저장하지 못했습니다.",
      description:
        "브라우저 저장소를 사용할 수 없거나 저장 요청이 차단되었습니다.",
      impact:
        "현재 분석은 계속 사용할 수 있지만 새로고침 후 확정 예정 거래와 선택 예상 범위 설정이 복원되지 않을 수 있습니다.",
      action:
        "시크릿 모드나 저장소 차단 설정을 확인하거나 현재 화면을 닫기 전에 필요한 결과를 저장해주세요.",
    });
  }

  return issues;
}
