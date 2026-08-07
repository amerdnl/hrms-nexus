import type { AttendanceStatus } from "../types/attendance.js";

const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";
const LATE_TIME = "09:00:00";

interface MalaysiaDateTime {
  date: string;
  time: string;
}

export function getMalaysiaDateTime(): MalaysiaDateTime {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: MALAYSIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(new Date());

  const getPart = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  const hour = getPart("hour");
  const minute = getPart("minute");
  const second = getPart("second");

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}:${second}`,
  };
}

export function determineAttendanceStatus(
  checkInTime: string,
): AttendanceStatus {
  return checkInTime > LATE_TIME ? "late" : "present";
}
