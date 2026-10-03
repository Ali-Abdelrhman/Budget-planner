import { useEffect, useRef, useState } from 'react'
import { db, exportBackup, importBackup } from '../db/db'
import { WEEKDAY_SHORT, type Weekday } from '../domain/calendar'
import type { Theme } from '../domain/types'
import { useSettings } from '../hooks/useMonthData'

export function SettingsPanel() {
  const settings = useSettings()
  const fileRef = useRef<HTMLInputElement>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
  }, [])

  const update = (patch: Partial<typeof settings>) => db.settings.put({ ...settings, ...patch })

  const toggleWeekday = (d: number) => {
    const set = new Set(settings.defaultOfficeWeekdays)
    if (set.has(d)) set.delete(d)
    else set.add(d)
    void update({ defaultOfficeWeekdays: [...set].sort() })
  }

  const doExport = async () => {
    const data = await exportBackup()
    const name = `qersh-backup-${data.exportedAt.slice(0, 10)}.json`
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const file = new File([blob], name, { type: 'application/json' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Qersh backup' })
        setMessage('Backup shared.')
        return
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
      }
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage('Backup downloaded.')
  }

  const doImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      if (!confirm('Replace everything on this device with this backup?')) return
      await importBackup(data)
      setMessage('Backup restored.')
    } catch (e) {
      setMessage((e as Error).message || 'Could not read that file.')
    }
  }

  const askPersist = async () => {
    const ok = await navigator.storage?.persist?.()
    setPersisted(Boolean(ok))
  }

  return (
    <div>
      <div className="settings-row">
        <div className="eyebrow">Week starts on</div>
        <div className="seg" role="group" aria-label="Week start">
          {([6, 0, 1] as Weekday[]).map((d) => (
            <button key={d} aria-pressed={settings.weekStartsOn === d} onClick={() => update({ weekStartsOn: d })}>
              {WEEKDAY_SHORT[d]}
            </button>
          ))}
        </div>
        <p>Weekly balances reset their window on this day. Leftovers still roll forward.</p>
      </div>

      <div className="settings-row">
        <div className="eyebrow">Default office days</div>
        <div className="chips">
          {WEEKDAY_SHORT.map((label, d) => (
            <button key={label} className="chip" aria-pressed={settings.defaultOfficeWeekdays.includes(d)} onClick={() => toggleWeekday(d)}>
              {label}
            </button>
          ))}
        </div>
        <p>Used to pre-fill the calendar for each new month. You can still change single days on the Month screen.</p>
      </div>

      <div className="settings-row">
        <div className="eyebrow">Appearance</div>
        <div className="seg" role="group" aria-label="Theme">
          {(['system', 'light', 'dark'] as Theme[]).map((t) => (
            <button key={t} aria-pressed={settings.theme === t} onClick={() => update({ theme: t })}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-row">
        <div className="eyebrow">Backup</div>
        <p>Your data lives only on this device. Export a backup now and then, for example to Files or iCloud Drive.</p>
        <div className="row-actions">
          <button className="btn btn-primary" onClick={doExport}>
            Export backup
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Restore from file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void doImport(f)
              e.target.value = ''
            }}
          />
        </div>
        {message && <p style={{ color: 'var(--ink)' }}>{message}</p>}
      </div>

      <div className="settings-row">
        <div className="eyebrow">Storage</div>
        <p>
          {persisted === true && 'Storage is marked as persistent. The browser will not clear it on its own.'}
          {persisted === false && 'Storage is not marked as persistent yet.'}
          {persisted === null && 'This browser does not report storage persistence.'}
        </p>
        {persisted === false && (
          <div>
            <button className="btn" onClick={askPersist}>
              Keep my data
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
