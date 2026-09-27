import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultCombinedPolicy } from '../src/model/combined'
import { exampleHouseholds } from '../src/model/householdScenario'
import { makeConfiguration } from '../src/model/savedConfigurations'
import { listRepositoryConfigurations, loadRepositoryConfiguration, saveRepositoryConfiguration } from '../src/model/repositoryConfigurations'

const scenario = {
  policy: defaultCombinedPolicy,
  householdProfiles: exampleHouseholds,
  householdYear: 2040,
  householdSelectedId: exampleHouseholds[0]!.id,
}
const saved = makeConfiguration('Growth & sécurité', scenario, 'scenario-id')
const base64 = (value: string) => btoa(Array.from(new TextEncoder().encode(value), b => String.fromCharCode(b)).join(''))
const fileResponse = (configuration = saved) => Response.json({ sha: 'current-blob', content: base64(JSON.stringify(configuration)) })

afterEach(() => vi.unstubAllGlobals())

describe('repository configuration storage', () => {
  it('lists public JSON files and loads a validated scenario without a token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json([
        { type: 'file', path: 'configurations/growth-securite.json' },
        { type: 'file', path: 'configurations/README.md' },
        { type: 'dir', path: 'configurations/archive.json' },
      ]))
      .mockResolvedValueOnce(fileResponse())
    vi.stubGlobal('fetch', fetchMock)
    const entries = await listRepositoryConfigurations()
    expect(entries).toEqual([{ path: 'configurations/growth-securite.json', label: 'growth securite' }])
    expect((await loadRepositoryConfiguration(entries[0]!.path)).scenario.householdYear).toBe(2040)
    expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBeUndefined()
    await expect(loadRepositoryConfiguration('configurations/../README.md')).rejects.toThrow(/Invalid repository/)
  })

  it('creates then updates a UTF-8 snapshot using the latest GitHub blob SHA', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(fileResponse())
      .mockResolvedValueOnce(Response.json({}))
    vi.stubGlobal('fetch', fetchMock)
    expect(await saveRepositoryConfiguration(saved, 'secret-token')).toBe('configurations/growth-securite.json')
    expect(await saveRepositoryConfiguration(saved, 'secret-token')).toBe('configurations/growth-securite.json')
    const created = JSON.parse(fetchMock.mock.calls[1]![1].body)
    const updated = JSON.parse(fetchMock.mock.calls[3]![1].body)
    expect(created.sha).toBeUndefined()
    expect(updated.sha).toBe('current-blob')
    expect(created.branch).toBe('main')
    expect(new TextDecoder().decode(Uint8Array.from(atob(created.content), c => c.charCodeAt(0)))).toContain('sécurité')
    expect(fetchMock.mock.calls[1]![1].headers.Authorization).toBe('Bearer secret-token')
    expect(JSON.stringify(created)).not.toContain('secret-token')
  })

  it('refuses a colliding name and gives a useful conflict without exposing the token', async () => {
    const collision = makeConfiguration('Growth sécurité', scenario)
    const fetchMock = vi.fn().mockResolvedValueOnce(fileResponse(collision))
      .mockResolvedValueOnce(fileResponse()).mockResolvedValueOnce(new Response(null, { status: 409 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(saveRepositoryConfiguration(saved, 'secret-token')).rejects.toThrow(/belongs to/)
    await expect(saveRepositoryConfiguration(saved, 'secret-token')).rejects.toThrow(/changed while saving/)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
