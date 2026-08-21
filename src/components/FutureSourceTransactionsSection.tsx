import { useMemo, useState } from "react";

import {
  partitionFutureSourceTransactionsByForecastMonths,
  type FutureSourceTransaction,
} from "../services/futureSourceTransaction";
import { formatCurrency } from "../utils/formatters";

export const DEFAULT_VISIBLE_FUTURE_TRANSACTION_COUNT = 10;

interface FutureSourceTransactionsSectionProps {
  transactions: FutureSourceTransaction[];
  forecastMonths: string[];
  excludedIds: ReadonlySet<string>;
  onInclusionChange: (id: string, included: boolean) => void;
}

interface FutureSourceTransactionsSectionViewProps
  extends FutureSourceTransactionsSectionProps {
  detailsOpen: boolean;
  expanded: boolean;
  onDetailsOpenChange: (open: boolean) => void;
  onExpandedChange: (expanded: boolean) => void;
}

export function FutureSourceTransactionsSectionView({
  transactions,
  forecastMonths,
  excludedIds,
  onInclusionChange,
  detailsOpen,
  expanded,
  onDetailsOpenChange,
  onExpandedChange,
}: FutureSourceTransactionsSectionViewProps) {
  const scope = useMemo(
    () =>
      partitionFutureSourceTransactionsByForecastMonths(
        transactions,
        forecastMonths,
        excludedIds,
      ),
    [excludedIds, forecastMonths, transactions],
  );
  const visibleTransactions = expanded
    ? transactions
    : transactions.slice(0, DEFAULT_VISIBLE_FUTURE_TRANSACTION_COUNT);
  const canExpand =
    transactions.length > DEFAULT_VISIBLE_FUTURE_TRANSACTION_COUNT;
  const forecastMonthSet = new Set(forecastMonths);

  if (transactions.length === 0) {
    return null;
  }

  return (
    <section
      className="mt-6 rounded-xl border border-blue-200 bg-blue-50/60 p-5"
      aria-labelledby="future-source-transactions-heading"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-blue-700">
            파일에서 자동 발견
          </p>
          <h3
            id="future-source-transactions-heading"
            className="mt-1 font-semibold text-slate-900"
          >
            미래 거래 {transactions.length.toLocaleString("ko-KR")}건
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-700" aria-live="polite">
            과거 실적에서는 제외하고 현재 3개월 전망에 {scope.included.length.toLocaleString("ko-KR")}건을 자동 반영했습니다.
          </p>
        </div>

        <button
          type="button"
          aria-controls="future-source-transaction-details"
          aria-expanded={detailsOpen}
          onClick={() => onDetailsOpenChange(!detailsOpen)}
          className="w-full rounded-md border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50 sm:w-auto"
        >
          {detailsOpen ? "자동 반영 내역 닫기" : "자동 반영 내역 보기"}
        </button>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-white p-3">
          <dt className="text-xs text-slate-500">예정 수입</dt>
          <dd className="mt-1 font-bold text-emerald-700">
            {formatCurrency(scope.includedIncome)}
          </dd>
        </div>
        <div className="rounded-lg bg-white p-3">
          <dt className="text-xs text-slate-500">예정 지출</dt>
          <dd className="mt-1 font-bold text-red-700">
            {formatCurrency(scope.includedExpense)}
          </dd>
        </div>
        <div className="rounded-lg bg-white p-3">
          <dt className="text-xs text-slate-500">현재 전망 기간 밖</dt>
          <dd className="mt-1 font-bold text-slate-900">
            {scope.outOfHorizon.length.toLocaleString("ko-KR")}건
          </dd>
        </div>
      </dl>

      {scope.excluded.length > 0 && (
        <p className="mt-3 text-sm text-slate-700" aria-live="polite">
          사용자가 전망에서 제외한 거래가 {scope.excluded.length.toLocaleString("ko-KR")}건 있습니다.
        </p>
      )}

      {detailsOpen && (
        <div id="future-source-transaction-details" className="mt-4">
          <p className="text-sm text-slate-600" aria-live="polite">
            전체 {transactions.length.toLocaleString("ko-KR")}건 중 {visibleTransactions.length.toLocaleString("ko-KR")}건 표시
          </p>

          <ul className="mt-3 space-y-3">
            {visibleTransactions.map((transaction) => {
              const inForecastHorizon = forecastMonthSet.has(
                transaction.date.slice(0, 7),
              );
              const isExcluded = excludedIds.has(transaction.id);
              const isIncluded = inForecastHorizon && !isExcluded;
              const status = !inForecastHorizon
                ? "현재 3개월 전망 미반영"
                : isExcluded
                  ? "전망에서 제외"
                  : "전망에 자동 반영";

              return (
                <li
                  key={transaction.id}
                  className="rounded-lg border border-blue-100 bg-white p-4"
                  data-future-source-row={transaction.sourceIndex}
                >
                  <div className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_5rem_8rem_auto] sm:items-center">
                    <span className="text-sm font-medium text-slate-900">
                      {transaction.date}
                    </span>
                    <span className="min-w-0 break-words text-sm text-slate-700">
                      {transaction.description || "내용 없음"}
                    </span>
                    <span className="text-sm text-slate-600">
                      {transaction.type === "income" ? "수입" : "지출"}
                    </span>
                    <span className="text-sm font-semibold text-slate-900 sm:text-right">
                      {formatCurrency(transaction.amount)}
                    </span>
                    <span className="text-xs font-medium text-blue-800">
                      {status}
                    </span>
                  </div>

                  {inForecastHorizon && (
                    <button
                      type="button"
                      aria-label={`${transaction.date} 미래 거래 ${isIncluded ? "전망에서 제외" : "전망에 포함"}`}
                      onClick={() =>
                        onInclusionChange(transaction.id, !isIncluded)
                      }
                      className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:w-auto"
                    >
                      {isIncluded ? "전망에서 제외" : "전망에 포함"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {canExpand && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => onExpandedChange(!expanded)}
              className="mt-3 w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:w-auto"
            >
              {expanded ? "미래 거래 접기" : "미래 거래 전체 보기"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default function FutureSourceTransactionsSection(
  props: FutureSourceTransactionsSectionProps,
) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <FutureSourceTransactionsSectionView
      {...props}
      detailsOpen={detailsOpen}
      expanded={expanded}
      onDetailsOpenChange={setDetailsOpen}
      onExpandedChange={setExpanded}
    />
  );
}
