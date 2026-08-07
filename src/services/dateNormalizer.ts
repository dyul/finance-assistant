import * as XLSX from "xlsx";

export type NormalizedDate = `${number}-${number}-${number}`;

export interface DateNormalizationOptions {
  date1904?: boolean;
}

interface ExcelDateParts {
  y: number;
  m: number;
  d: number;
}

const EXCEL_1900_MAX_EXCLUSIVE = 2_958_466;
const EXCEL_1904_MAX_EXCLUSIVE = 2_957_004;

function isExcelDateParts(value: unknown): value is ExcelDateParts {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    Number.isInteger(candidate.y) &&
    Number.isInteger(candidate.m) &&
    Number.isInteger(candidate.d)
  );
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function getDaysInMonth(year: number, month: number): number {
  const daysByMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return daysByMonth[month - 1] ?? 0;
}

function isValidCalendarDate(
  year: number,
  month: number,
  day: number,
): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    year >= 1 &&
    year <= 9999 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= getDaysInMonth(year, month)
  );
}

function formatDate(
  year: number,
  month: number,
  day: number,
): NormalizedDate {
  const yearText = String(year).padStart(4, "0");
  const monthText = String(month).padStart(2, "0");
  const dayText = String(day).padStart(2, "0");

  return `${yearText}-${monthText}-${dayText}` as NormalizedDate;
}

function isValidTimeSuffix(suffix: string): boolean {
  if (suffix.trim() === "") {
    return true;
  }

  const match = suffix.match(
    /^(?:T|\s+)\s*(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:\s*(Z|[+-](\d{2}):?(\d{2})))?\s*$/i,
  );

  if (!match) {
    return false;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  const timezoneHour = match[6] === undefined ? 0 : Number(match[6]);
  const timezoneMinute = match[7] === undefined ? 0 : Number(match[7]);

  return (
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59 &&
    timezoneHour >= 0 &&
    timezoneHour <= 23 &&
    timezoneMinute >= 0 &&
    timezoneMinute <= 59
  );
}

function normalizeExcelSerial(
  value: number,
  options: DateNormalizationOptions,
): NormalizedDate | null {
  const date1904 = options.date1904 === true;
  const maximum = date1904
    ? EXCEL_1904_MAX_EXCLUSIVE
    : EXCEL_1900_MAX_EXCLUSIVE;
  const minimum = date1904 ? 0 : 1;

  if (!Number.isFinite(value) || value < minimum || value >= maximum) {
    return null;
  }

  if (!date1904 && Math.floor(value) === 60) {
    return null;
  }

  const dateSerial = Math.floor(value);
  const parsedDate: unknown = XLSX.SSF.parse_date_code(dateSerial, {
    date1904,
  });

  if (
    !isExcelDateParts(parsedDate) ||
    !isValidCalendarDate(parsedDate.y, parsedDate.m, parsedDate.d)
  ) {
    return null;
  }

  return formatDate(parsedDate.y, parsedDate.m, parsedDate.d);
}

function normalizeDateObject(value: Date): NormalizedDate | null {
  if (Number.isNaN(value.getTime())) {
    return null;
  }

  const year = value.getFullYear();
  const month = value.getMonth() + 1;
  const day = value.getDate();

  if (!isValidCalendarDate(year, month, day)) {
    return null;
  }

  return formatDate(year, month, day);
}

function normalizeDateString(value: string): NormalizedDate | null {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const separatedDate = normalized.match(
    /^(\d{4})\s*([-/.])\s*(\d{1,2})\s*\2\s*(\d{1,2})(.*)$/,
  );
  const koreanDate = normalized.match(
    /^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일(.*)$/,
  );

  let year: number;
  let month: number;
  let day: number;
  let suffix: string;

  if (separatedDate) {
    year = Number(separatedDate[1]);
    month = Number(separatedDate[3]);
    day = Number(separatedDate[4]);
    suffix = separatedDate[5];
  } else if (koreanDate) {
    year = Number(koreanDate[1]);
    month = Number(koreanDate[2]);
    day = Number(koreanDate[3]);
    suffix = koreanDate[4];
  } else {
    return null;
  }

  if (!isValidCalendarDate(year, month, day) || !isValidTimeSuffix(suffix)) {
    return null;
  }

  return formatDate(year, month, day);
}

export function normalizeTransactionDate(
  value: unknown,
  options: DateNormalizationOptions = {},
): NormalizedDate | null {
  if (typeof value === "number") {
    return normalizeExcelSerial(value, options);
  }

  if (value instanceof Date) {
    return normalizeDateObject(value);
  }

  if (typeof value === "string") {
    return normalizeDateString(value);
  }

  return null;
}
