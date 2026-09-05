import type { FormEvent } from "react";

import type { NormalizedDate } from "../services/dateNormalizer";
import type {
  HistoricalRangeAnalysis,
  HistoricalRangeMode,
  HistoricalRangeState,
} from "../services/historicalRangeAnalyzer";
import {
  isHistoricalPeriodInProgress,
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
  analysis: HistoricalRangeAnalysis;
  rangeState: HistoricalRangeState;
  referenceDate: NormalizedDate;
  unit: HistoricalPeriodUnit;
  expanded: boolean;
  onRangeModeChange: (mode: HistoricalRangeMode) => void;
  onDraftStartDateChange: (value: string) => void;
  onDraftEndDateChange: (value: string) => void;
  onRangeApply: () => void;
  onUnitChange: (unit: HistoricalPeriodUnit) => void;
  onExpandedChange: (expanded: boolean) => void;
}

function formatDateLabel(date: NormalizedDate): string {
  return date.replaceAll("-", ".");
}

export function HistoricalCashFlowSectionView({
  analysis,
  rangeState,
  referenceDate,
  unit,
  expanded,
  onRangeModeChange,
  onDraftStartDateChange,
  onDraftEndDateChange,
  onRangeApply,
  onUnitChange,
  onExpandedChange,
}: HistoricalCashFlowSectionViewProps) {
  const { aggregation } = analysis;
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
  const rangeIncludesReferenceDate =
    analysis.range === null ||
    (analysis.range.startDate <= referenceDate &&
      analysis.range.endDate >= referenceDate);
  const appliedRangeLabel = analysis.range
    ? `${formatDateLabel(analysis.range.startDate)} ~ ${formatDateLabel(analysis.range.endDate)}`
    : analysis.dataRange
      ? `${formatDateLabel(analysis.dataRange.startDate)} ~ ${formatDateLabel(analysis.dataRange.endDate)}`
      : "날짜 확인 가능한 거래 없음";

  function handleRangeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onRangeApply();
  }

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

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
        <p className="text-sm font-semibold text-slate-900">분석 기간</p>
        <div
          className="mt-2 grid grid-cols-2 gap-2 sm:inline-grid"
          role="group"
          aria-label="과거 현금흐름 분석 기간"
        >
          {(["all", "custom"] as const).map((mode) => {
            const selected = rangeState.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={selected}
                aria-controls="historical-range-controls historical-range-results"
                onClick={() => onRangeModeChange(mode)}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  selected
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700"
                }`}
              >
                {mode === "all" ? "전체 기간" : "직접 설정"}
                {selected && <span className="sr-only"> (현재 선택)</span>}
              </button>
            );
          })}
        </div>

        {rangeState.mode === "custom" && (
          <form
            id="historical-range-controls"
            className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
            onSubmit={handleRangeSubmit}
          >
            <label className="min-w-0 text-sm font-medium text-slate-700">
              시작일
              <input
                type="date"
                value={rangeState.draftStartDate}
                max={referenceDate}
                aria-invalid={rangeState.error !== null}
                aria-describedby={
                  rangeState.error
                    ? "historical-range-help historical-range-error"
                    : "historical-range-help"
                }
                onChange={(event) => onDraftStartDateChange(event.target.value)}
                className="mt-1 block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              />
            </label>
            <label className="min-w-0 text-sm font-medium text-slate-700">
              종료일
              <input
                type="date"
                value={rangeState.draftEndDate}
                max={referenceDate}
                aria-invalid={rangeState.error !== null}
                aria-describedby={
                  rangeState.error
                    ? "historical-range-help historical-range-error"
                    : "historical-range-help"
                }
                onChange={(event) => onDraftEndDateChange(event.target.value)}
                className="mt-1 block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto"
            >
              적용
            </button>
          </form>
        )}

        <p id="historical-range-help" className="mt-2 text-xs leading-5 text-slate-500">
          {analysis.dataRange
            ? `데이터 범위: ${formatDateLabel(analysis.dataRange.startDate)} ~ ${formatDateLabel(analysis.dataRange.endDate)}`
            : "날짜를 확인할 수 있는 거래가 없습니다."}
        </p>
        {rangeState.error && (
          <p
            id="historical-range-error"
            className="mt-2 text-sm font-medium text-red-700"
            role="alert"
          >
            {rangeState.error}
          </p>
        )}
      </div>

      <div id="historical-range-results" className="mt-4" aria-live="polite">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h4 className="font-semibold text-slate-900">
            {analysis.range ? "선택 기간 요약" : "전체 기간 요약"}
          </h4>
          <p className="text-sm font-medium text-slate-600">
            {appliedRangeLabel}
          </p>
        </div>

        {analysis.isEmpty ? (
          <p
            className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-600"
            role="status"
          >
            {analysis.range
              ? "선택한 기간에 분석할 거래내역이 없습니다."
              : "날짜를 확인할 수 있는 거래내역이 없습니다."}
          </p>
        ) : (
          <>
            <dl className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
              <div className="rounded-lg border border-slate-200 p-3">
                <dt className="text-xs text-slate-500">수입</dt>
                <dd className="mt-1 font-semibold text-emerald-700">
                  {formatCurrency(analysis.summary.income)}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <dt className="text-xs text-slate-500">지출</dt>
                <dd className="mt-1 font-semibold text-red-700">
                  {formatCurrency(analysis.summary.expense)}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <dt className="text-xs text-slate-500">순현금흐름</dt>
                <dd
                  className={`mt-1 font-semibold ${
                    analysis.summary.netCashFlow >= 0
                      ? "text-emerald-700"
                      : "text-red-700"
                  }`}
                >
                  {formatSignedCurrency(analysis.summary.netCashFlow)}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <dt className="text-xs text-slate-500">거래 건수</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {analysis.summary.transactionCount.toLocaleString("ko-KR")}건
                </dd>
              </div>
              <div className="col-span-2 rounded-lg border border-slate-200 p-3 lg:col-span-1">
                <dt className="text-xs text-slate-500">기간말 잔액</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {analysis.summary.closingBalance === null
                    ? "—"
                    : formatCurrency(analysis.summary.closingBalance)}
                </dd>
              </div>
            </dl>
            {analysis.topExpense && (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                가장 큰 지출 카테고리: {analysis.topExpense.categoryName} {formatCurrency(analysis.topExpense.amount)} ({analysis.topExpense.shareOfExpense.toFixed(1)}%)
              </p>
            )}
          </>
        )}

        {analysis.range && (
          <p className="mt-2 text-xs leading-5 text-slate-500">
            직접 설정한 기간에서는 선택 범위에 포함된 거래만 아래 월·분기·연도 표와 카테고리 분석에 집계합니다. Forecast·잔액 추이 그래프·PDF는 전체 분석 기준입니다.
          </p>
        )}
      </div>

      <p className="mt-4 text-sm font-semibold text-slate-900">집계 단위</p>
      <div
        className="mt-2 grid grid-cols-3 gap-2 sm:inline-grid"
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
          {analysis.range
            ? "선택한 기간에 분석할 거래내역이 없습니다."
            : "날짜를 확인할 수 있는 거래가 없어 기간별 현금흐름을 표시할 수 없습니다."}
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
                      {rangeIncludesReferenceDate &&
                        isHistoricalPeriodInProgress(summary, referenceDate) && (
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
