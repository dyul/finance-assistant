export default function Header() {
  return (
    <header className="screen-only border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">
              Finance Assistant
            </h1>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
              MVP Beta
            </span>
          </div>
          <p className="text-sm text-slate-500">
            개인사업자를 위한 3개월 현금흐름 전망
          </p>
        </div>

        <div className="rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
          브라우저 전용 분석
        </div>
      </div>
    </header>
  );
}
