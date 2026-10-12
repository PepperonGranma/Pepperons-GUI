import { Command, Search, Sparkles, Trash2 } from 'lucide-react'
import { api } from '../api'
import { CommandCard } from '../CommandCard'
import { PageFrame, EmptyState } from '../controls'
import { applyGuidedOptionValue, getGuidedOptionValue } from '../options'
import type { CliOption, LogEntry, StudioConfig } from '../types'

const ONE_SHOT_OPTIONS = new Set(['--list-apps', '--list-camera-sizes', '--list-cameras', '--list-displays', '--list-encoders'])

export function OptionsPage({ options, config, setConfig, search, onSearch, category, onCategory, addLog }: {
  options: CliOption[]; config: StudioConfig; setConfig: React.Dispatch<React.SetStateAction<StudioConfig>>; search: string;
  onSearch(value: string): void; category: string; onCategory(value: string): void; addLog(level: LogEntry['level'], text: string): void
}) {
  const categories = ['All', ...Array.from(new Set(options.map((item) => item.category))).sort()]
  const filtered = options.filter((option) => {
    const query = search.toLowerCase().trim()
    return (category === 'All' || option.category === category) && (!query || `${option.name} ${option.description} ${option.category}`.toLowerCase().includes(query))
  })
  const activeCount = Object.values(config.extras).filter(Boolean).length
  function setExtra(option: CliOption, value: boolean | string) {
    setConfig((current) => {
      const guided = applyGuidedOptionValue(current, option.name, value)
      if (guided) return guided
      const extras = { ...current.extras }
      if ((value === true || (typeof value === 'string' && value.trim())) && ['--select-usb', '--select-tcpip', '--tcpip'].includes(option.name)) {
        for (const selector of ['--select-usb', '--select-tcpip', '--tcpip']) delete extras[selector]
      }
      extras[option.name] = value
      return { ...current, extras }
    })
  }
  return <PageFrame title="Every command" subtitle="The complete Scrcpy option surface, refreshed from your installed runtime." icon={<Command />} badge={`${options.length} FLAGS`}>
    <div className="option-toolbar">
      <label><Search size={17} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Filter by flag or description…" /></label>
      <div className="category-scroll">{categories.map((item) => <button className={category === item ? 'active' : ''} key={item} onClick={() => onCategory(item)}>{item}</button>)}</div>
      {activeCount > 0 && <button className="clear-options" onClick={() => setConfig((current) => ({ ...current, extras: {} }))}><Trash2 size={14} />Clear {activeCount}</button>}
    </div>
    <div className="options-meta"><span>Showing {filtered.length} commands</span><span><Sparkles size={14} />Known fields are synchronized with the guided controls</span></div>
    <div className="option-list">
      {filtered.map((option) => {
        const guided = getGuidedOptionValue(config, option.name)
        const current = guided !== undefined ? guided : config.extras[option.name]
        return <CommandCard key={option.name} option={option} current={current} onChange={value => setExtra(option, value)} oneShot={ONE_SHOT_OPTIONS.has(option.name)} canRun={Boolean(config.serial)} onRun={async () => {
          const result = await api.runScrcpyAction([`--serial=${config.serial}`, option.name]).catch(error => ({ code: 1, output: error.message }))
          addLog(result.code === 0 ? 'success' : 'error', result.output)
        }} />
      })}
      {!filtered.length && <EmptyState icon={<Search />} title="No matching command" text="Try a broader name or choose another category." />}
    </div>
  </PageFrame>
}
