import { useRef, useState } from 'react'
import {
  configurationStorageKey, makeConfiguration, parseConfiguration, parseConfigurationLibrary,
} from './model/savedConfigurations'
import type { SavedConfiguration, ScenarioState } from './model/savedConfigurations'

function download(configuration: SavedConfiguration) {
  const blob = new Blob([JSON.stringify(configuration, null, 2) + '\n'], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${configuration.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scenario'}.json`
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function SavedConfigurationsPanel({ scenario, onLoad }: {
  scenario: ScenarioState
  onLoad: (scenario: ScenarioState) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [saved, setSaved] = useState<SavedConfiguration[]>(() => {
    try { return parseConfigurationLibrary(localStorage.getItem(configurationStorageKey)) } catch { return [] }
  })
  const [status, setStatus] = useState('')

  const persist = (next: SavedConfiguration[]): boolean => {
    try {
      localStorage.setItem(configurationStorageKey, JSON.stringify(next))
      setSaved(next)
      return true
    } catch {
      setStatus('Browser storage is unavailable or full. Export a JSON copy instead.')
      return false
    }
  }
  const save = () => {
    try {
      const label = name.trim()
      if (!label) { setStatus('Give this scenario a name before saving.'); return }
      const previous = saved.find(item => item.name.toLowerCase() === label.toLowerCase())
      const updated = makeConfiguration(label, scenario, previous?.id)
      if (persist(previous ? saved.map(item => item.id === previous.id ? updated : item) : [...saved, updated]))
        setStatus(previous ? `Updated “${label}” in this browser.` : `Saved “${label}” in this browser.`)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save this scenario.') }
  }
  const load = (configuration: SavedConfiguration) => {
    onLoad(configuration.scenario)
    setName(configuration.name)
    setStatus(`Loaded “${configuration.name}”.`)
  }
  const remove = (configuration: SavedConfiguration) => {
    if (!window.confirm(`Delete saved scenario “${configuration.name}” from this browser?`)) return
    if (persist(saved.filter(item => item.id !== configuration.id))) setStatus(`Deleted “${configuration.name}”.`)
  }
  const importFile = async (file: File | undefined) => {
    if (!file) return
    try {
      if (file.size > 250_000) throw new Error('The configuration file is too large.')
      const imported = parseConfiguration(await file.text())
      const copy = makeConfiguration(imported.name, imported.scenario)
      const stored = persist([...saved, copy])
      onLoad(copy.scenario)
      setName(copy.name)
      if (stored) setStatus(`Imported and loaded “${copy.name}”.`)
      else setStatus(`Loaded “${copy.name}”, but browser storage is unavailable. Export a copy to keep it.`)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not import this file.') }
    finally { if (fileInput.current) fileInput.current.value = '' }
  }

  return <details className="game-card game-save-panel"><summary>Save or load a configuration</summary>
    <p>Save named scenarios in this browser; saving the same name updates it. Export JSON to back them up or move them to another device. Loading restores the policy, assumptions, edited households, and selected household year.</p>
    <div className="game-save-actions"><label htmlFor="scenario-name">Configuration name</label>
      <input id="scenario-name" type="text" maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. 35% X tax + Medicare support" onKeyDown={event => { if (event.key === 'Enter') save() }} />
      <button type="button" onClick={save}>Save current</button>
      <button type="button" onClick={() => { try { download(makeConfiguration(name.trim() || 'Current scenario', scenario)) } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not export this scenario.') } }}>Export current JSON</button>
      <button type="button" onClick={() => fileInput.current?.click()}>Import JSON</button>
      <input ref={fileInput} type="file" accept=".json,application/json" aria-label="Import configuration JSON" hidden onChange={event => void importFile(event.target.files?.[0])} />
    </div>
    {status && <p className="game-save-status" role="status">{status}</p>}
    {saved.length > 0 && <div className="game-saved-list"><strong>Saved here</strong>{saved.map(item => <div key={item.id} className="game-saved-row"><span><b>{item.name}</b><small>Saved {new Date(item.savedAt).toLocaleDateString()}</small></span>
      <button type="button" onClick={() => load(item)}>Load</button><button type="button" onClick={() => download(item)}>Export</button><button type="button" onClick={() => remove(item)}>Delete</button></div>)}</div>}
  </details>
}
