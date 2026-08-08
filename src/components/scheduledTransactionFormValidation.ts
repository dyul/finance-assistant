import { formatMonth } from "../utils/formatters";

export interface ScheduledTransactionFormErrors {
  date?: string;
  description?: string;
  amount?: string;
}

export function validateScheduledTransactionForm({
  date,
  description,
  amountText,
  forecastMonths,
}: {
  date: string;
  description: string;
  amountText: string;
  forecastMonths: string[];
}): ScheduledTransactionFormErrors {
  const errors: ScheduledTransactionFormErrors = {};
  const trimmedDescription = description.trim();
  const trimmedAmount = amountText.trim();

  if (!date) {
    errors.date = "예정일을 선택해주세요.";
  } else if (!forecastMonths.includes(date.slice(0, 7))) {
    errors.date = `예정일은 3개월 전망 기간(${forecastMonths
      .map(formatMonth)
      .join(", ")}) 안에서 선택해주세요.`;
  }

  if (!trimmedDescription) {
    errors.description = "거래 내용을 입력해주세요.";
  }

  if (!trimmedAmount) {
    errors.amount = "금액을 입력해주세요.";
  } else {
    const amount = Number(trimmedAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      errors.amount = "금액은 0원보다 큰 숫자로 입력해주세요.";
    }
  }

  return errors;
}
