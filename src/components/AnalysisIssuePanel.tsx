import type {
  AnalysisIssue,
  AnalysisIssueSeverity,
} from "../services/analysisIssuePresentation";

const ISSUE_STYLES: Record<
  AnalysisIssueSeverity,
  { panel: string; badge: string; label: string }
> = {
  blocking: {
    panel: "border-red-200 bg-red-50",
    badge: "bg-red-100 text-red-800",
    label: "분석 중단",
  },
  warning: {
    panel: "border-amber-200 bg-amber-50",
    badge: "bg-amber-100 text-amber-800",
    label: "확인 필요",
  },
  info: {
    panel: "border-blue-200 bg-blue-50",
    badge: "bg-blue-100 text-blue-800",
    label: "기능 제한",
  },
};

interface AnalysisIssuePanelProps {
  issues: AnalysisIssue[];
  heading?: string;
  ctaLabel?: string;
  onCta?: () => void;
}

export default function AnalysisIssuePanel({
  issues,
  heading,
  ctaLabel,
  onCta,
}: AnalysisIssuePanelProps) {
  if (issues.length === 0) {
    return null;
  }

  const hasBlockingIssue = issues.some(
    (issue) => issue.severity === "blocking",
  );

  return (
    <section
      className="mt-5 min-w-0 space-y-3"
      aria-label={heading ?? "분석 상태 안내"}
      role={hasBlockingIssue ? "alert" : "status"}
    >
      {heading && (
        <div>
          <h3 className="font-semibold text-slate-900">{heading}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            문제와 분석 영향을 확인한 뒤 안내된 방법으로 수정해주세요.
          </p>
        </div>
      )}

      {issues.map((issue) => {
        const styles = ISSUE_STYLES[issue.severity];

        return (
          <article
            key={issue.id}
            className={`min-w-0 rounded-xl border p-5 ${styles.panel}`}
            data-analysis-issue={issue.id}
          >
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles.badge}`}
            >
              {styles.label}
            </span>
            <h4 className="mt-3 break-words font-bold text-slate-950">
              {issue.title}
            </h4>
            <dl className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
              <div>
                <dt className="font-semibold text-slate-900">문제</dt>
                <dd className="break-words">{issue.description}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900">분석 영향</dt>
                <dd className="break-words">{issue.impact}</dd>
              </div>
              {issue.action && (
                <div>
                  <dt className="font-semibold text-slate-900">해결 방법</dt>
                  <dd className="break-words">{issue.action}</dd>
                </div>
              )}
            </dl>

            {issue.actionHref && (
              <a
                href={issue.actionHref}
                className="mt-4 inline-flex rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
              >
                오류 거래 확인
              </a>
            )}

            {issue.severity === "blocking" && ctaLabel && onCta && (
              <button
                type="button"
                onClick={onCta}
                className="mt-4 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
              >
                {ctaLabel}
              </button>
            )}
          </article>
        );
      })}
    </section>
  );
}
