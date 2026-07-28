function App() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f7fb",
        padding: "40px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>Finance Assistant</h1>
      <p>AI Financial Copilot</p>

      <hr />

      <h2>📂 Excel Upload</h2>
      <button>파일 업로드 (준비중)</button>

      <hr />

      <h2>📊 Dashboard</h2>

      <ul>
        <li>매출</li>
        <li>영업이익</li>
        <li>현금흐름</li>
      </ul>

      <hr />

      <h2>🤖 AI Analysis</h2>

      <p>AI 분석 결과가 여기에 표시됩니다.</p>

      <hr />

      <h2>📄 Reports</h2>

      <p>보고서 생성 기능 준비중</p>
    </div>
  );
}

export default App;