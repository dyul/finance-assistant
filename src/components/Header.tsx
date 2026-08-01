export default function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Finance Assistant
          </h1>
          <p className="text-sm text-slate-500">AI Financial Copilot</p>
        </div>

        <div className="rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
          dyul
        </div>
      </div>
    </header>
  );
}