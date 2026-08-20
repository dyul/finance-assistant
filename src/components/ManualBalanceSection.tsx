import { useEffect, useState } from "react";

import { parseManualCurrentBalance } from "../services/manualBalance";
import { formatCurrency } from "../utils/formatters";

export default function ManualBalanceSection({
  fileLatestBalance,
  manualCurrentBalance,
  onApply,
  onClear,
}: {
  fileLatestBalance: number | null;
  manualCurrentBalance: number | null;
  onApply: (balance: number) => void;
  onClear: () => void;
}) {
  const [draftBalance, setDraftBalance] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setDraftBalance(
      manualCurrentBalance === null ? "" : String(manualCurrentBalance),
    );
    setValidationMessage(null);
  }, [manualCurrentBalance]);

  if (fileLatestBalance !== null) {
    return null;
  }

  function handleApply() {
    const result = parseManualCurrentBalance(draftBalance);

    if (!result.valid) {
      setValidationMessage(result.message);
      return;
    }

    setValidationMessage(null);
    onApply(result.value);
  }

  function handleClear() {
    setDraftBalance("");
    setValidationMessage(null);
    onClear();
  }

  const descriptionIds = [
    "manual-current-balance-help",
    validationMessage ? "manual-current-balance-error" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className="mt-6 rounded-xl border border-blue-200 bg-blue-50/60 p-4 sm:p-5"
      aria-labelledby="manual-current-balance-heading"
    >
      <h3
        id="manual-current-balance-heading"
        className="font-semibold text-slate-900"
      >
        현재 잔액 정보가 없습니다
      </h3>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        현재 알고 있는 사용 가능 잔액을 입력하면 향후 3개월 전망의 시작
        잔액으로 사용할 수 있습니다.
      </p>

      <div className="mt-4 max-w-md">
        <label
          htmlFor="manual-current-balance"
          className="text-sm font-semibold text-slate-800"
        >
          현재 잔액
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center rounded-lg border border-slate-300 bg-white px-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
            <input
              id="manual-current-balance"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={draftBalance}
              aria-invalid={validationMessage !== null}
              aria-describedby={descriptionIds}
              onChange={(event) => {
                setDraftBalance(event.target.value);
                setValidationMessage(null);
              }}
              className="min-w-0 flex-1 bg-transparent py-2.5 text-right text-base text-slate-900 outline-none"
              placeholder="예: 3,000,000"
            />
            <span className="ml-2 text-sm text-slate-500">원</span>
          </div>
          <button
            type="button"
            onClick={handleApply}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto"
          >
            잔액 적용
          </button>
        </div>
        <p
          id="manual-current-balance-help"
          className="mt-2 text-xs leading-5 text-slate-600"
        >
          입력한 금액은 Forecast 시작 잔액으로만 사용되며 과거 입출금 분석과
          브라우저 저장소에는 반영되지 않습니다. 0원과 음수도 입력할 수
          있습니다.
        </p>
        {validationMessage && (
          <p
            id="manual-current-balance-error"
            className="mt-2 text-sm font-medium text-red-700"
            role="alert"
          >
            {validationMessage}
          </p>
        )}
      </div>

      {manualCurrentBalance !== null && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-white p-3">
          <p className="text-sm font-semibold text-blue-800" role="status">
            직접 입력 잔액 {formatCurrency(manualCurrentBalance)}이 전망에
            적용되었습니다.
          </p>
          <button
            type="button"
            onClick={handleClear}
            className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:w-auto"
          >
            입력 잔액 지우기
          </button>
        </div>
      )}
    </section>
  );
}
