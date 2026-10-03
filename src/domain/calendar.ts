import { addMonths, format, getDaysInMonth } from 'date-fns'

export type ISODate = string
export type MonthKey = string
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export function toISO(d: Date): ISODate {
  return format(d, 'yyyy-MM-dd')
}

export function fromISO(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayISO(now = new Date()): ISODate {
  return toISO(now)
}

export function monthKeyOf(isoOrDate: ISODate | Date): MonthKey {
  const d = typeof isoOrDate === 'string' ? fromISO(isoOrDate) : isoOrDate
  return format(d, 'yyyy-MM')
}

export function monthStart(month: MonthKey): Date {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  return format(addMonths(monthStart(month), delta), 'yyyy-MM')
}

export function monthLabel(month: MonthKey): string {
  return format(monthStart(month), 'MMMM yyyy')
}

export function monthName(month: MonthKey): string {
  return format(monthStart(month), 'MMMM')
}

export function monthDays(month: MonthKey): ISODate[] {
  const start = monthStart(month)
  const count = getDaysInMonth(start)
  const days: ISODate[] = []
  for (let i = 1; i <= count; i++) {
    days.push(toISO(new Date(start.getFullYear(), start.getMonth(), i)))
  }
  return days
}

export function weekdayOf(iso: ISODate): Weekday {
  return fromISO(iso).getDay() as Weekday
}

/** Splits the month's days into weeks that start on `weekStartsOn`. First and last weeks may be partial. */
export function weeksOfMonth(month: MonthKey, weekStartsOn: Weekday): ISODate[][] {
  const weeks: ISODate[][] = []
  let current: ISODate[] = []
  for (const day of monthDays(month)) {
    if (current.length > 0 && weekdayOf(day) === weekStartsOn) {
      weeks.push(current)
      current = []
    }
    current.push(day)
  }
  if (current.length) weeks.push(current)
  return weeks
}

export function defaultOfficeDays(month: MonthKey, weekdays: number[]): ISODate[] {
  return monthDays(month).filter((d) => weekdays.includes(weekdayOf(d)))
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
