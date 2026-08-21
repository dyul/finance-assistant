import type { NormalizedDate } from "../services/dateNormalizer";
import {
  isHistoricalPeriodInProgress,
  type HistoricalPeriodAggregation,
  type HistoricalPeriodUnit,
} from "../services/historicalPeriodAggregator";
import { formatCurrency, formatSignedCurrency } from "../utils/formatters";
import {
  DEFAULT_HISTORICAL_PERIOD_LIMITS,
  getVisibleHistoricalPeriods,
} from "./historicalPeriodPresentation";

const PERIOD_UNIT_CONTENT: Record<
  HistoricalPeriodUnit,
  { label: string; tableLabel: string }
> = {
  monthly: { label: "월별", tableLabel: "월별 과거 현금흐름" },
  quarterly: { label: "분기별", tableLabel: "분기별 과거 현금흐름" },
  yearly: { label: "연도별", tableLabel: "연도별 과거 현금흐름" },
};

export interface HistoricalCashFlowSectionViewProps {
  aggregation: HistoricalPeriodAggregation;
  referenceDate: NormalizedDate;
  unit: HistoricalPeriodUnit;
  expanded: boolean;
  onUnitChange: (unit: HistoricalPeriodUnit) => void;
  onExpandedChange: (expanded: boolean) => void;
}

export function HistoricalCashFlowSectionView({
  aggregation,
  referenceDate,
  unit,
  expanded,
  onUnitChange,
  onExpandedChange,
}: HistoricalCashFlowSectionViewProps) {
  const summaries = aggregation[unit];
  const visibleSummaries = getVisibleHistoricalPeriods(
    summaries,
    unit,
    expanded,
  );
  const limit = DEFAULT_HISTORICAL_PERIOD_LIMITS[unit];
  const canExpand = limit !== null && summaries.length > limit;
  const visibleExpenseSummaries = visibleSummaries.filter(
    (summary) => summary.expense > 0,
  );

  return (
    <section
      className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
      aria-labelledby="historical-cash-flow-heading"
    >
      <div>
        <h3
          id="historical-cash-flow-heading"
          className="font-semibold text-slate-900"
        >
          과거 현금흐름
        </h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          과거 거래를 월·분기·연도 기준으로 묶어 최근 흐름부터 보여줍니다.
        </p>
      </div>

      <div
        className="mt-4 grid grid-cols-3 gap-2 sm:inline-grid"
        role="group"
        aria-label="과거 현금흐름 기간 단위"
      >
        {(Object.keys(PERIOD_UNIT_CONTENT) as HistoricalPeriodUnit[]).map(
          (candidateUnit) => {
            const selected = unit === candidateUnit;
            return (
              <button
                key={candidateUnit}
                type="button"
                aria-pressed={selected}
                aria-controls="historical-cash-flow-table"
                onClick={() => onUnitChange(candidateUnit)}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  selected
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700"
                }`}
              >
                {PERIOD_UNIT_CONTENT[candidateUnit].label}
                {selected && <span className="sr-only"> (현재 선택)</span>}
              </button>
            );
          },
        )}
      </div>

      {aggregation.excludedInvalidDateCount > 0 && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          날짜를 확인할 수 없는 거래 {aggregation.excludedInvalidDateCount.toLocaleString("ko-KR")}건은 기간별 집계에서 제외했습니다. 해당 거래의 수입 {formatCurrency(aggregation.excludedInvalidDateIncome)}·지출 {formatCurrency(aggregation.excludedInvalidDateExpense)}은 기존 전체 합계 정책에는 포함될 수 있습니다.
        </p>
      )}

      {summaries.length === 0 ? (
        <p
          className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-600"
          role="status"
        >
          날짜를 확인할 수 있는 거래가 없어 기간별 현금흐름을 표시할 수 없습니다.
        </p>
      ) : (
        <>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            기간말 잔액은 해당 기간 안에서 파일로 확인되는 가장 최근 거래의 잔액입니다. 잔액 정보가 없으면 —로 표시합니다.
          </p>
          <div
            id="historical-cash-flow-table"
            className="mt-3 overflow-x-auto rounded-lg border border-slate-200"
          >
            <table
              className="w-full min-w-[820px] text-sm"
              aria-label={PERIOD_UNIT_CONTENT[unit].tableLabel}
            >
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left">기간</th>
                  <th scope="col" className="px-4 py-3 text-right">수입</th>
                  <th scope="col" className="px-4 py-3 text-right">지출</th>
                  <th scope="col" className="px-4 py-3 text-right">순현금흐름</th>
                  <th scope="col" className="px-4 py-3 text-right">기간말 잔액</th>
                  <th scope="col" className="px-4 py-3 text-right">거래 건수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {visibleSummaries.map((summary) => (
                  <tr key={summary.periodKey}>
                    <td className="px-4 py-3 font-medium">
                      <span>{summary.label}</span>
                      {isHistoricalPeriodInProgress(summary, referenceDate) && (
                        <span className="ml-2 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                          진행 중
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-700">
                      {formatCurrency(summary.income)}
                    </td>
                    <td className="px-4 py-3 text-right text-red-700">
                      {formatCurrency(summary.expense)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        summary.netCashFlow >= 0
                          ? "text-emerald-700"
                          : "text-red-700"
                      }`}
                    >
                      {formatSignedCurrency(summary.netCashFlow)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {summary.closingBalance === null
                        ? "—"
                        : formatCurrency(summary.closingBalance)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {summary.transactionCount.toLocaleString("ko-KR")}건
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canExpand && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls="historical-cash-flow-table historical-major-expense-table"
                onClick={() => onExpandedChange(!expanded)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"
              >
                {expanded ? "접기" : `전체 기간 보기 (${summaries.length.toLocaleString("ko-KR")}개)`}
              </button>
            </div>
          )}

          <div className="mt-6">
            <h4 className="font-semibold text-slate-900">기간별 주요 지출</h4>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              각 기간의 총지출과 가장 큰 지출 카테고리를 한 행으로 요약합니다. 전체 카테고리 합계는 아래 카테고리별 지출 분석에서 확인할 수 있습니다.
            </p>
            {visibleExpenseSummaries.length > 0 ? (
              <div
                id="historical-major-expense-table"
                className="mt-3 overflow-x-auto rounded-lg border border-slate-200"
              >
                <table
                  className="w-full min-w-[680px] text-sm"
                  aria-label={`${PERIOD_UNIT_CONTENT[unit].label} 주요 지출`}
                >
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left">기간</th>
                      <th scope="col" className="px-4 py-3 text-right">총지출</th>
                      <th scope="col" className="px-4 py-3 text-left">가장 큰 지출 카테고리</th>
                      <th scope="col" className="px-4 py-3 text-right">금액</th>
                      <th scope="col" className="px-4 py-3 text-right">비중</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {visibleExpenseSummaries.map((summary) => (
                      <tr key={summary.periodKey}>
                        <td className="px-4 py-3 font-medium">{summary.label}</td>
                        <td className="px-4 py-3 text-right text-red-700">
                          {formatCurrency(summary.expense)}
                        </td>
                        <td className="px-4 py-3">
                          {summary.topExpense?.categoryName ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-red-700">
                          {summary.topExpense
                            ? formatCurrency(summary.topExpense.amount)
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {summary.topExpense
                            ? `${summary.topExpense.shareOfPeriodExpense.toFixed(1)}%`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                선택한 기간에 지출 내역이 없습니다.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
