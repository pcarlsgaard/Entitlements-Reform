import { useEffect, useRef, useState } from 'react'
import {
  configurationStorageKey, makeConfiguration, parseConfiguration, parseConfigurationLibrary,
} from './model/savedConfigurations'
import type { SavedConfiguration, ScenarioState } from './model/savedConfigurations'
import { listRepositoryConfigurations, loadRepositoryConfiguration, saveRepositoryConfiguration } from './model/repositoryConfigurations'
import type { RepositoryConfiguration } from './model/repositoryConfigurations'

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
  const [token, setToken] = useState('')
  const [repository, setRepository] = useState<RepositoryConfiguration[]>([])
  const [repositoryStatus, setRepositoryStatus] = useState('')
  const [repositoryBusy, setRepositoryBusy] = useState(false)

  useEffect(() => {
    let active = true
    void listRepositoryConfigurations().then(items => {
      if (active) { setRepository(items); setRepositoryStatus('') }
    }).catch(() => { if (active) setRepositoryStatus('Could not list repository scenarios. Try Refresh.') })
    return () => { active = false }
  }, [])

  const refreshRepository = async () => {
    setRepositoryBusy(true)
    try { setRepository(await listRepositoryConfigurations(token)); setRepositoryStatus('Repository list refreshed.') }
    catch (error) { setRepositoryStatus(error instanceof Error ? error.message : 'Could not refresh.') }
    finally { setRepositoryBusy(false) }
  }

  const publish = async (configuration?: SavedConfiguration) => {
    setRepositoryBusy(true)
    try {
      if (!configuration && !name.trim()) throw new Error('Give this scenario a name before saving it to GitHub.')
      const item = configuration ?? makeConfiguration(name, scenario)
      const path = await saveRepositoryConfiguration(item, token)
      setName(item.name)
      setRepository(previous => previous.some(entry => entry.path === path) ? previous :
        [...previous, { path, label: item.name }].sort((a, b) => a.label.localeCompare(b.label)))
      setRepositoryStatus(`Saved “${item.name}” in ${path} on GitHub.`)
    } catch (error) { setRepositoryStatus(error instanceof Error ? error.message : 'Could not save to the repository.') }
    finally { setRepositoryBusy(false) }
  }

  const loadFromRepository = async (item: RepositoryConfiguration) => {
    setRepositoryBusy(true)
    try {
      const configuration = await loadRepositoryConfiguration(item.path, token)
      onLoad(configuration.scenario)
      setName(configuration.name)
      setRepositoryStatus(`Loaded “${configuration.name}” from GitHub.`)
    } catch (error) { setRepositoryStatus(error instanceof Error ? error.message : 'Could not load from the repository.') }
    finally { setRepositoryBusy(false) }
  }

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
    <p>Save named scenarios in this browser or in the public GitHub repository. Loading restores policy and household inputs and recalculates scores with the current model. Older files gain projected longevity, work-credit controls, and a GDP-linked Medicare pool matching their opening per-person grant; the original file is not changed.</p>
    <div className="game-save-actions"><label htmlFor="scenario-name">Configuration name</label>
      <input id="scenario-name" type="text" maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. 35% X tax + Medicare support" onKeyDown={event => { if (event.key === 'Enter') save() }} />
      <button type="button" onClick={save}>Save in browser</button>
      <button type="button" onClick={() => { try { download(makeConfiguration(name.trim() || 'Current scenario', scenario)) } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not export this scenario.') } }}>Export current JSON</button>
      <button type="button" onClick={() => fileInput.current?.click()}>Import JSON</button>
      <input ref={fileInput} type="file" accept=".json,application/json" aria-label="Import configuration JSON" hidden onChange={event => void importFile(event.target.files?.[0])} />
    </div>
    {status && <p className="game-save-status" role="status">{status}</p>}
    {saved.length > 0 && <div className="game-saved-list"><strong>Saved here</strong>{saved.map(item => <div key={item.id} className="game-saved-row"><span><b>{item.name}</b><small>Saved {new Date(item.savedAt).toLocaleDateString()}</small></span>
      <button type="button" onClick={() => load(item)}>Load</button><button type="button" onClick={() => download(item)}>Export</button><button type="button" disabled={repositoryBusy} onClick={() => void publish(item)}>Save to GitHub</button><button type="button" onClick={() => remove(item)}>Delete</button></div>)}</div>}
    <div className="game-saved-list">
      <strong>Repository scenarios</strong>
      <p>These files are public and versioned for analysis. To save, enter a fine-grained GitHub token for this repository with Contents read and write access. The token stays in this tab only and clears when you close or reload it. Avoid personal information in edited household examples.</p>
      <div className="game-save-actions">
        <label htmlFor="repository-token">GitHub token</label>
        <input id="repository-token" type="password" value={token} autoComplete="off" onChange={event => setToken(event.target.value)} placeholder="Token for repository writes" />
        <button type="button" disabled={repositoryBusy} onClick={() => void publish()}>Save current to GitHub</button>
        <button type="button" disabled={repositoryBusy} onClick={() => void refreshRepository()}>Refresh list</button>
      </div>
      {repositoryStatus && <p className="game-save-status" role="status">{repositoryStatus}</p>}
      {repository.length === 0 ? <p>No repository scenarios found yet.</p> : repository.map(item => <div key={item.path} className="game-saved-row">
        <span><b>{item.label}</b><small>{item.path}</small></span>
        <button type="button" disabled={repositoryBusy} onClick={() => void loadFromRepository(item)}>Load</button>
      </div>)}
    </div>
  </details>
}
