import Header from "../components/Header";
import UploadArea from "../components/UploadArea";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-slate-100">
      <Header />

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="screen-only mb-8">
          <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
          <p className="mt-1 text-sm text-slate-500">
            재무 엑셀을 업로드하여 분석을 시작하세요.
          </p>
        </div>

        <UploadArea />
      </main>
    </div>
  );
}
