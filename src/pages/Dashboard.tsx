import Header from "../components/Header";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-slate-100">
      <Header />

      <main className="mx-auto max-w-7xl p-6">
        <h2 className="mb-6 text-2xl font-bold text-slate-800">
          Dashboard
        </h2>

        <p className="text-slate-600">
          Finance Assistant MVP 개발을 시작합니다.
        </p>
      </main>
    </div>
  );
}