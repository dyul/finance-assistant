import type { ForecastScenario } from "../services/forecastScenario";

export const FORECAST_SCENARIO_CONTENT: Record<
  ForecastScenario,
  { label: string; description: string }
> = {
  conservative: {
    label: "보수",
    description:
      "기준 반복 수입을 계산된 변동폭만큼 낮춰 보는 예상입니다.",
  },
  base: {
    label: "기준",
    description:
      "최근 반복 수입 추세를 그대로 반영한 기본 예상입니다.",
  },
  optimistic: {
    label: "낙관",
    description:
      "기준 반복 수입을 계산된 변동폭만큼 높여 보는 예상입니다.",
  },
};

export const FORECAST_SCENARIO_SPREAD_DESCRIPTION =
  "변동폭은 최근 월별 수입 자료가 충분하면 5~20%, 부족하면 기본 10%를 사용합니다. 확정 예정 거래와 반복 지출은 세 예상에서 동일합니다.";
