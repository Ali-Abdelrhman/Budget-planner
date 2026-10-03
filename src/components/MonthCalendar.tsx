import { fromISO, WEEKDAY_SHORT, weekdayOf, type ISODate, type Weekday } from '../domain/calendar'
import { formatAmount } from '../domain/money'

interface Props {
  days: ISODate[]
  officeDays: Set<ISODate>
  weekStartsOn: Weekday
  today: ISODate
  dayTotals?: number[]
  onToggle: (day: ISODate) => void
}

export function MonthCalendar({ days, officeDays, weekStartsOn, today, dayTotals, onToggle }: Props) {
  const lead = (weekdayOf(days[0]) - weekStartsOn + 7) % 7
  const order = Array.from({ length: 7 }, (_, i) => WEEKDAY_SHORT[(weekStartsOn + i) % 7])
  return (
    <div className="cal" role="grid" aria-label="Office days">
      {order.map((d) => (
        <div key={d} className="cal-dow" role="columnheader">
          {d}
        </div>
      ))}
      {Array.from({ length: lead }, (_, i) => (
        <div key={`b${i}`} className="cal-day blank" aria-hidden="true" />
      ))}
      {days.map((d, i) => {
        const office = officeDays.has(d)
        const total = dayTotals?.[i] ?? 0
        return (
          <button
            key={d}
            type="button"
            className={`cal-day ${office ? 'office' : ''} ${d === today ? 'today' : ''}`}
            aria-pressed={office}
            aria-label={`${fromISO(d).toDateString()}${office ? ', office day' : ''}`}
            onClick={() => onToggle(d)}
          >
            <span className="n">{fromISO(d).getDate()}</span>
            {office && <span className="o">Office</span>}
            <span className="s">{total > 0 ? formatAmount(total) : ''}</span>
          </button>
        )
      })}
    </div>
  )
}
