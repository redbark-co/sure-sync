import { describe, it, expect } from 'vitest'
import { loadConfig, parseAccountMapping, ConfigError } from './config.js'

describe('parseAccountMapping', () => {
  it('parses a single mapping', () => {
    const result = parseAccountMapping('abc:xyz')
    expect(result).toEqual([
      { redbarkAccountId: 'abc', sureAccountId: 'xyz' },
    ])
  })

  it('parses multiple mappings', () => {
    const result = parseAccountMapping('abc:xyz,def:uvw')
    expect(result).toEqual([
      { redbarkAccountId: 'abc', sureAccountId: 'xyz' },
      { redbarkAccountId: 'def', sureAccountId: 'uvw' },
    ])
  })

  it('trims whitespace', () => {
    const result = parseAccountMapping(' abc : xyz , def : uvw ')
    expect(result).toEqual([
      { redbarkAccountId: 'abc', sureAccountId: 'xyz' },
      { redbarkAccountId: 'def', sureAccountId: 'uvw' },
    ])
  })

  it('throws on invalid format', () => {
    expect(() => parseAccountMapping('invalid')).toThrow()
  })

  it('throws on empty string', () => {
    expect(() => parseAccountMapping('')).toThrow()
  })
})

describe('loadConfig', () => {
  const validEnv = {
    REDBARK_API_KEY: 'rbk_live_test123',
    SURE_URL: 'http://localhost:3000',
    SURE_API_KEY: 'test-sure-api-key',
    ACCOUNT_MAPPING: 'acc1:acc2',
  }

  it('loads valid config', () => {
    const config = loadConfig(validEnv)
    expect(config.redbarkApiKey).toBe('rbk_live_test123')
    expect(config.sureUrl).toBe('http://localhost:3000')
    expect(config.sureApiKey).toBe('test-sure-api-key')
    expect(config.syncDays).toBe(30)
    expect(config.dryRun).toBe(false)
    expect(config.logLevel).toBe('info')
    expect(config.batchSize).toBe(25)
  })

  it('applies defaults', () => {
    const config = loadConfig(validEnv)
    expect(config.redbarkApiUrl).toBe('https://api.redbark.co')
    expect(config.syncDays).toBe(30)
    expect(config.batchSize).toBe(25)
  })

  it('accepts overrides', () => {
    const config = loadConfig({
      ...validEnv,
      SYNC_DAYS: '60',
      DRY_RUN: 'true',
      LOG_LEVEL: 'debug',
      BATCH_SIZE: '50',
      CURRENCY: 'AUD',
    })
    expect(config.syncDays).toBe(60)
    expect(config.dryRun).toBe(true)
    expect(config.logLevel).toBe('debug')
    expect(config.batchSize).toBe(50)
    expect(config.currency).toBe('AUD')
  })

  it('parses category mapping', () => {
    const config = loadConfig({
      ...validEnv,
      CATEGORY_MAPPING: 'groceries:uuid1,transport:uuid2',
    })
    expect(config.categoryMapping).toBeInstanceOf(Map)
    expect(config.categoryMapping!.get('groceries')).toBe('uuid1')
    expect(config.categoryMapping!.get('transport')).toBe('uuid2')
  })

  it('accepts optional tag name', () => {
    const config = loadConfig({
      ...validEnv,
      TAG_NAME: 'Redbark',
    })
    expect(config.tagName).toBe('Redbark')
  })

  it('throws on missing required fields', () => {
    expect(() => loadConfig({})).toThrow(ConfigError)
  })

  it('throws on missing API key', () => {
    const { REDBARK_API_KEY, ...rest } = validEnv
    expect(() => loadConfig(rest)).toThrow(ConfigError)
  })

  it('throws on missing Sure URL', () => {
    const { SURE_URL, ...rest } = validEnv
    expect(() => loadConfig(rest)).toThrow(ConfigError)
  })

  it('throws on missing Sure API key', () => {
    const { SURE_API_KEY, ...rest } = validEnv
    expect(() => loadConfig(rest)).toThrow(ConfigError)
  })
})
