export type NormalizedDate = `${number}-${number}-${number}`;
export type NormalizedTime = `${number}:${number}:${number}`;

export interface NormalizedTransactionDateTime {
  date: NormalizedDate;
  time: NormalizedTime | null;
}

export interface DateNormalizationOptions {
  date1904?: boolean;
}

export type DateNormalizationResult =
  | {
      status: "valid";
      value: NormalizedDate;
      originalValue: unknown;
    }
  | {
      status: "invalid";
      originalValue: unknown;
      reason: string;
    };

const EXCEL_1900_MAX_EXCLUSIVE = 2_958_466;
const EXCEL_1904_MAX_EXCLUSIVE = 2_957_004;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const SECONDS_PER_DAY = 24 * 60 * 60;

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

function formatTime(
  hour: number,
  minute: number,
  second: number,
): NormalizedTime {
  const hourText = String(hour).padStart(2, "0");
  const minuteText = String(minute).padStart(2, "0");
  const secondText = String(second).padStart(2, "0");

  return `${hourText}:${minuteText}:${secondText}` as NormalizedTime;
}

function normalizeTimeSuffix(
  suffix: string,
): { valid: true; time: NormalizedTime | null } | { valid: false } {
  if (suffix.trim() === "") {
    return { valid: true, time: null };
  }

  const match = suffix.match(
    /^(?:T|\s+)\s*(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:\s*(Z|[+-](\d{2}):?(\d{2})))?\s*$/i,
  );

  if (!match) {
    return { valid: false };
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  const timezoneHour = match[6] === undefined ? 0 : Number(match[6]);
  const timezoneMinute = match[7] === undefined ? 0 : Number(match[7]);

  const valid =
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59 &&
    timezoneHour >= 0 &&
    timezoneHour <= 23 &&
    timezoneMinute >= 0 &&
    timezoneMinute <= 59;

  return valid
    ? { valid: true, time: formatTime(hour, minute, second) }
    : { valid: false };
}

function normalizeExcelSerial(
  value: number,
  options: DateNormalizationOptions,
): NormalizedTransactionDateTime | null {
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
  const adjustedSerial =
    !date1904 && dateSerial > 60 ? dateSerial - 1 : dateSerial;
  const epoch = date1904
    ? Date.UTC(1904, 0, 1)
    : Date.UTC(1899, 11, 31);
  const parsedDate = new Date(
    epoch + adjustedSerial * MILLISECONDS_PER_DAY,
  );
  const year = parsedDate.getUTCFullYear();
  const month = parsedDate.getUTCMonth() + 1;
  const day = parsedDate.getUTCDate();

  if (
    Number.isNaN(parsedDate.getTime()) ||
    !isValidCalendarDate(year, month, day)
  ) {
    return null;
  }

  const fraction = value - dateSerial;
  const roundedSeconds = Math.round(fraction * SECONDS_PER_DAY);
  const secondsSinceMidnight = Math.min(
    SECONDS_PER_DAY - 1,
    Math.max(0, roundedSeconds),
  );
  const hour = Math.floor(secondsSinceMidnight / 3600);
  const minute = Math.floor((secondsSinceMidnight % 3600) / 60);
  const second = secondsSinceMidnight % 60;

  return {
    date: formatDate(year, month, day),
    time: fraction === 0 ? null : formatTime(hour, minute, second),
  };
}

function normalizeDateObject(
  value: Date,
): NormalizedTransactionDateTime | null {
  if (Number.isNaN(value.getTime())) {
    return null;
  }

  const year = value.getFullYear();
  const month = value.getMonth() + 1;
  const day = value.getDate();

  if (!isValidCalendarDate(year, month, day)) {
    return null;
  }

  return {
    date: formatDate(year, month, day),
    time:
      value.getHours() !== 0 ||
      value.getMinutes() !== 0 ||
      value.getSeconds() !== 0 ||
      value.getMilliseconds() !== 0
        ? formatTime(value.getHours(), value.getMinutes(), value.getSeconds())
        : null,
  };
}

function normalizeDateString(
  value: string,
): NormalizedTransactionDateTime | null {
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
  const compactDate = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);

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
  } else if (compactDate) {
    year = Number(compactDate[1]);
    month = Number(compactDate[2]);
    day = Number(compactDate[3]);
    suffix = "";
  } else {
    return null;
  }

  const normalizedTime = normalizeTimeSuffix(suffix);

  if (!isValidCalendarDate(year, month, day) || !normalizedTime.valid) {
    return null;
  }

  return {
    date: formatDate(year, month, day),
    time: normalizedTime.time,
  };
}

function normalizeTransactionDateTimeValue(
  value: unknown,
  options: DateNormalizationOptions = {},
): NormalizedTransactionDateTime | null {
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      const compactDate = String(value);

      if (/^\d{8}$/.test(compactDate)) {
        return normalizeDateString(compactDate);
      }
    }

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

function getInvalidDateReason(value: unknown): string {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return "날짜 값이 비어 있습니다.";
  }

  if (value instanceof Date) {
    return "유효하지 않은 Date 객체입니다.";
  }

  if (typeof value === "number") {
    return "유효한 Excel 날짜 일련번호 또는 YYYYMMDD 값이 아닙니다.";
  }

  if (typeof value === "string") {
    return "지원하지 않거나 존재하지 않는 날짜입니다.";
  }

  return "지원하지 않는 날짜 값 형식입니다.";
}

export function normalizeTransactionDateResult(
  value: unknown,
  options: DateNormalizationOptions = {},
): DateNormalizationResult {
  const normalizedDateTime = normalizeTransactionDateTimeValue(value, options);

  if (normalizedDateTime !== null) {
    return {
      status: "valid",
      value: normalizedDateTime.date,
      originalValue: value,
    };
  }

  return {
    status: "invalid",
    originalValue: value,
    reason: getInvalidDateReason(value),
  };
}

export function normalizeTransactionDateTime(
  value: unknown,
  options: DateNormalizationOptions = {},
): NormalizedTransactionDateTime | null {
  return normalizeTransactionDateTimeValue(value, options);
}

export function normalizeTransactionDate(
  value: unknown,
  options: DateNormalizationOptions = {},
): NormalizedDate | null {
  const result = normalizeTransactionDateResult(value, options);

  return result.status === "valid" ? result.value : null;
}
