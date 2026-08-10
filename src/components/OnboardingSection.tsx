const SAMPLE_FILE_NAME = "finance-assistant-sample.xlsx";

export const SAMPLE_EXCEL_PATH = `${import.meta.env.BASE_URL}samples/${SAMPLE_FILE_NAME}`;

const FEATURES = [
  {
    title: "자동 거래 인식",
    description:
      "입금·출금, 금액과 거래구분, 부호가 포함된 금액 구조를 자동으로 인식합니다.",
  },
  {
    title: "향후 3개월 전망",
    description:
      "반복 거래와 최근 수입 추세를 바탕으로 향후 3개월 잔액을 추정합니다.",
  },
  {
    title: "자금 부족 경고",
    description:
      "예상 최저 잔액과 자금 부족 기간, 필요한 현금 여유(버퍼)를 확인할 수 있습니다.",
  },
  {
    title: "예상 범위 비교",
    description:
      "보수·기준·낙관 예상을 바꿔보며 현금흐름 범위를 비교할 수 있습니다.",
  },
] as const;

interface OnboardingSectionProps {
  visible: boolean;
}

export default function OnboardingSection({
  visible,
}: OnboardingSectionProps) {
  if (!visible) {
    return null;
  }

  return (
    <section
      className="screen-only mb-6 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-5 shadow-sm sm:p-7"
      aria-labelledby="onboarding-heading"
    >
      <div className="max-w-3xl">
        <p className="text-sm font-semibold text-blue-700">
          처음 사용하시나요?
        </p>
        <h2
          id="onboarding-heading"
          className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
        >
          3개월 현금흐름을 미리 확인하세요
        </h2>
        <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
          통장 거래내역 Excel을 업로드하면 최근 입출금 흐름을 분석하고
          향후 3개월 예상 잔액과 자금 부족 가능성을 확인할 수 있습니다.
        </p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => (
          <article
            key={feature.title}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <h3 className="font-semibold text-slate-900">
              {feature.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {feature.description}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="font-semibold text-slate-900">
          권장 Excel 형식
        </h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          거래일과 거래내용을 포함하고, 아래 금액 구조 중 하나를 사용하면
          됩니다. 특정 양식 하나만 사용해야 하는 것은 아닙니다.
        </p>

        <ul className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-3">
          <li className="rounded-md bg-slate-50 px-3 py-2.5">
            거래일 · 적요 · 입금액 · 출금액
          </li>
          <li className="rounded-md bg-slate-50 px-3 py-2.5">
            거래일 · 적요 · 금액 · 거래구분
          </li>
          <li className="rounded-md bg-slate-50 px-3 py-2.5">
            거래일 · 적요 · 부호가 포함된 금액
          </li>
        </ul>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          잔액 컬럼은 선택 사항입니다. 잔액이 있으면 마지막 잔액을
          기준으로 향후 예상 월말잔액까지 계산할 수 있습니다.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <a
          href="#excel-upload"
          className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 sm:w-auto"
        >
          Excel 업로드하기
        </a>
        <a
          href={SAMPLE_EXCEL_PATH}
          download={SAMPLE_FILE_NAME}
          className="inline-flex w-full items-center justify-center rounded-lg border border-blue-200 bg-white px-5 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 sm:w-auto"
        >
          샘플 Excel 다운로드
        </a>
        <p className="text-sm text-slate-500 sm:ml-1">
          Excel을 업로드하거나 샘플 파일로 먼저 테스트해보세요.
        </p>
      </div>
    </section>
  );
}
