import { useState } from "react";

import type { NormalizedDate } from "../services/dateNormalizer";
import type { Transaction } from "../services/transactionParser";
import { formatCurrency } from "../utils/formatters";
import {
  TRANSACTION_DISPLAY_PAGE_SIZE,
  getExpandedTransactionLimit,
  getVisibleTransactionRows,
} from "./transactionTablePresentation";

function formatOriginalAmountValues(
  values: Transaction["originalAmountValues"],
): string {
  return [
    `입금 ${values.income ?? "없음"}`,
    `출금 ${values.expense ?? "없음"}`,
    `금액 ${values.amount ?? "없음"}`,
    `구분 ${values.direction ?? "없음"}`,
  ].join(", ");
}

export function TransactionDateValue({
  date,
}: Pick<Transaction, "date">) {
  if (date !== null) {
    return date;
  }

  return (
    <span className="font-medium text-amber-700">
      날짜 확인 필요
    </span>
  );
}

type TransactionAmountCellsProps = Pick<
  Transaction,
  "income" | "expense" | "amountStatus" | "originalAmountValues"
>;

export function TransactionAmountCells(
  item: TransactionAmountCellsProps,
) {
  if (item.income === null || item.expense === null) {
    return (
      <td
        className="px-4 py-3 text-right text-amber-700"
        colSpan={2}
      >
        <p className="font-medium">
          {item.amountStatus === "unknownDirection"
            ? "입출금 구분 확인 필요"
            : item.amountStatus === "directionConflict"
              ? "금액과 입출금 구분 확인 필요"
              : "금액 확인 필요"}
        </p>

        <p className="mt-1 text-xs text-amber-600">
          원본: {formatOriginalAmountValues(item.originalAmountValues)}
        </p>
      </td>
    );
  }

  return (
    <>
      <td className="px-4 py-3 text-right text-emerald-700">
        {item.income > 0 ? formatCurrency(item.income) : "-"}
      </td>

      <td className="px-4 py-3 text-right text-red-700">
        {item.expense > 0 ? formatCurrency(item.expense) : "-"}
      </td>
    </>
  );
}

export default function TransactionClassificationTable({
  transactions,
  referenceDate,
  initialVisibleCount = TRANSACTION_DISPLAY_PAGE_SIZE,
}: {
  transactions: Transaction[];
  referenceDate: NormalizedDate;
  initialVisibleCount?: number;
}) {
  const [baseVisibleCount, setBaseVisibleCount] = useState(() =>
    Math.min(transactions.length, initialVisibleCount),
  );
  const visibleRows = getVisibleTransactionRows(
    transactions,
    baseVisibleCount,
    referenceDate,
  );
  const hasReviewRowsOutsideBase =
    visibleRows.length > baseVisibleCount;

  return (
    <div id="transaction-classification" className="mt-6 scroll-mt-4">
      <h3 className="font-semibold text-slate-900">
        거래 자동 분류 결과
      </h3>
      <p className="mt-1 text-sm text-slate-600" aria-live="polite">
        전체 {transactions.length.toLocaleString("ko-KR")}건 중{" "}
        {visibleRows.length.toLocaleString("ko-KR")}건 표시
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        기간 설정과 관계없이 날짜·금액 확인이 필요한 거래를 포함한 전체 파일 기준입니다.
      </p>
      {hasReviewRowsOutsideBase && (
        <p className="mt-1 text-xs leading-5 text-amber-700">
          확인이 필요한 거래는 현재 표시 범위 밖에 있어도 함께 표시합니다.
        </p>
      )}

      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[750px] text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">거래일</th>
              <th className="px-4 py-3 text-left">적요</th>
              <th className="px-4 py-3 text-left">분류</th>
              <th className="px-4 py-3 text-right">입금</th>
              <th className="px-4 py-3 text-right">출금</th>
            </tr>
          </thead>

          <tbody>
            {visibleRows.map(({ transaction, sourceIndex }) => (
              <tr
                key={`${transaction.date}-${transaction.description}-${sourceIndex}`}
                className="border-t border-slate-200"
                data-transaction-row={sourceIndex}
              >
                <td className="px-4 py-3">
                  <TransactionDateValue date={transaction.date} />
                </td>

                <td className="px-4 py-3">
                  {transaction.description}

                  {transaction.amountStatus === "columnConflict" && (
                    <p className="mt-1 text-xs font-medium text-amber-700">
                      단일 금액과 불일치 — 분리 컬럼 적용
                    </p>
                  )}

                  {transaction.amountStatus === "directionOverride" && (
                    <p className="mt-1 text-xs font-medium text-amber-700">
                      금액 부호와 불일치 — 입출금 구분 적용
                    </p>
                  )}
                </td>

                <td className="px-4 py-3">
                  {transaction.categoryName}
                </td>

                <TransactionAmountCells {...transaction} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {baseVisibleCount < transactions.length && (
          <button
            type="button"
            onClick={() =>
              setBaseVisibleCount((currentLimit) =>
                getExpandedTransactionLimit(
                  currentLimit,
                  transactions.length,
                ),
              )
            }
            className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:w-auto"
          >
            50건 더 보기
          </button>
        )}

        {baseVisibleCount > TRANSACTION_DISPLAY_PAGE_SIZE && (
          <button
            type="button"
            onClick={() =>
              setBaseVisibleCount(
                Math.min(
                  transactions.length,
                  TRANSACTION_DISPLAY_PAGE_SIZE,
                ),
              )
            }
            className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:w-auto"
          >
            접기
          </button>
        )}
      </div>
    </div>
  );
}
