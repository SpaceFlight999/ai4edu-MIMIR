import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { initialState, GrowthError } from './domain.mjs'
import { migrateJourneyState } from './journey.mjs'
import { migrateLearningState } from './learning.mjs'

export class GrowthStore {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS requests (key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL, version INTEGER NOT NULL);')
    this.db.prepare('INSERT OR IGNORE INTO state VALUES (1, ?)').run(JSON.stringify(initialState()))
    const stored = JSON.parse(this.db.prepare('SELECT value FROM state WHERE id = 1').get().value)
    const migrated = migrateLearningState(migrateJourneyState(stored))
    if (JSON.stringify(migrated) !== JSON.stringify(stored)) this.db.prepare('UPDATE state SET value = ? WHERE id = 1').run(JSON.stringify(migrated))
  }
  read() { return migrateLearningState(migrateJourneyState({ sharedPlans: [], starredPlanIds: [], ...JSON.parse(this.db.prepare('SELECT value FROM state WHERE id = 1').get().value) })) }
  prior(key, fingerprint) {
    const prior = this.db.prepare('SELECT fingerprint, result FROM requests WHERE key = ?').get(key)
    if (!prior) return null
    if (prior.fingerprint !== fingerprint) throw new GrowthError('IDEMPOTENCY_MISMATCH', '重复请求的内容不同，请刷新后重试。', 409)
    return JSON.parse(prior.result)
  }
  mutate({ key, fingerprint, version, kind }, operation) {
    const prior = this.prior(key, fingerprint)
    if (prior) return prior
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const state = this.read()
      if (state.version !== version) throw new GrowthError('VERSION_CONFLICT', '记录已经变化，请刷新后重新操作。', 409)
      const result = operation(state)
      if (result?.then) throw new TypeError('State transactions must be synchronous.')
      state.version++
      const response = { state, result: result ?? null }
      this.db.prepare('UPDATE state SET value = ? WHERE id = 1').run(JSON.stringify(state))
      this.db.prepare('INSERT INTO requests VALUES (?, ?, ?)').run(key, fingerprint, JSON.stringify(response))
      this.db.prepare('INSERT INTO events (at, kind, version) VALUES (?, ?, ?)').run(new Date().toISOString(), kind, state.version)
      this.db.exec('COMMIT')
      return response
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  close() { this.db.close() }
}
