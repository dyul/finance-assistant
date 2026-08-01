# Finance Assistant Architecture

## Overall Flow

```text
User
    │
    ▼
Upload Excel
    │
    ▼
Excel Parser
    │
    ▼
AI Structure Analyzer
    │
    ▼
Standard Data Model
    │
    ▼
Financial Engine
    │
    ▼
AI Insight Generator
    │
    ▼
Dashboard / PDF Report
```

---

## Standard Data Model

모든 업로드 파일은 내부적으로 표준 데이터 모델로 변환한다.

예시

### 거래내역

- Date
- Amount
- Description
- Category

### 손익계산서

- Period
- Revenue
- Expense
- Operating Profit
- Net Profit

---

## AI Responsibility

AI는

- 파일 유형 판별
- 컬럼 의미 추론
- 인사이트 생성

만 담당한다.

---

## Code Responsibility

프로그램은

- KPI 계산
- 통계
- 차트
- 보고서 생성

을 담당한다.