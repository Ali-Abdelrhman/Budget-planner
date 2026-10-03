import { monthLabel, shiftMonth, type MonthKey } from '../domain/calendar'
import { Icon } from './Icon'

export function MonthSwitch({ month, onChange }: { month: MonthKey; onChange: (m: MonthKey) => void }) {
  return (
    <div className="month-switch">
      <button className="icon-btn" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month">
        <Icon name="left" size={18} />
      </button>
      <span className="label">{monthLabel(month)}</span>
      <button className="icon-btn" onClick={() => onChange(shiftMonth(month, 1))} aria-label="Next month">
        <Icon name="right" size={18} />
      </button>
    </div>
  )
}
