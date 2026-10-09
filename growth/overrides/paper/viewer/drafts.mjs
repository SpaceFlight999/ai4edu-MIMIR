export class NoteDrafts {
  constructor(storage, projectId) {
    this.storage = storage;
    this.storageKey = 'mimir-paper-drafts:' + projectId;
    try {this.rows = JSON.parse(storage.getItem(this.storageKey) ?? '{}');} catch {this.rows={};}
  }
  persist() { this.storage.setItem(this.storageKey, JSON.stringify(this.rows)); }
  save(key, draft) {
    const row = { ...structuredClone(draft), revision: crypto.randomUUID(), createdAt: this.rows[key]?.createdAt ?? Date.now(), updatedAt: Date.now() };
    this.rows[key] = row;
    this.persist();
    return structuredClone(row);
  }
  get(key) { return this.rows[key] ? structuredClone(this.rows[key]) : null; }
  list(paperId) { return Object.entries(this.rows).filter(([, row]) => row.edit.paperId === paperId).sort((a,b) => (a[1].createdAt??a[1].updatedAt)-(b[1].createdAt??b[1].updatedAt)); }
  remove(key) {delete this.rows[key];this.persist();}
  complete(key, snapshot, note) {
    const current = this.rows[key];
    if (!current) return false;
    if (current.revision === snapshot.revision) {
      delete this.rows[key]; this.persist(); return true;
    }
    // Text typed while saving remains a draft, now based on the saved note.
    current.edit.id = note.id;
    current.edit.version = note.version;
    current.requestKey = crypto.randomUUID();
    this.persist(); return false;
  }
}
