import type { ForecastAnalysis } from "../services/forecastEngine";
import {
  createForecastSummary,
  DEFAULT_FORECAST_SCENARIO,
} from "../services/forecastPresentation";
import type { ForecastScenario } from "../services/forecastScenario";
import {
  type ActionGuideItem,
  type ActionPriority,
} from "../services/actionGuide";

const FORECAST_SCENARIO_ORDER: ForecastScenario[] = [
  "conservative",
  DEFAULT_FORECAST_SCENARIO,
  "optimistic",
];

const FORECAST_SCENARIO_CONTENT: Record<
  ForecastScenario,
  { label: string; description: string }
> = {
  conservative: {
    label: "보수",
    description: "최근 반복 수입 변동성을 반영한 하방 시나리오",
  },
  base: {
    label: "기준",
    description: "최근 수입 추세와 반복 지출을 반영한 기본 시나리오",
  },
  optimistic: {
    label: "낙관",
    description: "최근 반복 수입 변동성을 반영한 상방 시나리오",
  },
};

interface ForecastScenarioTabsProps {
  selectedScenario: ForecastScenario;
  onScenarioChange: (scenario: ForecastScenario) => void;
}

export function ForecastScenarioTabs({
  selectedScenario,
  onScenarioChange,
}: ForecastScenarioTabsProps) {
  const selectedContent = FORECAST_SCENARIO_CONTENT[selectedScenario];

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div
        className="grid grid-cols-3 gap-2"
        role="tablist"
        aria-label="Forecast 시나리오 선택"
      >
        {FORECAST_SCENARIO_ORDER.map((scenario) => {
          const content = FORECAST_SCENARIO_CONTENT[scenario];
          const isSelected = selectedScenario === scenario;

          return (
            <button
              key={scenario}
              type="button"
              role="tab"
              data-scenario={scenario}
              aria-selected={isSelected}
              onClick={() => onScenarioChange(scenario)}
              className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                isSelected
                  ? "bg-blue-600 text-white shadow-sm"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {content.label}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-600">
        {selectedContent.description}
      </p>
    </div>
  );
}

interface ForecastSectionProps extends ForecastScenarioTabsProps {
  analysis: ForecastAnalysis;
  actionGuideItems: ActionGuideItem[];
}

function formatCurrency(value: number): string {
  const roundedValue = Math.round(value);
  const formattedValue = Math.abs(roundedValue).toLocaleString("ko-KR");

  return roundedValue < 0
    ? `-${formattedValue}원`
    : `${formattedValue}원`;
}

function formatSignedCurrency(value: number): string {
  return value > 0 ? `+${formatCurrency(value)}` : formatCurrency(value);
}

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-");

  return year && monthNumber
    ? `${year}년 ${Number(monthNumber)}월`
    : month;
}

function getRiskLabel(level: NonNullable<ForecastAnalysis["cashRisk"]>["level"]): string {
  if (level === "safe") {
    return "안전";
  }

  if (level === "warning") {
    return "주의";
  }

  return "위험";
}

function getRiskStyles(
  level: NonNullable<ForecastAnalysis["cashRisk"]>["level"],
): { card: string; badge: string } {
  if (level === "safe") {
    return {
      card: "border-emerald-200 bg-emerald-50",
      badge: "bg-emerald-100 text-emerald-700",
    };
  }

  if (level === "warning") {
    return {
      card: "border-amber-200 bg-amber-50",
      badge: "bg-amber-100 text-amber-700",
    };
  }

  return {
    card: "border-red-200 bg-red-50",
    badge: "bg-red-100 text-red-700",
  };
}

const ACTION_PRIORITY_CONTENT: Record<
  ActionPriority,
  { label: string; card: string; badge: string }
> = {
  critical: {
    label: "긴급",
    card: "border-red-200 bg-red-50",
    badge: "bg-red-100 text-red-700",
  },
  high: {
    label: "높음",
    card: "border-orange-200 bg-orange-50",
    badge: "bg-orange-100 text-orange-700",
  },
  medium: {
    label: "보통",
    card: "border-amber-200 bg-amber-50",
    badge: "bg-amber-100 text-amber-700",
  },
  low: {
    label: "낮음",
    card: "border-slate-200 bg-slate-50",
    badge: "bg-slate-200 text-slate-700",
  },
};

export function ActionGuideSection({
  items,
}: {
  items: ActionGuideItem[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="mt-6" aria-labelledby="action-guide-heading">
      <div className="mb-3">
        <h3 id="action-guide-heading" className="font-semibold text-slate-900">
          추천 액션
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          선택한 시나리오의 Forecast와 지출 분석을 바탕으로 우선순위를
          정리했습니다.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const content = ACTION_PRIORITY_CONTENT[item.priority];

          return (
            <article
              key={item.id}
              className={`rounded-xl border p-5 ${content.card}`}
              data-testid="action-guide-card"
              data-action-type={item.type}
            >
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${content.badge}`}
              >
                {content.label}
              </span>
              <h4 className="mt-3 font-bold text-slate-900">{item.title}</h4>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {item.message}
              </p>
              <p className="mt-3 rounded-lg bg-white/70 p-3 text-sm font-medium leading-6 text-slate-800">
                → {item.action}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function ForecastSection({
  analysis,
  selectedScenario,
  onScenarioChange,
  actionGuideItems,
}: ForecastSectionProps) {
  const { forecasts, cashRisk } = analysis;

  if (forecasts.length === 0) {
    return null;
  }

  const summary = createForecastSummary(forecasts, cashRisk);
  const scenarioContent = FORECAST_SCENARIO_CONTENT[selectedScenario];
  const riskStyles = cashRisk ? getRiskStyles(cashRisk.level) : null;

  return (
    <>
      <section className="mt-6" aria-labelledby="forecast-heading">
        <div className="mb-4">
          <h3 id="forecast-heading" className="font-semibold text-slate-900">
            3개월 현금흐름 Forecast
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            시나리오를 선택하면 핵심 잔액과 월별 현금흐름이 함께 바뀝니다.
          </p>
        </div>

        <ForecastScenarioTabs
          selectedScenario={selectedScenario}
          onScenarioChange={onScenarioChange}
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">3개월 후 예상 잔액</p>
            <p
              className={`mt-2 text-xl font-bold ${
                (summary.endingBalance ?? 0) >= 0
                  ? "text-blue-700"
                  : "text-red-700"
              }`}
              data-summary="ending-balance"
            >
              {summary.endingBalance === null
                ? "확인 불가"
                : formatCurrency(summary.endingBalance)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">
              3개월 누적 예상 순현금흐름
            </p>
            <p
              className={`mt-2 text-xl font-bold ${
                summary.cumulativeNetCashFlow >= 0
                  ? "text-emerald-700"
                  : "text-red-700"
              }`}
              data-summary="cumulative-net-cash-flow"
            >
              {formatSignedCurrency(summary.cumulativeNetCashFlow)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">최저 예상 잔액</p>
            <p
              className={`mt-2 text-xl font-bold ${
                (summary.lowestBalance ?? 0) >= 0
                  ? "text-slate-900"
                  : "text-red-700"
              }`}
              data-summary="lowest-balance"
            >
              {summary.lowestBalance === null
                ? "확인 불가"
                : formatCurrency(summary.lowestBalance)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">자금 부족 예상</p>
            <p
              className={`mt-2 text-xl font-bold ${
                summary.negativeMonthCount > 0
                  ? "text-amber-700"
                  : "text-slate-900"
              }`}
              data-summary="negative-month-count"
            >
              {summary.negativeMonthCount}개월
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {forecasts.map((forecast) => (
            <article
              key={forecast.month}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              data-testid="forecast-month-card"
            >
              <div className="flex items-center justify-between gap-3">
                <h4 className="font-semibold text-slate-900">
                  {formatMonth(forecast.month)}
                </h4>
                <span className="text-xs font-medium text-slate-500">
                  시작 {formatCurrency(forecast.startingBalance)}
                </span>
              </div>

              <div className="mt-4 rounded-lg bg-slate-50 p-4">
                <p className="text-sm text-slate-500">예상 월말 잔액</p>
                <p
                  className={`mt-1 text-2xl font-bold ${
                    forecast.expectedEndingBalance >= 0
                      ? "text-blue-700"
                      : "text-red-700"
                  }`}
                >
                  {formatCurrency(forecast.expectedEndingBalance)}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between border-b border-slate-200 pb-4">
                <span className="text-sm text-slate-600">
                  예상 순현금흐름
                </span>
                <strong
                  className={
                    forecast.expectedNetCashFlow >= 0
                      ? "text-emerald-700"
                      : "text-red-700"
                  }
                >
                  {formatSignedCurrency(forecast.expectedNetCashFlow)}
                </strong>
              </div>

              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">
                    추세·시나리오 반복 입금
                  </dt>
                  <dd className="font-semibold text-emerald-700">
                    {formatCurrency(forecast.recurringIncome)}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">예정 입금</dt>
                  <dd className="font-medium text-emerald-700">
                    {formatCurrency(forecast.scheduledIncome)}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">기본 반복 예상 출금</dt>
                  <dd className="font-medium text-red-700">
                    {formatCurrency(forecast.recurringExpense)}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">예정 출금</dt>
                  <dd className="font-medium text-red-700">
                    {formatCurrency(forecast.scheduledExpense)}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      {cashRisk && riskStyles && (
        <section className="mt-6" aria-labelledby="cash-risk-heading">
          <div className="mb-3">
            <h3 id="cash-risk-heading" className="font-semibold text-slate-900">
              현금 위험 분석 ({scenarioContent.label})
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              선택한 시나리오에서 회복 시점과 필요한 현금 여유를
              확인하세요.
            </p>
          </div>

          <div className={`rounded-xl border p-5 ${riskStyles.card}`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-600">위험 수준</p>
                <span
                  className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-semibold ${riskStyles.badge}`}
                >
                  {getRiskLabel(cashRisk.level)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-right sm:gap-6">
                <div>
                  <p className="text-sm text-slate-600">회복 예상월</p>
                  <p className="mt-1 font-bold text-slate-900">
                    {cashRisk.recoveryMonth
                      ? formatMonth(cashRisk.recoveryMonth)
                      : "예측기간 내 없음"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">필요 현금 버퍼</p>
                  <p className="mt-1 font-bold text-red-700">
                    {formatCurrency(cashRisk.requiredCashBuffer)}
                  </p>
                </div>
              </div>
            </div>

            <p className="mt-5 rounded-lg bg-white/70 p-4 text-sm leading-6 text-slate-700">
              {cashRisk.message}
            </p>
          </div>
        </section>
      )}

      <ActionGuideSection items={actionGuideItems} />
    </>
  );
}
