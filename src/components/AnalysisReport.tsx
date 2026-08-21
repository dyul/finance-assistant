import type { ActionGuideItem } from "../services/actionGuide";
import type { CategorySummary } from "../services/categoryAggregator";
import type { DataQualitySummary } from "../services/dataQualityAnalyzer";
import type { FinancialSummary } from "../services/financialEngine";
import type { ForecastAnalysis } from "../services/forecastEngine";
import type { FutureSourceForecastScope } from "../services/futureSourceTransaction";
import { createForecastSummary } from "../services/forecastPresentation";
import type { ForecastScenario } from "../services/forecastScenario";
import type { MonthlySummary } from "../services/monthlyAggregator";
import type { ForecastStartingBalanceSource } from "../services/manualBalance";
import {
  formatReportCurrency,
  formatReportDate,
  formatReportMonth,
  formatReportSignedCurrency,
  getActionPriorityLabel,
  getRiskLabel,
  getScenarioLabel,
} from "../services/reportPresentation";

export interface AnalysisReportProps {
  fileName: string;
  sheetName: string;
  generatedAt: Date;
  summary: FinancialSummary;
  fileLatestBalance: number | null;
  forecastStartingBalance: number | null;
  forecastStartingBalanceSource: ForecastStartingBalanceSource;
  dataQuality: DataQualitySummary;
  monthlySummaries: MonthlySummary[];
  analysis: ForecastAnalysis;
  selectedScenario: ForecastScenario;
  actionGuideItems: ActionGuideItem[];
  categorySummaries: CategorySummary[];
  futureSourceForecastScope?: FutureSourceForecastScope;
}

function ReportMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="report-card rounded-lg border border-slate-300 p-3">
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className="mt-1 font-bold text-slate-950">{value}</dd>
    </div>
  );
}

export default function AnalysisReport({
  fileName,
  sheetName,
  generatedAt,
  summary,
  fileLatestBalance,
  forecastStartingBalance,
  forecastStartingBalanceSource,
  dataQuality,
  monthlySummaries,
  analysis,
  selectedScenario,
  actionGuideItems,
  categorySummaries,
  futureSourceForecastScope,
}: AnalysisReportProps) {
  const { forecasts, cashRisk } = analysis;
  const forecastSummary = createForecastSummary(forecasts, cashRisk);
  const topExpenseCategories = [...categorySummaries]
    .sort((first, second) => second.amount - first.amount)
    .slice(0, 5);
  const hasDataQualityWarning =
    dataQuality.invalidAmountCount > 0 ||
    dataQuality.invalidDateCount > 0 ||
    dataQuality.directionIssueCount > 0;

  return (
    <article className="print-only analysis-report text-slate-950">
      <header className="report-header border-b-2 border-slate-900 pb-4">
        <p className="text-sm font-semibold text-slate-600">
          Finance Assistant
        </p>
        <h1 className="mt-1 text-2xl font-bold">현금흐름 분석 리포트</h1>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-slate-500">원본 파일명</dt>
            <dd className="mt-1 font-semibold">{fileName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">분석 대상</dt>
            <dd className="mt-1 font-semibold">{sheetName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">리포트 생성일</dt>
            <dd className="mt-1 font-semibold">
              {formatReportDate(generatedAt)}
            </dd>
          </div>
        </dl>
      </header>

      <section className="report-section mt-6" aria-labelledby="report-summary">
        <h2 id="report-summary" className="text-lg font-bold">
          핵심 재무 요약
        </h2>
        <dl className="mt-3 grid grid-cols-5 gap-2 text-sm">
          <ReportMetric
            label="총 입금"
            value={formatReportCurrency(summary.totalIncome)}
          />
          <ReportMetric
            label="총 출금"
            value={formatReportCurrency(summary.totalExpense)}
          />
          <ReportMetric
            label="순현금흐름"
            value={formatReportSignedCurrency(summary.netCashFlow)}
          />
          <ReportMetric
            label={
              forecastStartingBalanceSource === "manual"
                ? "전망 시작 잔액 (직접 입력)"
                : "최근 거래 기준 잔액"
            }
            value={
              forecastStartingBalanceSource === "manual"
                ? forecastStartingBalance === null
                  ? "해당 없음"
                  : formatReportCurrency(forecastStartingBalance)
                : fileLatestBalance === null
                  ? "해당 없음"
                  : formatReportCurrency(fileLatestBalance)
            }
          />
          <ReportMetric
            label="실적 분석 거래 건수"
            value={`${summary.transactionCount.toLocaleString("ko-KR")}건`}
          />
        </dl>
      </section>

      <section className="report-section mt-6" aria-labelledby="report-quality">
        <h2 id="report-quality" className="text-lg font-bold">
          데이터 품질
        </h2>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <ReportMetric
            label="전체 거래"
            value={`${dataQuality.totalTransactionCount}건`}
          />
          <ReportMetric
            label="실적 분석 포함"
            value={`${dataQuality.historicalTransactionCount}건`}
          />
          <ReportMetric
            label="금액 계산 포함"
            value={`${dataQuality.amountIncludedCount}건`}
          />
          <ReportMetric
            label="날짜 기반 분석 포함"
            value={`${dataQuality.dateAnalysisIncludedCount}건`}
          />
          <ReportMetric
            label="금액 오류"
            value={`${dataQuality.invalidAmountCount}건`}
          />
          <ReportMetric
            label="날짜 오류"
            value={`${dataQuality.invalidDateCount}건`}
          />
          <ReportMetric
            label="방향 오류·충돌"
            value={`${dataQuality.directionIssueCount}건`}
          />
          <ReportMetric
            label="미래 날짜 거래"
            value={`${dataQuality.futureDatedTransactionCount}건`}
          />
        </dl>
        {hasDataQualityWarning && (
          <p className="report-warning mt-3 border-l-4 border-amber-500 bg-amber-50 p-3 text-sm">
            일부 거래가 날짜 또는 금액 기반 분석에서 제외되었거나 미래 날짜
            정책에 따라 실적에서 제외되었습니다.
          </p>
        )}
        {dataQuality.futureDatedTransactionCount > 0 && (
          <p className="mt-3 border-l-4 border-blue-500 bg-blue-50 p-3 text-sm">
            미래 날짜 거래는 과거 실적에서 제외했습니다. 유효한 거래 중 현재 3개월 전망 범위 안의 거래는 전망에 자동 반영했습니다.
          </p>
        )}
      </section>

      <section className="report-section mt-6" aria-labelledby="report-monthly">
        <h2 id="report-monthly" className="text-lg font-bold">
          월별 현금흐름
        </h2>
        <table className="report-table mt-3 w-full border-collapse text-sm">
          <thead>
            <tr>
              <th>기준월</th>
              <th>총 입금</th>
              <th>총 출금</th>
              <th>순현금흐름</th>
              <th>거래 건수</th>
            </tr>
          </thead>
          <tbody>
            {monthlySummaries.map((item) => (
              <tr key={item.month}>
                <td>{formatReportMonth(item.month)}</td>
                <td>{formatReportCurrency(item.income)}</td>
                <td>{formatReportCurrency(item.expense)}</td>
                <td>{formatReportSignedCurrency(item.netCashFlow)}</td>
                <td>{item.transactionCount}건</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="report-section mt-6" aria-labelledby="report-forecast">
        <div className="flex items-end justify-between gap-4">
          <h2 id="report-forecast" className="text-lg font-bold">
            향후 3개월 전망
          </h2>
          <p className="text-sm font-semibold">
            예상 범위: {getScenarioLabel(selectedScenario)}
          </p>
        </div>
        {forecasts.length > 0 ? (
          <table className="report-table report-forecast-table mt-3 w-full border-collapse">
            <thead>
              <tr>
                <th>예상월</th>
                <th>시작 잔액</th>
                <th>반복 입금</th>
                <th>예정 입금</th>
                <th>반복 출금</th>
                <th>예정 출금</th>
                <th>순현금흐름</th>
                <th>월말 잔액</th>
              </tr>
            </thead>
            <tbody>
              {forecasts.map((forecast) => (
                <tr key={forecast.month}>
                  <td>{formatReportMonth(forecast.month)}</td>
                  <td>{formatReportCurrency(forecast.startingBalance)}</td>
                  <td>{formatReportCurrency(forecast.recurringIncome)}</td>
                  <td>{formatReportCurrency(forecast.scheduledIncome)}</td>
                  <td>{formatReportCurrency(forecast.recurringExpense)}</td>
                  <td>{formatReportCurrency(forecast.scheduledExpense)}</td>
                  <td>
                    {formatReportSignedCurrency(forecast.expectedNetCashFlow)}
                  </td>
                  <td>
                    {formatReportCurrency(forecast.expectedEndingBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-sm">향후 3개월 전망 결과가 없습니다.</p>
        )}
      </section>

      <section className="report-section mt-6" aria-labelledby="report-forecast-summary">
        <h2 id="report-forecast-summary" className="text-lg font-bold">
          향후 3개월 전망 핵심 요약
        </h2>
        <dl className="mt-3 grid grid-cols-4 gap-2 text-sm">
          <ReportMetric
            label="3개월 후 예상 잔액"
            value={
              forecastSummary.endingBalance === null
                ? "-"
                : formatReportCurrency(forecastSummary.endingBalance)
            }
          />
          <ReportMetric
            label="3개월 누적 순현금흐름"
            value={formatReportSignedCurrency(
              forecastSummary.cumulativeNetCashFlow,
            )}
          />
          <ReportMetric
            label="최저 예상 잔액"
            value={
              forecastSummary.lowestBalance === null
                ? "-"
                : formatReportCurrency(forecastSummary.lowestBalance)
            }
          />
          <ReportMetric
            label="자금 부족 예상 기간"
            value={`${forecastSummary.negativeMonthCount}개월`}
          />
        </dl>
      </section>

      <section className="report-section mt-6" aria-labelledby="report-risk">
        <h2 id="report-risk" className="text-lg font-bold">
          현금 위험 분석
        </h2>
        {cashRisk ? (
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <ReportMetric label="위험 수준" value={getRiskLabel(cashRisk.level)} />
            <ReportMetric
              label="최저 예상 잔액"
              value={formatReportCurrency(cashRisk.lowestBalance)}
            />
            <ReportMetric
              label="최저 잔액 예상월"
              value={formatReportMonth(cashRisk.lowestBalanceMonth)}
            />
            <ReportMetric
              label="자금 부족 예상 기간"
              value={`${cashRisk.negativeMonthCount}개월`}
            />
            <ReportMetric
              label="회복 예상월"
              value={
                cashRisk.recoveryMonth
                  ? formatReportMonth(cashRisk.recoveryMonth)
                  : "해당 없음"
              }
            />
            <ReportMetric
              label="필요한 현금 여유(버퍼)"
              value={formatReportCurrency(cashRisk.requiredCashBuffer)}
            />
          </dl>
        ) : (
          <p className="mt-3 text-sm">현금 위험 분석 결과가 없습니다.</p>
        )}
      </section>

      <section className="report-section mt-6" aria-labelledby="report-actions">
        <h2 id="report-actions" className="text-lg font-bold">
          추천 액션
        </h2>
        {actionGuideItems.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {actionGuideItems.map((item) => (
              <article
                key={item.id}
                className="report-card rounded-lg border border-slate-300 p-3"
              >
                <p className="text-xs font-bold">
                  우선순위: {getActionPriorityLabel(item.priority)}
                </p>
                <h3 className="mt-1 font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-5">{item.message}</p>
                <p className="mt-2 text-sm font-semibold leading-5">
                  권장 행동: {item.action}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm">현재 추가 권장 액션이 없습니다.</p>
        )}
      </section>

      <section className="report-section mt-6" aria-labelledby="report-expenses">
        <h2 id="report-expenses" className="text-lg font-bold">
          주요 지출
        </h2>
        {topExpenseCategories.length > 0 ? (
          <table className="report-table mt-3 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th>카테고리</th>
                <th>지출액</th>
                <th>전체 지출 비중</th>
              </tr>
            </thead>
            <tbody>
              {topExpenseCategories.map((item) => (
                <tr key={item.category}>
                  <td>{item.categoryName}</td>
                  <td>{formatReportCurrency(item.amount)}</td>
                  <td>{item.shareOfExpense.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-sm">지출 내역이 없습니다.</p>
        )}
      </section>

      <section className="report-section report-notice mt-6 border-t border-slate-400 pt-4">
        <h2 className="text-base font-bold">분석 기준 및 주의사항</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-700">
          <li>본 결과는 업로드한 거래내역을 기반으로 한 추정치입니다.</li>
          <li>
            향후 3개월 전망은 과거 반복거래, 최근 수입 추세, 파일에서 자동 반영한 미래 거래와 사용자가 입력한 확정 예정 거래를 기반으로 한 추정치입니다.
          </li>
          {futureSourceForecastScope &&
            (futureSourceForecastScope.included.length > 0 ||
              futureSourceForecastScope.outOfHorizon.length > 0) && (
              <li>
                파일의 유효한 미래 거래 중 {futureSourceForecastScope.included.length.toLocaleString("ko-KR")}건을 현재 전망에 자동 반영했고, {futureSourceForecastScope.outOfHorizon.length.toLocaleString("ko-KR")}건은 3개월 전망 기간 밖이라 현재 계산에 반영하지 않았습니다.
              </li>
            )}
          <li>
            보수·기준·낙관 예상은 미래 결과를 보장하지 않습니다.
          </li>
          <li>실제 입출금 시점과 금액에 따라 결과가 달라질 수 있습니다.</li>
          <li>
            데이터 오류로 제외된 거래가 있으면 분석 결과와 전체 합계가
            달라질 수 있습니다.
          </li>
          {forecastStartingBalanceSource === "manual" && (
            <li>
              전망 시작 잔액은 사용자가 직접 입력한 값이며 과거 입출금
              분석에는 반영되지 않았습니다.
            </li>
          )}
        </ul>
      </section>
    </article>
  );
}
