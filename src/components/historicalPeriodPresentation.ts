import type {
  HistoricalPeriodSummary,
  HistoricalPeriodUnit,
} from "../services/historicalPeriodAggregator";

export const DEFAULT_HISTORICAL_PERIOD_LIMITS: Record<
  HistoricalPeriodUnit,
  number | null
> = {
  monthly: 12,
  quarterly: 12,
  yearly: null,
};

export function getVisibleHistoricalPeriods(
  summaries: HistoricalPeriodSummary[],
  unit: HistoricalPeriodUnit,
  expanded: boolean,
): HistoricalPeriodSummary[] {
  const latestFirst = summaries.toReversed();
  const limit = DEFAULT_HISTORICAL_PERIOD_LIMITS[unit];

  return expanded || limit === null
    ? latestFirst
    : latestFirst.slice(0, limit);
}
