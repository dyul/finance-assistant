import type { ForecastAnalysis } from "../services/forecastEngine";
import {
  DEFAULT_FORECAST_SCENARIO,
  type ForecastSummary,
} from "../services/forecastPresentation";
import type { ForecastScenario } from "../services/forecastScenario";
import {
  type ActionGuideItem,
  type ActionPriority,
} from "../services/actionGuide";
import {
  formatCurrency,
  formatMonth,
  formatSignedCurrency,
} from "../utils/formatters";
import {
  FORECAST_SCENARIO_CONTENT,
  FORECAST_SCENARIO_SPREAD_DESCRIPTION,
} from "./forecastScenarioContent";
import type { ForecastStartingBalanceSource } from "../services/manualBalance";

const FORECAST_SCENARIO_ORDER: ForecastScenario[] = [
  "conservative",
  DEFAULT_FORECAST_SCENARIO,
  "optimistic",
];

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
      <p className="mb-3 text-sm font-semibold text-slate-800">
        예상 범위 선택
      </p>
      <div
        className="grid grid-cols-3 gap-2"
        role="tablist"
        aria-label="3개월 예상 범위 선택"
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
              className={`min-w-0 rounded-lg px-2 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:px-3 ${
                isSelected
                  ? "bg-blue-600 text-white shadow-sm"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {isSelected ? `✓ ${content.label}` : content.label}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-600">
        {selectedContent.description}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        {FORECAST_SCENARIO_SPREAD_DESCRIPTION}
      </p>
    </div>
  );
}

interface ForecastSectionProps extends ForecastScenarioTabsProps {
  analysis: ForecastAnalysis;
  summary: ForecastSummary;
  actionGuideItems: ActionGuideItem[];
  startingBalanceSource: ForecastStartingBalanceSource;
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
          3. 필요한 행동
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          선택한 예상 범위와 지출 분석을 바탕으로 먼저 확인할 행동을
          정리했습니다.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const content = ACTION_PRIORITY_CONTENT[item.priority];

          return (
            <article
              key={item.id}
              className={`min-w-0 rounded-xl border p-5 ${content.card}`}
              data-testid="action-guide-card"
              data-action-type={item.type}
            >
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${content.badge}`}
              >
                {content.label}
              </span>
              <h4 className="mt-3 font-bold text-slate-900">{item.title}</h4>
              <p className="mt-3 text-xs font-semibold text-slate-500">
                현재 상황
              </p>
              <p className="mt-1 break-words text-sm leading-6 text-slate-700">
                {item.message}
              </p>
              <div className="mt-3 rounded-lg bg-white/70 p-3">
                <p className="text-xs font-semibold text-slate-500">
                  권장 행동
                </p>
                <p className="mt-1 break-words text-sm font-medium leading-6 text-slate-800">
                  {item.action}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function ForecastSection({
  analysis,
  summary,
  selectedScenario,
  onScenarioChange,
  actionGuideItems,
  startingBalanceSource,
}: ForecastSectionProps) {
  const { forecasts, cashRisk } = analysis;

  if (forecasts.length === 0) {
    return (
      <section
        className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5"
        aria-labelledby="forecast-unavailable-heading"
        role="status"
      >
        <h3
          id="forecast-unavailable-heading"
          className="font-semibold text-amber-900"
        >
          향후 3개월 전망을 계산할 수 없습니다
        </h3>
        <p className="mt-2 text-sm leading-6 text-amber-800">
          전망에는 최근 잔액과 여러 달에 반복된 거래가 필요합니다. 원본 파일의
          잔액·거래일·적요 컬럼을 확인하고 다시 업로드하거나, 자동 인식이
          잘못됐다면 위의 자동 인식 수정에서 컬럼을 직접 선택해주세요.
        </p>
      </section>
    );
  }

  const scenarioContent = FORECAST_SCENARIO_CONTENT[selectedScenario];
  const riskStyles = cashRisk ? getRiskStyles(cashRisk.level) : null;

  return (
    <>
      <section className="mt-6" aria-labelledby="forecast-heading">
        <div className="mb-4">
          <h3 id="forecast-heading" className="font-semibold text-slate-900">
            2. 향후 3개월 전망
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            반복 거래와 최근 수입 추세를 바탕으로 월말 잔액을 예상합니다.
            아래 예상 범위를 바꾸면 관련 숫자와 자금 부족 가능성이 함께
            바뀝니다.
          </p>
          {startingBalanceSource === "manual" && (
            <p className="mt-2 text-sm font-medium text-blue-700" role="status">
              전망 시작 잔액은 사용자가 직접 입력한 현재 잔액입니다.
            </p>
          )}
        </div>

        <ForecastScenarioTabs
          selectedScenario={selectedScenario}
          onScenarioChange={onScenarioChange}
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">3개월 후 예상 잔액</p>
            <p
              className={`mt-2 break-words text-xl font-bold tabular-nums ${
                (summary.endingBalance ?? 0) >= 0
                  ? "text-emerald-700"
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
              className={`mt-2 break-words text-xl font-bold tabular-nums ${
                summary.cumulativeNetCashFlow >= 0
                  ? "text-emerald-700"
                  : "text-red-700"
              }`}
              data-summary="cumulative-net-cash-flow"
            >
              {formatSignedCurrency(summary.cumulativeNetCashFlow)}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              3개월 동안 들어올 돈에서 나갈 돈을 뺀 합계입니다.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">최저 예상 잔액</p>
            <p
              className={`mt-2 break-words text-xl font-bold tabular-nums ${
                (summary.lowestBalance ?? 0) >= 0
                  ? "text-emerald-700"
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
            <p className="text-sm text-slate-500">
              잔액이 마이너스인 달
            </p>
            <p
              className={`mt-2 break-words text-xl font-bold tabular-nums ${
                summary.negativeMonthCount > 0
                  ? "text-amber-700"
                  : "text-emerald-700"
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
              className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              data-testid="forecast-month-card"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
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
                  className={`mt-1 break-words text-2xl font-bold tabular-nums ${
                    forecast.expectedEndingBalance >= 0
                      ? "text-emerald-700"
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
                    반복 예상 입금 (추세·선택 범위 반영)
                  </dt>
                  <dd className="break-words text-right font-semibold text-emerald-700">
                    {formatCurrency(forecast.recurringIncome)}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">예정 입금</dt>
                  <dd className="break-words text-right font-medium text-emerald-700">
                    {formatCurrency(forecast.scheduledIncome)}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">기본 반복 예상 출금</dt>
                  <dd className="break-words text-right font-medium text-red-700">
                    {formatCurrency(forecast.recurringExpense)}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">예정 출금</dt>
                  <dd className="break-words text-right font-medium text-red-700">
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
              자금 부족 가능성 ({scenarioContent.label} 예상)
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              선택한 예상 범위에서 회복 시점과 필요한 현금 여유를
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

              <div className="grid grid-cols-1 gap-3 text-left sm:grid-cols-2 sm:gap-6 sm:text-right">
                <div>
                  <p className="text-sm text-slate-600">회복 예상월</p>
                  <p className="mt-1 font-bold text-slate-900">
                    {cashRisk.recoveryMonth
                      ? formatMonth(cashRisk.recoveryMonth)
                      : "전망 기간 내 없음"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">
                    필요한 현금 여유(버퍼)
                  </p>
                  <p
                    className={`mt-1 font-bold ${
                      cashRisk.requiredCashBuffer > 0
                        ? "text-red-700"
                        : "text-emerald-700"
                    }`}
                  >
                    {formatCurrency(cashRisk.requiredCashBuffer)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    최저 예상 잔액을 0원까지 채우는 금액
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
