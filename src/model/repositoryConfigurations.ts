import { makeConfiguration, parseConfiguration } from './savedConfigurations'
import type { SavedConfiguration } from './savedConfigurations'

const api = 'https://api.github.com/repos/pcarlsgaard/Entitlements-Reform/contents'
const directory = 'configurations'
const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }

export interface RepositoryConfiguration {
  path: string
  label: string
}

function pathFor(name: string): string {
  const slug = name.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!slug) throw new Error('Use at least one letter or digit in the repository configuration name.')
  return `${directory}/${slug}.json`
}

function labelFor(path: string): string {
  return path.slice(directory.length + 1, -5).replace(/-/g, ' ')
}

async function request(url: string, options?: RequestInit): Promise<Response> {
  try { return await fetch(url, { cache: 'no-store', ...options }) }
  catch { throw new Error('Could not reach GitHub. Check your connection and try again.') }
}

export async function listRepositoryConfigurations(token = ''): Promise<RepositoryConfiguration[]> {
  const response = await request(`${api}/${directory}?ref=main`, {
    headers: { ...headers, ...(token.trim() ? { Authorization: `Bearer ${token.trim()}` } : {}) },
  })
  if (!response.ok) throw new Error(`Could not list repository configurations (GitHub ${response.status}).`)
  const entries: unknown = await response.json()
  if (!Array.isArray(entries)) throw new Error('The repository configuration listing is invalid.')
  return entries.filter((entry): entry is { path: string; type: string } =>
    typeof entry === 'object' && entry !== null && 'path' in entry && 'type' in entry &&
    typeof entry.path === 'string' && entry.type === 'file' &&
    /^configurations\/[a-z0-9-]+\.json$/.test(entry.path))
    .map(entry => ({ path: entry.path, label: labelFor(entry.path) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

async function getFile(path: string, token = ''): Promise<{ sha: string; configuration: SavedConfiguration } | null> {
  if (!/^configurations\/[a-z0-9-]+\.json$/.test(path)) throw new Error('Invalid repository configuration path.')
  const response = await request(`${api}/${path}?ref=main`, {
    headers: { ...headers, ...(token.trim() ? { Authorization: `Bearer ${token.trim()}` } : {}) },
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Could not read repository configuration (GitHub ${response.status}).`)
  const file: unknown = await response.json()
  if (typeof file !== 'object' || file === null || !('sha' in file) || !('content' in file) ||
      typeof file.sha !== 'string' || typeof file.content !== 'string' || file.content.length > 350_000)
    throw new Error('The repository configuration file is invalid or too large.')
  let json: string
  try {
    const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), char => char.charCodeAt(0))
    json = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch { throw new Error('The repository configuration encoding is invalid.') }
  return { sha: file.sha, configuration: parseConfiguration(json) }
}

export async function loadRepositoryConfiguration(path: string, token = ''): Promise<SavedConfiguration> {
  const file = await getFile(path, token)
  if (!file) throw new Error('This configuration no longer exists in the repository. Refresh the list.')
  return file.configuration
}

/** Creates one public JSON commit. Re-reads its SHA to avoid silently overwriting concurrent edits. */
export async function saveRepositoryConfiguration(configuration: SavedConfiguration, token: string): Promise<string> {
  if (!token.trim()) throw new Error('Enter a GitHub token with Contents read and write access to save in the repository.')
  const valid = parseConfiguration(JSON.stringify(configuration))
  const path = pathFor(valid.name)
  const existing = await getFile(path, token)
  if (existing && existing.configuration.name.toLowerCase() !== valid.name.toLowerCase())
    throw new Error(`The file ${path} belongs to “${existing.configuration.name}”. Use a different name.`)
  const updated = makeConfiguration(valid.name, valid.scenario, existing?.configuration.id ?? valid.id)
  const bytes = new TextEncoder().encode(JSON.stringify(updated, null, 2) + '\n')
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const response = await request(`${api}/${path}`, {
    method: 'PUT',
    headers: { ...headers, Authorization: `Bearer ${token.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `${existing ? 'Update' : 'Add'} scenario: ${valid.name}`, content: btoa(binary),
      branch: 'main', ...(existing ? { sha: existing.sha } : {}) }),
  })
  if (response.status === 409) throw new Error('The repository changed while saving. Refresh and try again.')
  if (response.status === 401 || response.status === 403)
    throw new Error('GitHub rejected the token. It needs Contents read and write access to this repository.')
  if (!response.ok) throw new Error(`GitHub could not save the configuration (status ${response.status}).`)
  return path
}
