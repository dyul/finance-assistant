import {
  MAX_MANUAL_HEADER_ROWS,
  type ManualAmountMode,
  type ManualTransactionMapping,
  type ManualWorksheetPreview,
} from "../services/manualMapping";
import type { TransactionSourceType } from "../services/transactionDataSource";

interface ColumnSelectProps {
  label: string;
  value?: string;
  columns: string[];
  required?: boolean;
  onChange: (value: string) => void;
}

function ColumnSelect({
  label,
  value,
  columns,
  required = false,
  onChange,
}: ColumnSelectProps) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
      >
        <option value="">
          {required ? "선택해주세요" : "사용 안 함"}
        </option>
        {columns.map((column) => (
          <option key={column} value={column}>
            {column}
          </option>
        ))}
      </select>
    </label>
  );
}

interface ManualMappingPanelProps {
  sourceType: TransactionSourceType;
  sheetNames: string[];
  mapping: ManualTransactionMapping;
  preview: ManualWorksheetPreview;
  errors: string[];
  canReturnToAutomatic: boolean;
  onSheetChange: (sheetName: string) => void;
  onHeaderRowChange: (headerRowIndex: number) => void;
  onMappingChange: (mapping: ManualTransactionMapping) => void;
  onAnalyze: () => void;
  onReturnToAutomatic: () => void;
}

export default function ManualMappingPanel({
  sourceType,
  sheetNames,
  mapping,
  preview,
  errors,
  canReturnToAutomatic,
  onSheetChange,
  onHeaderRowChange,
  onMappingChange,
  onAnalyze,
  onReturnToAutomatic,
}: ManualMappingPanelProps) {
  function updateAmountMode(amountMode: ManualAmountMode) {
    onMappingChange({
      ...mapping,
      amountMode,
      incomeColumn: undefined,
      expenseColumn: undefined,
      amountColumn: undefined,
      directionColumn: undefined,
    });
  }

  return (
    <section
      className="mt-5 rounded-xl border border-blue-200 bg-blue-50/40 p-5"
      aria-labelledby="manual-mapping-heading"
    >
      <div>
        <h3
          id="manual-mapping-heading"
          className="font-semibold text-slate-900"
        >
          직접 분석 설정
        </h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          자동 인식이 맞지 않을 때만 사용하세요. 선택한 설정은 기존 날짜·금액
          검증과 동일한 분석 과정으로 처리되며 외부로 전송되지 않습니다.
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {sourceType === "csv" ? (
          <div className="text-sm font-medium text-slate-700">
            분석 대상
            <div className="mt-1 rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-slate-900">
              CSV 파일
            </div>
          </div>
        ) : (
          <label className="text-sm font-medium text-slate-700">
            분석 시트
            <select
              value={mapping.sheetName}
              onChange={(event) => onSheetChange(event.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
            >
              {sheetNames.map((sheetName) => (
                <option key={sheetName} value={sheetName}>
                  {sheetName}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="text-sm font-medium text-slate-700">
          헤더 행
          <select
            value={mapping.headerRowIndex}
            onChange={(event) =>
              onHeaderRowChange(Number(event.target.value))
            }
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
          >
            {Array.from(
              { length: Math.max(1, preview.headerRowLimit) },
              (_, index) => (
                <option key={index} value={index}>
                  {index + 1}행
                </option>
              ),
            )}
          </select>
          <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">
            실제 데이터가 있는 행 중 최대 {MAX_MANUAL_HEADER_ROWS}행까지
            선택할 수 있습니다. {MAX_MANUAL_HEADER_ROWS + 1}행 이후의 헤더는
            지원 범위 밖입니다.
          </span>
        </label>

        <label className="text-sm font-medium text-slate-700">
          금액 구조
          <select
            value={mapping.amountMode}
            onChange={(event) =>
              updateAmountMode(event.target.value as ManualAmountMode)
            }
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
          >
            <option value="split">입금/출금 분리형</option>
            <option value="amount-direction">금액 + 거래구분</option>
            <option value="signed">부호형 단일 금액</option>
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ColumnSelect
          label="거래일"
          value={mapping.dateColumn}
          columns={preview.columns}
          required
          onChange={(dateColumn) =>
            onMappingChange({ ...mapping, dateColumn })
          }
        />
        <ColumnSelect
          label="거래내용/적요"
          value={mapping.descriptionColumn}
          columns={preview.columns}
          onChange={(descriptionColumn) =>
            onMappingChange({
              ...mapping,
              descriptionColumn: descriptionColumn || undefined,
            })
          }
        />
        <ColumnSelect
          label="잔액"
          value={mapping.balanceColumn}
          columns={preview.columns}
          onChange={(balanceColumn) =>
            onMappingChange({
              ...mapping,
              balanceColumn: balanceColumn || undefined,
            })
          }
        />

        {mapping.amountMode === "split" && (
          <>
            <ColumnSelect
              label="입금 컬럼"
              value={mapping.incomeColumn}
              columns={preview.columns}
              onChange={(incomeColumn) =>
                onMappingChange({
                  ...mapping,
                  incomeColumn: incomeColumn || undefined,
                })
              }
            />
            <ColumnSelect
              label="출금 컬럼"
              value={mapping.expenseColumn}
              columns={preview.columns}
              onChange={(expenseColumn) =>
                onMappingChange({
                  ...mapping,
                  expenseColumn: expenseColumn || undefined,
                })
              }
            />
          </>
        )}

        {mapping.amountMode !== "split" && (
          <ColumnSelect
            label="금액 컬럼"
            value={mapping.amountColumn}
            columns={preview.columns}
            required
            onChange={(amountColumn) =>
              onMappingChange({
                ...mapping,
                amountColumn: amountColumn || undefined,
              })
            }
          />
        )}

        {mapping.amountMode === "amount-direction" && (
          <ColumnSelect
            label="거래구분 컬럼"
            value={mapping.directionColumn}
            columns={preview.columns}
            required
            onChange={(directionColumn) =>
              onMappingChange({
                ...mapping,
                directionColumn: directionColumn || undefined,
              })
            }
          />
        )}
      </div>

      <div className="mt-5">
        <h4 className="text-sm font-semibold text-slate-800">
          데이터 미리보기 · 최대 5행
        </h4>

        {preview.columns.length === 0 ? (
          <p className="mt-2 rounded-lg bg-white px-4 py-4 text-sm text-amber-700">
            선택한 행에서 컬럼명을 찾지 못했습니다. 실제 컬럼명이 있는 행을
            헤더 행 번호로 다시 선택해주세요.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  {preview.columns.map((column) => (
                    <th
                      key={column}
                      className="whitespace-nowrap px-3 py-2 text-left font-medium"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {preview.columns.map((column) => (
                      <td
                        key={column}
                        className="max-w-64 truncate px-3 py-2 text-slate-700"
                      >
                        {String(row[column] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
          role="alert"
        >
          <p className="font-semibold text-red-800">
            설정을 확인해주세요.
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-red-700">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onAnalyze}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          이 설정으로 분석
        </button>

        {canReturnToAutomatic && (
          <button
            type="button"
            onClick={onReturnToAutomatic}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            자동 인식으로 되돌리기
          </button>
        )}
      </div>
    </section>
  );
}
