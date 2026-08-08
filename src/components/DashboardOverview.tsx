import type { ForecastSummary } from "../services/forecastPresentation";
import type { ForecastScenario } from "../services/forecastScenario";
import type { MonthlySummary } from "../services/monthlyAggregator";
import {
  formatCurrency,
  formatMonth,
  formatSignedCurrency,
} from "../utils/formatters";
import { FORECAST_SCENARIO_CONTENT } from "./forecastScenarioContent";

interface DashboardOverviewProps {
  latestBalance: number | null;
  latestMonthlySummary: MonthlySummary | null;
  forecastSummary: ForecastSummary;
  selectedScenario: ForecastScenario;
}

function getAmountStyle(value: number | null): string {
  if (value === null) {
    return "text-slate-700";
  }

  return value >= 0 ? "text-emerald-700" : "text-red-700";
}

export default function DashboardOverview({
  latestBalance,
  latestMonthlySummary,
  forecastSummary,
  selectedScenario,
}: DashboardOverviewProps) {
  const scenarioLabel = FORECAST_SCENARIO_CONTENT[selectedScenario].label;
  const hasShortage = forecastSummary.negativeMonthCount > 0;

  return (
    <section
      className="mt-6 rounded-xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5"
      aria-labelledby="dashboard-overview-heading"
    >
      <div>
        <p className="text-xs font-semibold tracking-wide text-blue-700">
          핵심 결과
        </p>
        <h3
          id="dashboard-overview-heading"
          className="mt-1 text-lg font-bold text-slate-900"
        >
          한눈에 보는 현금 상태
        </h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          현재 상태를 확인한 뒤 3개월 전망과 필요한 행동을 살펴보세요.
        </p>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <dt className="text-sm font-medium text-slate-600">현재 잔액</dt>
          <dd
            className={`mt-2 break-words text-xl font-bold tabular-nums ${getAmountStyle(latestBalance)}`}
            data-overview="current-balance"
          >
            {latestBalance === null
              ? "확인할 수 없음"
              : formatCurrency(latestBalance)}
          </dd>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {latestBalance === null
              ? "Excel에 잔액 컬럼이 있으면 현재 잔액과 향후 월말잔액을 계산할 수 있습니다."
              : "Excel에서 가장 최근 거래에 기록된 잔액입니다."}
          </p>
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <dt className="text-sm font-medium text-slate-600">
            최근 월 순현금흐름
          </dt>
          <dd
            className={`mt-2 break-words text-xl font-bold tabular-nums ${getAmountStyle(latestMonthlySummary?.netCashFlow ?? null)}`}
            data-overview="latest-net-cash-flow"
          >
            {latestMonthlySummary
              ? formatSignedCurrency(latestMonthlySummary.netCashFlow)
              : "확인할 수 없음"}
          </dd>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {latestMonthlySummary
              ? `${formatMonth(latestMonthlySummary.month)}에 들어온 돈에서 나간 돈을 뺀 금액입니다.`
              : "유효한 거래일이 있으면 최근 월 기준으로 계산합니다."}
          </p>
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <dt className="text-sm font-medium text-slate-600">
            3개월 후 예상 잔액
          </dt>
          <dd
            className={`mt-2 break-words text-xl font-bold tabular-nums ${getAmountStyle(forecastSummary.endingBalance)}`}
            data-overview="forecast-ending-balance"
          >
            {forecastSummary.endingBalance === null
              ? "계산할 수 없음"
              : formatCurrency(forecastSummary.endingBalance)}
          </dd>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            현재 선택한 {scenarioLabel} 예상 기준의 마지막 월 잔액입니다.
          </p>
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <dt className="text-sm font-medium text-slate-600">
            자금 부족 예상 여부
          </dt>
          <dd
            className={`mt-2 break-words text-xl font-bold ${
              forecastSummary.endingBalance === null
                ? "text-slate-700"
                : hasShortage
                  ? "text-amber-700"
                  : "text-emerald-700"
            }`}
            data-overview="cash-shortage-status"
          >
            {forecastSummary.endingBalance === null
              ? "계산할 수 없음"
              : hasShortage
                ? `${forecastSummary.negativeMonthCount}개월 예상`
                : "예상 없음"}
          </dd>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            예상 월말 잔액이 0원보다 낮은 달을 확인합니다.
          </p>
        </div>
      </dl>
    </section>
  );
}
