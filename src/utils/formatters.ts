export function formatCurrency(value: number): string {
  const roundedValue = Math.round(value);
  const formattedValue = Math.abs(roundedValue).toLocaleString("ko-KR");

  return roundedValue < 0
    ? `-${formattedValue}원`
    : `${formattedValue}원`;
}

export function formatSignedCurrency(value: number): string {
  return value > 0 ? `+${formatCurrency(value)}` : formatCurrency(value);
}

export function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-");

  return year && monthNumber
    ? `${year}년 ${Number(monthNumber)}월`
    : month;
}
