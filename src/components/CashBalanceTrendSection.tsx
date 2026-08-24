import { useEffect, useRef, useState } from "react";

import {
  createCashBalanceChartLayout,
  formatCompactWon,
  type CashBalanceChartCoordinatePoint,
  type CashBalanceTrendModel,
} from "../services/cashBalanceTrend";
import { formatCurrency } from "../utils/formatters";

function createPath(points: CashBalanceChartCoordinatePoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function formatCompactXAxisLabel(label: string): string {
  if (label === "전망 시작") {
    return "시작";
  }

  const month = /(\d{1,2})월/.exec(label)?.[1];
  return month ? `${month}월` : label;
}

export interface CashBalanceTrendSectionProps {
  model: CashBalanceTrendModel;
}

export default function CashBalanceTrendSection({
  model,
}: CashBalanceTrendSectionProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(760);
  const compactLayout = chartWidth < 480;
  const layout = createCashBalanceChartLayout(
    model,
    chartWidth,
    compactLayout ? 280 : 320,
    compactLayout ? 6 : 7,
  );
  const hasHistorical = model.state === "full" || model.state === "historicalOnly";
  const hasForecast = model.state === "full" || model.state === "forecastOnly";

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) {
      return;
    }

    const updateWidth = () => {
      const nextWidth = Math.min(Math.round(container.clientWidth), 900);
      if (nextWidth > 0) {
        setChartWidth(nextWidth);
      }
    };

    updateWidth();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      aria-labelledby="cash-balance-trend-heading"
      data-testid="cash-balance-trend"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4
            id="cash-balance-trend-heading"
            className="font-semibold text-slate-900"
          >
            현금 잔액 추이
          </h4>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            파일에서 확인된 과거 잔액과 선택한 예상 범위의 향후 3개월 월말 잔액을 함께 보여줍니다.
          </p>
        </div>
        {hasForecast && (
          <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            현재: {model.scenarioLabel} 예상
          </span>
        )}
      </div>

      {model.state === "noData" ? (
        <p
          className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-600"
          role="status"
        >
          {model.startingBalanceSource === null
            ? "잔액 정보가 없어 현금 잔액 추이를 표시할 수 없습니다. 원본에 잔액이 없다면 현재 잔액을 직접 입력한 뒤 향후 전망을 확인할 수 있습니다."
            : "향후 전망을 계산할 수 없어 시작 잔액만으로는 현금 잔액 추이를 표시할 수 없습니다."}
        </p>
      ) : (
        <>
          {!hasHistorical && (
            <p className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm leading-6 text-blue-900">
              원본 파일에 과거 잔액 정보가 없어 과거 잔액 추이는 표시하지 않습니다. 직접 입력한 잔액은 전망 시작점으로만 사용합니다.
            </p>
          )}
          {!hasForecast && (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              향후 전망을 계산할 수 없어 파일에서 확인된 과거 잔액만 표시합니다.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-slate-600" aria-label="현금 잔액 추이 범례">
            {hasHistorical && (
              <span className="inline-flex items-center gap-2">
                <span className="block w-8 border-t-2 border-slate-700" aria-hidden="true" />
                실제 잔액
              </span>
            )}
            {hasForecast && (
              <span className="inline-flex items-center gap-2">
                <span className="block w-8 border-t-2 border-dashed border-blue-600" aria-hidden="true" />
                예상 잔액 · {model.scenarioLabel}
              </span>
            )}
            {model.startingPoint && (
              <span className="inline-flex items-center gap-2">
                <span className="block h-3 w-3 rounded-full border-2 border-blue-600 bg-white" aria-hidden="true" />
                전망 시작{model.startingBalanceSource === "manual" ? " (직접 입력)" : " (최근 거래 기준)"}
              </span>
            )}
          </div>

          <div
            ref={chartContainerRef}
            className="mt-3 w-full"
            data-chart-container
          >
            <svg
              className="block h-auto w-full"
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              role="img"
              aria-labelledby="cash-balance-chart-title cash-balance-chart-description"
              preserveAspectRatio="xMidYMid meet"
            >
              <title id="cash-balance-chart-title">{model.accessibleName}</title>
              <desc id="cash-balance-chart-description">
                실제 잔액은 실선, 선택한 예상 잔액은 점선으로 표시합니다. 굵은 가로선은 0원 기준선이며 잔액 미확인 또는 거래가 없는 월에서는 실제 잔액 선을 연결하지 않습니다.
              </desc>

              {layout.yTicks.map((tick) => (
                <g key={`y-${tick.value}`}>
                  <line
                    x1={layout.plotLeft}
                    x2={layout.plotRight}
                    y1={tick.y}
                    y2={tick.y}
                    stroke={Math.abs(tick.value) < 0.5 ? "#64748b" : "#e2e8f0"}
                    strokeWidth={Math.abs(tick.value) < 0.5 ? 1.6 : 1}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={layout.plotLeft - 10}
                    y={tick.y + 4}
                    textAnchor="end"
                    fontSize={compactLayout ? 10 : 11}
                    fill="#64748b"
                  >
                    {formatCompactWon(tick.value)}
                  </text>
                </g>
              ))}

              <text
                x={layout.plotLeft + 6}
                y={layout.zeroY - 7}
                fontSize="10"
                fontWeight="600"
                fill="#475569"
              >
                0원 기준선
              </text>

              {layout.historicalSegments.map((segment, index) => (
                <path
                  key={`historical-segment-${index}`}
                  d={createPath(segment)}
                  fill="none"
                  stroke="#334155"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  data-line="historical"
                />
              ))}

              {layout.forecastSegment.length > 0 && (
                <path
                  d={createPath(layout.forecastSegment)}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2.5"
                  strokeDasharray="7 6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  data-line="forecast"
                />
              )}

              {layout.startingPoint && (
                <g>
                  <line
                    x1={layout.startingPoint.x}
                    x2={layout.startingPoint.x}
                    y1={layout.plotTop}
                    y2={layout.plotBottom}
                    stroke="#94a3b8"
                    strokeWidth="1"
                    strokeDasharray="3 5"
                    vectorEffect="non-scaling-stroke"
                    data-boundary="forecast-start"
                  />
                  <circle
                    cx={layout.startingPoint.x}
                    cy={layout.startingPoint.y}
                    r="5"
                    fill="white"
                    stroke="#2563eb"
                    strokeWidth="2.5"
                    vectorEffect="non-scaling-stroke"
                    data-point="starting"
                  >
                    <title>{layout.startingPoint.accessibleLabel}</title>
                  </circle>
                </g>
              )}

              {layout.historicalPoints.map((point) => (
                <circle
                  key={point.id}
                  cx={point.x}
                  cy={point.y}
                  r="3.5"
                  fill="white"
                  stroke="#334155"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                  data-point="historical"
                >
                  <title>{point.accessibleLabel}</title>
                </circle>
              ))}

              {layout.forecastPoints.map((point) => (
                <circle
                  key={point.id}
                  cx={point.x}
                  cy={point.y}
                  r="4"
                  fill="#2563eb"
                  stroke="white"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                  data-point="forecast"
                >
                  <title>{point.accessibleLabel}</title>
                </circle>
              ))}

              {layout.xLabels.map((label) => (
                <text
                  key={label.id}
                  x={label.x}
                  y={layout.plotBottom + 25}
                  textAnchor="middle"
                  fontSize={compactLayout ? 11 : 10}
                  fill="#64748b"
                >
                  {compactLayout
                    ? formatCompactXAxisLabel(label.label)
                    : label.label}
                </text>
              ))}
            </svg>
          </div>

          <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <summary className="cursor-pointer font-semibold text-slate-700">
              그래프 값 확인
            </summary>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="현금 잔액 추이 상세 값">
              {model.timeline.map((point) => (
                <li key={point.id} className="flex items-start justify-between gap-3 rounded-md bg-white px-3 py-2">
                  <span className="text-slate-600">
                    {point.label}
                    <span className="ml-1 text-xs">
                      ({point.phase === "historical" ? "실제" : point.phase === "starting" ? "전망 시작" : `${model.scenarioLabel} 예상`})
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                    {point.balance === null ? "잔액 미확인" : formatCurrency(point.balance)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
