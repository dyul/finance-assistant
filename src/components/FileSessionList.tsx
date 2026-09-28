import type { FileAnalysisSession, FileAnalysisStatus } from "../services/multiFileSession";

const STATUS_LABELS: Record<FileAnalysisStatus, string> = {
  loading: "분석 중",
  ready: "분석 완료",
  needs_mapping: "직접 설정 필요",
  error: "오류",
};

interface FileSessionListProps {
  sessions: readonly FileAnalysisSession[];
  activeFileSourceId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onReset: () => void;
}

export default function FileSessionList({
  sessions,
  activeFileSourceId,
  onSelect,
  onRemove,
  onReset,
}: FileSessionListProps) {
  if (sessions.length === 0) return null;

  return (
    <section
      className="screen-only mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      aria-labelledby="file-list-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="file-list-heading" className="font-semibold text-slate-900">
            거래내역 파일 {sessions.length}개
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            현재는 각 파일을 개별 분석합니다. 여러 파일의 현금흐름을 합산하지 않습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          전체 초기화
        </button>
      </div>
      <ul className="mt-4 grid gap-3" aria-label="업로드한 파일">
        {sessions.map((session, index) => {
          const id = session.fileSource.id;
          const label = `${index + 1}번째 ${session.fileSource.displayName}`;
          const needsMapping = session.status === "needs_mapping";
          return (
            <li
              key={id}
              className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex sm:items-center sm:justify-between sm:gap-3"
            >
              <div className="min-w-0">
                <p className="break-all font-medium text-slate-900">
                  {session.fileSource.displayName}
                </p>
                <p className="mt-1 text-sm text-slate-600" role="status">
                  {STATUS_LABELS[session.status]}
                  {session.status === "ready" &&
                    ` · ${session.transactionCount.toLocaleString("ko-KR")}건`}
                </p>
                {session.error && (
                  <p className="mt-1 break-words text-sm text-red-700">
                    {session.error}
                  </p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 sm:mt-0 sm:shrink-0">
                <button
                  type="button"
                  aria-pressed={id === activeFileSourceId}
                  aria-label={`${label} ${needsMapping ? "설정" : "보기"}`}
                  onClick={() => onSelect(id)}
                  className="rounded-md border border-blue-300 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                >
                  {needsMapping ? "설정" : "보기"}
                </button>
                <button
                  type="button"
                  aria-label={`${label} 제거`}
                  onClick={() => onRemove(id)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  제거
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
