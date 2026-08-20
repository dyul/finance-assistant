import { useState } from "react";

import type { RecurringTransaction } from "../services/recurringTransactionDetector";
import { formatCurrency, formatMonth } from "../utils/formatters";

const DEFAULT_VISIBLE_RECURRING_COUNT = 10;

interface RecurringTransactionsTableViewProps {
  recurringTransactions: RecurringTransaction[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

export function RecurringTransactionsTableView({
  recurringTransactions,
  expanded,
  onExpandedChange,
}: RecurringTransactionsTableViewProps) {
  const visibleTransactions = expanded
    ? recurringTransactions
    : recurringTransactions.slice(0, DEFAULT_VISIBLE_RECURRING_COUNT);
  const canToggle =
    recurringTransactions.length > DEFAULT_VISIBLE_RECURRING_COUNT;

  return (
    <div className="mt-6">
      <h3 className="font-semibold text-slate-900">
        반복 거래 분석
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        총 {recurringTransactions.length.toLocaleString("ko-KR")}개의 반복
        패턴을 찾았습니다.
      </p>
      <p className="mt-1 text-sm text-slate-600" aria-live="polite">
        전체 {recurringTransactions.length.toLocaleString("ko-KR")}개 중{" "}
        {visibleTransactions.length.toLocaleString("ko-KR")}개 표시
      </p>

      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">거래내용</th>
              <th className="px-4 py-3 font-medium">유형</th>
              <th className="px-4 py-3 font-medium">분류</th>
              <th className="px-4 py-3 text-right font-medium">
                평균금액
              </th>
              <th className="px-4 py-3 text-right font-medium">
                발생월
              </th>
              <th className="px-4 py-3 font-medium">기간</th>
              <th className="px-4 py-3 font-medium">신뢰도</th>
            </tr>
          </thead>

          <tbody
            id="recurring-transactions-table-body"
            className="divide-y divide-slate-200 bg-white"
          >
            {visibleTransactions.map((item, index) => (
              <tr
                key={`${item.description}-${item.type}-${index}`}
                data-recurring-row={index}
              >
                <td className="px-4 py-3 font-medium">
                  {item.description}
                </td>

                <td className="px-4 py-3">
                  {item.type === "income" ? "수입" : "지출"}
                </td>

                <td className="px-4 py-3">{item.categoryName}</td>

                <td className="px-4 py-3 text-right">
                  {formatCurrency(item.averageAmount)}
                </td>

                <td className="px-4 py-3 text-right">
                  {item.activeMonthCount}개월
                </td>

                <td className="px-4 py-3">
                  {formatMonth(item.firstMonth)} ~ {formatMonth(item.lastMonth)}
                </td>

                <td className="px-4 py-3">
                  {item.confidence === "high" ? "높음" : "보통"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canToggle && (
        <button
          type="button"
          aria-controls="recurring-transactions-table-body"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
          className="mt-3 w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:w-auto"
        >
          {expanded ? "반복 거래 접기" : "반복 거래 전체 보기"}
        </button>
      )}
    </div>
  );
}

export default function RecurringTransactionsTable({
  recurringTransactions,
}: {
  recurringTransactions: RecurringTransaction[];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <RecurringTransactionsTableView
      recurringTransactions={recurringTransactions}
      expanded={expanded}
      onExpandedChange={setExpanded}
    />
  );
}
