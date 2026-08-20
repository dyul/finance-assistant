import { parseMoney } from "./amountNormalizer";

export type ForecastStartingBalanceSource = "file" | "manual" | null;

export type ManualBalanceParseResult =
  | { valid: true; value: number }
  | { valid: false; message: string };

export interface ResolvedForecastStartingBalance {
  value: number | null;
  source: ForecastStartingBalanceSource;
}

export type ManualBalanceSessionAction =
  | { type: "apply"; balance: number }
  | { type: "clear" }
  | { type: "newFile" }
  | { type: "sameFileReanalyzed" }
  | { type: "fileSettingsReset" };

export function manualBalanceSessionReducer(
  currentBalance: number | null,
  action: ManualBalanceSessionAction,
): number | null {
  if (action.type === "apply") {
    return action.balance;
  }

  if (action.type === "sameFileReanalyzed") {
    return currentBalance;
  }

  return null;
}

export function parseManualCurrentBalance(
  input: string,
): ManualBalanceParseResult {
  const parsed = parseMoney(input);

  if (parsed.kind === "missing") {
    return {
      valid: false,
      message: "현재 잔액을 입력해주세요.",
    };
  }

  if (parsed.kind === "invalid") {
    return {
      valid: false,
      message: "숫자로 확인할 수 있는 현재 잔액을 입력해주세요.",
    };
  }

  if (!Number.isSafeInteger(parsed.value)) {
    return {
      valid: false,
      message: "안전하게 계산할 수 있는 원 단위 정수 금액을 입력해주세요.",
    };
  }

  return { valid: true, value: parsed.value };
}

export function resolveForecastStartingBalance(
  fileLatestBalance: number | null,
  manualCurrentBalance: number | null,
): ResolvedForecastStartingBalance {
  if (fileLatestBalance !== null) {
    return { value: fileLatestBalance, source: "file" };
  }

  if (manualCurrentBalance !== null) {
    return { value: manualCurrentBalance, source: "manual" };
  }

  return { value: null, source: null };
}
