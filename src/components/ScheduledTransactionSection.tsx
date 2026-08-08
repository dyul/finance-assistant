import { useState, type FormEvent } from "react";

import type { ScheduledTransaction } from "../services/scheduledTransaction";
import { formatCurrency, formatMonth } from "../utils/formatters";

interface ScheduledTransactionSectionProps {
  forecastMonths: string[];
  scheduledTransactions: ScheduledTransaction[];
  outOfPeriodCount: number;
  storageAvailable: boolean;
  onAdd: (transaction: ScheduledTransaction) => void;
  onRemove: (id: string) => void;
  onReset: () => void;
}

export default function ScheduledTransactionSection({
  forecastMonths,
  scheduledTransactions,
  outOfPeriodCount,
  storageAvailable,
  onAdd,
  onRemove,
  onReset,
}: ScheduledTransactionSectionProps) {
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledDescription, setScheduledDescription] = useState("");
  const [scheduledType, setScheduledType] =
    useState<ScheduledTransaction["type"]>("expense");
  const [scheduledAmount, setScheduledAmount] = useState("");
  const [scheduledError, setScheduledError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScheduledError("");

    const description = scheduledDescription.trim();
    const amount = Number(scheduledAmount);
    const scheduledMonth = scheduledDate.slice(0, 7);

    if (!scheduledDate || !description || scheduledAmount.trim() === "") {
      setScheduledError("예정일, 내용, 금액을 모두 입력해주세요.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setScheduledError("금액은 0원보다 큰 숫자로 입력해주세요.");
      return;
    }

    if (!forecastMonths.includes(scheduledMonth)) {
      setScheduledError(
        `예정일은 Forecast 기간(${forecastMonths
          .map(formatMonth)
          .join(", ")}) 안에서 선택해주세요.`,
      );
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
  }

  return (
    <section className="mt-6" aria-labelledby="scheduled-heading">
      <div className="mb-3">
        <h3 id="scheduled-heading" className="font-semibold text-slate-900">
          확정 예정 거래
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          향후 3개월 안에 확정된 입금이나 출금을 추가하면 Forecast와 현금
          위험도가 바로 다시 계산됩니다.
        </p>

        <div className="mt-3 flex flex-col gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900 sm:flex-row sm:items-center sm:justify-between">
          <p className="leading-6">
            예정거래와 시나리오 선택은 파일별로 이 브라우저에 자동
            저장됩니다. 원본 Excel 거래내역과 분석 결과는 브라우저 저장소에
            저장하지 않습니다.
          </p>
          <button
            type="button"
            onClick={() => {
              onReset();
              setScheduledError("");
            }}
            className="shrink-0 rounded-md border border-blue-200 bg-white px-3 py-2 font-semibold text-blue-800 transition hover:bg-blue-100"
          >
            이 파일 설정 초기화
          </button>
        </div>

        {!storageAvailable && (
          <p
            className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800"
            role="status"
          >
            브라우저 저장소를 사용할 수 없어 설정은 현재 화면에서만
            유지됩니다. 재무 분석 기능은 계속 사용할 수 있습니다.
          </p>
        )}
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
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
            />
          </label>
          <label className="text-sm font-medium text-slate-700 lg:col-span-2">
            내용
            <input
              type="text"
              value={scheduledDescription}
              onChange={(event) => setScheduledDescription(event.target.value)}
              placeholder="예: 거래처 대금 입금"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
            />
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
              placeholder="0"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-right text-slate-900"
            />
          </label>
        </div>

        {scheduledError && (
          <p className="mt-3 text-sm font-medium text-red-700" role="alert">
            {scheduledError}
          </p>
        )}

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
          저장된 예정거래 중 현재 Forecast 기간 밖인 거래가 {outOfPeriodCount}
          건 있습니다. 목록에는 유지하지만 이번 Forecast 계산에서는
          제외했습니다.
        </p>
      )}

      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
        {scheduledTransactions.length === 0 ? (
          <p className="bg-white px-4 py-5 text-sm text-slate-500">
            추가된 확정 예정 거래가 없습니다.
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
                          setScheduledError("");
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
