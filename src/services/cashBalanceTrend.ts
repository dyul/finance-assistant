import type { MonthlyForecast } from "./forecastEngine";
import type { HistoricalPeriodSummary } from "./historicalPeriodAggregator";
import type {
  ForecastStartingBalanceSource,
  ResolvedForecastStartingBalance,
} from "./manualBalance";
import type { ForecastScenario } from "./forecastScenario";
import type { NormalizedDate } from "./dateNormalizer";

export type CashBalanceTrendPhase = "historical" | "starting" | "forecast";
export type CashBalanceTrendSource = "file" | "manual" | "forecast";
export type CashBalanceTrendState =
  | "full"
  | "historicalOnly"
  | "forecastOnly"
  | "noData";

export interface CashBalanceTrendPoint {
  id: string;
  periodKey: string;
  label: string;
  balance: number | null;
  phase: CashBalanceTrendPhase;
  source: CashBalanceTrendSource;
  accessibleLabel: string;
}

export type CashBalanceTrendValuePoint = CashBalanceTrendPoint & {
  balance: number;
};

export interface CashBalanceTrendModel {
  timeline: CashBalanceTrendPoint[];
  historicalPoints: CashBalanceTrendPoint[];
  historicalSegments: CashBalanceTrendValuePoint[][];
  startingPoint: CashBalanceTrendValuePoint | null;
  forecastPoints: CashBalanceTrendValuePoint[];
  forecastSegment: CashBalanceTrendValuePoint[];
  state: CashBalanceTrendState;
  scenario: ForecastScenario;
  scenarioLabel: string;
  startingBalanceSource: ForecastStartingBalanceSource;
  accessibleName: string;
}

export interface CashBalanceYDomain {
  min: number;
  max: number;
}

export interface CashBalanceChartCoordinatePoint
  extends CashBalanceTrendValuePoint {
  x: number;
  y: number;
}

export interface CashBalanceChartLabel {
  id: string;
  x: number;
  label: string;
}

export interface CashBalanceChartLayout {
  width: number;
  height: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  yDomain: CashBalanceYDomain;
  yTicks: Array<{ value: number; y: number }>;
  zeroY: number;
  historicalSegments: CashBalanceChartCoordinatePoint[][];
  forecastSegment: CashBalanceChartCoordinatePoint[];
  startingPoint: CashBalanceChartCoordinatePoint | null;
  historicalPoints: CashBalanceChartCoordinatePoint[];
  forecastPoints: CashBalanceChartCoordinatePoint[];
  xLabels: CashBalanceChartLabel[];
}

const SCENARIO_LABELS: Record<ForecastScenario, string> = {
  conservative: "보수",
  base: "기준",
  optimistic: "낙관",
};

function isConsecutiveMonth(first: string, second: string): boolean {
  const firstMatch = /^(\d{4})-(\d{2})$/.exec(first);
  const secondMatch = /^(\d{4})-(\d{2})$/.exec(second);
  if (!firstMatch || !secondMatch) {
    return false;
  }

  const firstOrdinal = Number(firstMatch[1]) * 12 + Number(firstMatch[2]);
  const secondOrdinal = Number(secondMatch[1]) * 12 + Number(secondMatch[2]);
  return secondOrdinal - firstOrdinal === 1;
}

function createHistoricalPoint(
  summary: HistoricalPeriodSummary,
  referenceDate: NormalizedDate,
): CashBalanceTrendPoint {
  const isCurrentPartialMonth = summary.periodKey === referenceDate.slice(0, 7);
  const timingLabel = isCurrentPartialMonth
    ? `${summary.label} 현재까지 확인된 잔액`
    : `${summary.label} 파일에서 확인된 잔액`;

  return {
    id: `historical-${summary.periodKey}`,
    periodKey: summary.periodKey,
    label: summary.label,
    balance: summary.closingBalance,
    phase: "historical",
    source: "file",
    accessibleLabel:
      summary.closingBalance === null
        ? `${timingLabel} 없음`
        : `${timingLabel} ${summary.closingBalance.toLocaleString("ko-KR")}원`,
  };
}

export function createHistoricalBalanceSegments(
  points: CashBalanceTrendPoint[],
): CashBalanceTrendValuePoint[][] {
  const segments: CashBalanceTrendValuePoint[][] = [];
  let activeSegment: CashBalanceTrendValuePoint[] = [];
  let previousPeriodKey: string | null = null;

  for (const point of points) {
    if (point.balance === null) {
      if (activeSegment.length > 0) {
        segments.push(activeSegment);
      }
      activeSegment = [];
      previousPeriodKey = null;
      continue;
    }

    const valuePoint: CashBalanceTrendValuePoint = {
      ...point,
      balance: point.balance,
    };
    if (
      previousPeriodKey !== null &&
      !isConsecutiveMonth(previousPeriodKey, point.periodKey)
    ) {
      if (activeSegment.length > 0) {
        segments.push(activeSegment);
      }
      activeSegment = [];
    }

    activeSegment.push(valuePoint);
    previousPeriodKey = point.periodKey;
  }

  if (activeSegment.length > 0) {
    segments.push(activeSegment);
  }

  return segments;
}

function createStartingPoint(
  startingBalance: ResolvedForecastStartingBalance,
  referenceDate: NormalizedDate,
): CashBalanceTrendValuePoint | null {
  if (startingBalance.value === null || startingBalance.source === null) {
    return null;
  }

  const sourceLabel =
    startingBalance.source === "manual" ? "직접 입력" : "최근 거래 기준";
  return {
    id: "forecast-starting-balance",
    periodKey: `${referenceDate.slice(0, 7)}-start`,
    label: "전망 시작",
    balance: startingBalance.value,
    phase: "starting",
    source: startingBalance.source,
    accessibleLabel: `전망 시작 잔액 (${sourceLabel}) ${startingBalance.value.toLocaleString("ko-KR")}원`,
  };
}

function createForecastPoints(
  forecasts: MonthlyForecast[],
  scenarioLabel: string,
): CashBalanceTrendValuePoint[] {
  return [...forecasts]
    .sort((first, second) => first.month.localeCompare(second.month))
    .map((forecast) => ({
      id: `forecast-${forecast.month}`,
      periodKey: forecast.month,
      label: `${Number(forecast.month.slice(5, 7))}월 예상`,
      balance: forecast.expectedEndingBalance,
      phase: "forecast" as const,
      source: "forecast" as const,
      accessibleLabel: `${forecast.month.slice(0, 4)}년 ${Number(forecast.month.slice(5, 7))}월 ${scenarioLabel} 예상 잔액 ${forecast.expectedEndingBalance.toLocaleString("ko-KR")}원`,
    }));
}

export function createCashBalanceTrendModel({
  monthlySummaries,
  startingBalance,
  forecasts,
  scenario,
  referenceDate,
}: {
  monthlySummaries: HistoricalPeriodSummary[];
  startingBalance: ResolvedForecastStartingBalance;
  forecasts: MonthlyForecast[];
  scenario: ForecastScenario;
  referenceDate: NormalizedDate;
}): CashBalanceTrendModel {
  const scenarioLabel = SCENARIO_LABELS[scenario];
  const historicalPoints = [...monthlySummaries]
    .sort((first, second) => first.periodKey.localeCompare(second.periodKey))
    .map((summary) => createHistoricalPoint(summary, referenceDate));
  const historicalSegments = createHistoricalBalanceSegments(historicalPoints);
  const startingPoint =
    forecasts.length > 0
      ? createStartingPoint(startingBalance, referenceDate)
      : null;
  const forecastPoints = startingPoint
    ? createForecastPoints(forecasts, scenarioLabel)
    : [];
  const forecastSegment =
    startingPoint && forecastPoints.length > 0
      ? [startingPoint, ...forecastPoints]
      : [];
  const historicalValueCount = historicalSegments.reduce(
    (count, segment) => count + segment.length,
    0,
  );
  const hasHistorical = historicalValueCount > 0;
  const hasForecast = forecastPoints.length > 0;
  const state: CashBalanceTrendState = hasHistorical
    ? hasForecast
      ? "full"
      : "historicalOnly"
    : hasForecast
      ? "forecastOnly"
      : "noData";
  const timeline = [
    ...historicalPoints,
    ...(startingPoint ? [startingPoint] : []),
    ...forecastPoints,
  ];

  return {
    timeline,
    historicalPoints,
    historicalSegments,
    startingPoint,
    forecastPoints,
    forecastSegment,
    state,
    scenario,
    scenarioLabel,
    startingBalanceSource: startingBalance.source,
    accessibleName: `현금 잔액 추이. 과거 실제 잔액 ${historicalValueCount.toLocaleString("ko-KR")}개와 ${scenarioLabel} 예상 ${forecastPoints.length.toLocaleString("ko-KR")}개월 잔액을 표시합니다.`,
  };
}

export function createCashBalanceYDomain(
  balances: Array<number | null>,
): CashBalanceYDomain {
  const finiteBalances = balances.filter(
    (balance): balance is number => balance !== null && Number.isFinite(balance),
  );
  const rawMin = Math.min(0, ...finiteBalances);
  const rawMax = Math.max(0, ...finiteBalances);

  if (rawMin === 0 && rawMax === 0) {
    return { min: -100_000, max: 100_000 };
  }

  const span = rawMax - rawMin;
  const padding = Math.max(span * 0.1, 1);
  return {
    min: rawMin - padding,
    max: rawMax + padding,
  };
}

export function selectCashBalanceXAxisLabelIndices(
  timeline: CashBalanceTrendPoint[],
  maxLabels = 7,
): number[] {
  if (timeline.length <= maxLabels) {
    return timeline.map((_, index) => index);
  }

  const selected = new Set<number>();
  const historicalValueIndices = timeline.flatMap((point, index) =>
    point.phase === "historical" && point.balance !== null ? [index] : [],
  );
  const startingIndex = timeline.findIndex((point) => point.phase === "starting");
  const forecastIndices = timeline.flatMap((point, index) =>
    point.phase === "forecast" ? [index] : [],
  );

  if (historicalValueIndices.length > 0) {
    selected.add(historicalValueIndices[0]!);
    selected.add(historicalValueIndices.at(-1)!);
  }
  if (startingIndex >= 0) {
    selected.add(startingIndex);
  }
  for (const index of forecastIndices) {
    selected.add(index);
  }

  const interval = (timeline.length - 1) / Math.max(maxLabels - 1, 1);
  for (let step = 0; selected.size < maxLabels && step < maxLabels; step += 1) {
    selected.add(Math.round(step * interval));
  }

  return [...selected]
    .sort((first, second) => first - second)
    .slice(0, maxLabels);
}

function createYTicks(domain: CashBalanceYDomain): number[] {
  const ticks = new Set<number>([domain.min, 0, domain.max]);
  const interval = (domain.max - domain.min) / 4;
  for (let index = 1; index < 4; index += 1) {
    ticks.add(domain.min + interval * index);
  }
  return [...ticks].sort((first, second) => second - first);
}

export function createCashBalanceChartLayout(
  model: CashBalanceTrendModel,
  width = 760,
  height = 320,
  maxXAxisLabels = 7,
): CashBalanceChartLayout {
  const compactLayout = width < 480;
  const plotLeft = compactLayout ? 58 : 76;
  const plotRight = width - (compactLayout ? 10 : 20);
  const plotTop = 20;
  const plotBottom = height - 54;
  const yDomain = createCashBalanceYDomain(
    model.timeline.map((point) => point.balance),
  );
  const xById = new Map<string, number>();
  const timelineDenominator = Math.max(model.timeline.length - 1, 1);
  model.timeline.forEach((point, index) => {
    xById.set(
      point.id,
      plotLeft + ((plotRight - plotLeft) * index) / timelineDenominator,
    );
  });
  const getY = (balance: number) =>
    plotTop +
    ((yDomain.max - balance) / (yDomain.max - yDomain.min)) *
      (plotBottom - plotTop);
  const toCoordinatePoint = (
    point: CashBalanceTrendValuePoint,
  ): CashBalanceChartCoordinatePoint => ({
    ...point,
    x: xById.get(point.id) ?? plotLeft,
    y: getY(point.balance),
  });

  return {
    width,
    height,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    yDomain,
    yTicks: createYTicks(yDomain).map((value) => ({
      value,
      y: getY(value),
    })),
    zeroY: getY(0),
    historicalSegments: model.historicalSegments.map((segment) =>
      segment.map(toCoordinatePoint),
    ),
    forecastSegment: model.forecastSegment.map(toCoordinatePoint),
    startingPoint: model.startingPoint
      ? toCoordinatePoint(model.startingPoint)
      : null,
    historicalPoints: model.historicalSegments
      .flat()
      .map(toCoordinatePoint),
    forecastPoints: model.forecastPoints.map(toCoordinatePoint),
    xLabels: selectCashBalanceXAxisLabelIndices(
      model.timeline,
      maxXAxisLabels,
    ).map((index) => ({
      id: model.timeline[index]!.id,
      x: xById.get(model.timeline[index]!.id) ?? plotLeft,
      label: model.timeline[index]!.label,
    })),
  };
}

export function formatCompactWon(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 10_000) {
    return `${Math.round(value).toLocaleString("ko-KR")}원`;
  }

  const absoluteValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absoluteValue >= 100_000_000) {
    const amount = absoluteValue / 100_000_000;
    return `${sign}${Number(amount.toFixed(amount >= 10 ? 0 : 1)).toLocaleString("ko-KR")}억`;
  }

  const amount = absoluteValue / 10_000;
  return `${sign}${Number(amount.toFixed(amount >= 100 ? 0 : 1)).toLocaleString("ko-KR")}만`;
}
