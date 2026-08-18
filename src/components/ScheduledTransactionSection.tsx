import { useState, type FormEvent } from "react";

import type { ScheduledTransaction } from "../services/scheduledTransaction";
import { formatCurrency } from "../utils/formatters";
import {
  validateScheduledTransactionForm,
  type ScheduledTransactionFormErrors,
} from "./scheduledTransactionFormValidation";

interface ScheduledTransactionSectionProps {
  forecastMonths: string[];
  scheduledTransactions: ScheduledTransaction[];
  outOfPeriodCount: number;
  onAdd: (transaction: ScheduledTransaction) => void;
  onRemove: (id: string) => void;
  onReset: () => void;
}

export default function ScheduledTransactionSection({
  forecastMonths,
  scheduledTransactions,
  outOfPeriodCount,
  onAdd,
  onRemove,
  onReset,
}: ScheduledTransactionSectionProps) {
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledDescription, setScheduledDescription] = useState("");
  const [scheduledType, setScheduledType] =
    useState<ScheduledTransaction["type"]>("expense");
  const [scheduledAmount, setScheduledAmount] = useState("");
  const [scheduledErrors, setScheduledErrors] =
    useState<ScheduledTransactionFormErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const description = scheduledDescription.trim();
    const amount = Number(scheduledAmount);
    const errors = validateScheduledTransactionForm({
      date: scheduledDate,
      description,
      amountText: scheduledAmount,
      forecastMonths,
    });

    setScheduledErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    onAdd({
      id: crypto.randomUUID(),
      date: scheduledDate,
      description,
      type: scheduledType,
      amount,
    });
    setScheduledDate("");
    setScheduledDescription("");
    setScheduledType("expense");
    setScheduledAmount("");
    setScheduledErrors({});
  }

  return (
    <section className="mt-6" aria-labelledby="scheduled-heading">
      <div className="mb-3">
        <h3 id="scheduled-heading" className="font-semibold text-slate-900">
          확정 예정 거래
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          향후 3개월 안에 확정된 입금이나 출금을 추가하면 예상 잔액과 자금
          부족 가능성이 바로 다시 계산됩니다.
        </p>

        <div className="mt-3 flex flex-col gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900 sm:flex-row sm:items-center sm:justify-between">
          <p className="leading-6">
            확정 예정 거래와 선택 예상 범위는 파일별로 이 브라우저에 자동
            저장됩니다. 원본 파일 거래내역과 분석 결과는 브라우저 저장소에
            저장하지 않습니다.
          </p>
          <button
            type="button"
            onClick={() => {
              onReset();
              setScheduledErrors({});
            }}
            className="shrink-0 rounded-md border border-blue-200 bg-white px-3 py-2 font-semibold text-blue-800 transition hover:bg-blue-100"
          >
            이 파일 설정 초기화
          </button>
        </div>

      </div>

      <form
        className="rounded-lg border border-slate-200 bg-slate-50 p-4"
        onSubmit={handleSubmit}
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm font-medium text-slate-700">
            예정일
            <input
              type="date"
              value={scheduledDate}
              onChange={(event) => setScheduledDate(event.target.value)}
              aria-describedby={
                scheduledErrors.date ? "scheduled-date-error" : undefined
              }
              aria-invalid={Boolean(scheduledErrors.date)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
            />
            {scheduledErrors.date && (
              <span
                id="scheduled-date-error"
                className="mt-1 block text-xs font-medium leading-5 text-red-700"
              >
                {scheduledErrors.date}
              </span>
            )}
          </label>
          <label className="text-sm font-medium text-slate-700 lg:col-span-2">
            내용
            <input
              type="text"
              value={scheduledDescription}
              onChange={(event) => setScheduledDescription(event.target.value)}
              aria-describedby={
                scheduledErrors.description
                  ? "scheduled-description-error"
                  : undefined
              }
              aria-invalid={Boolean(scheduledErrors.description)}
              placeholder="예: 거래처 대금 입금"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
            />
            {scheduledErrors.description && (
              <span
                id="scheduled-description-error"
                className="mt-1 block text-xs font-medium leading-5 text-red-700"
              >
                {scheduledErrors.description}
              </span>
            )}
          </label>
          <label className="text-sm font-medium text-slate-700">
            입금/출금
            <select
              value={scheduledType}
              onChange={(event) =>
                setScheduledType(
                  event.target.value as ScheduledTransaction["type"],
                )
              }
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
            >
              <option value="income">입금</option>
              <option value="expense">출금</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            금액
            <input
              type="number"
              min="1"
              step="1"
              value={scheduledAmount}
              onChange={(event) => setScheduledAmount(event.target.value)}
              aria-describedby={
                scheduledErrors.amount ? "scheduled-amount-error" : undefined
              }
              aria-invalid={Boolean(scheduledErrors.amount)}
              placeholder="0"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-right text-slate-900"
            />
            {scheduledErrors.amount && (
              <span
                id="scheduled-amount-error"
                className="mt-1 block text-xs font-medium leading-5 text-red-700"
              >
                {scheduledErrors.amount}
              </span>
            )}
          </label>
        </div>

        <button
          type="submit"
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          추가
        </button>
      </form>

      {outOfPeriodCount > 0 && (
        <p
          className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800"
          role="status"
        >
          저장된 확정 예정 거래 중 현재 3개월 전망 기간 밖인 거래가
          {" "}
          {outOfPeriodCount}건 있습니다. 목록에는 유지하지만 이번 전망에서는
          제외했습니다.
          전망에 포함하려면 기존 거래를 삭제하고 위 기간 안의 날짜로 다시
          추가해주세요.
        </p>
      )}

      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
        {scheduledTransactions.length === 0 ? (
          <p className="bg-white px-4 py-5 text-sm text-slate-500">
            추가된 확정 예정 거래가 없습니다. 확정된 거래가 없다면 추가하지
            않아도 됩니다.
          </p>
        ) : (
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">예정일</th>
                <th className="px-4 py-3 font-medium">내용</th>
                <th className="px-4 py-3 font-medium">유형</th>
                <th className="px-4 py-3 text-right font-medium">금액</th>
                <th className="px-4 py-3 text-right font-medium">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {[...scheduledTransactions]
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="px-4 py-3">{transaction.date}</td>
                    <td className="px-4 py-3 font-medium">
                      {transaction.description}
                    </td>
                    <td className="px-4 py-3">
                      {transaction.type === "income" ? "입금" : "출금"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        transaction.type === "income"
                          ? "text-emerald-700"
                          : "text-red-700"
                      }`}
                    >
                      {formatCurrency(transaction.amount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          onRemove(transaction.id);
                          setScheduledErrors({});
                        }}
                        className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
