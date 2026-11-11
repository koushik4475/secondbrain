import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, BookOpen, CalendarDays, Download, Folder, Inbox, Moon, Pin, Plus, Search, Settings, Sparkles, Sun, Trash2, Undo2, X, Command, Tag as TagIcon, Keyboard } from 'lucide-react'
import { db, saveNote, exportBackup, importBackup, parseBackup, renameTagEverywhere, removeTagEverywhere, clearAllData } from './db'
import type { Collection, Note, NoteType } from './types'
import { noteTypes, uid } from './types'
import Editor from './Editor'

const blank = (type: NoteType = 'note', collectionId: string | null = null): Note => ({
  id: uid(), title: '', bodyMarkdown: '', summary: '', type, collectionId, tags: [], pinned: false,
  archivedAt: null, deletedAt: null, sourceUrl: '', codeLanguage: 'javascript',
  createdAt: Date.now(), updatedAt: Date.now()
})

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Highlight({ value, query }: { value: string; query: string }) {
  if (!query.trim()) return <>{value}</>
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = value.split(new RegExp(`(${escaped})`, 'ig'))
  return <>{parts.map((part, index) => part.toLocaleLowerCase() === query.trim().toLocaleLowerCase()
    ? <mark key={index}>{part}</mark> : <span key={index}>{part}</span>)}</>
}

export default function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [theme, setTheme] = useState('system')
  const [fontSize, setFontSize] = useState(14)
  const [saving, setSaving] = useState('Saved')
  const [modal, setModal] = useState(false)
  const [palette, setPalette] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [mobilePane, setMobilePane] = useState<'list' | 'editor'>('list')
  const [draft, setDraft] = useState<Note | null>(null)
  const [pendingImport, setPendingImport] = useState<{ name: string; raw: string; noteCount: number; conflicts: number } | null>(null)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const saveSequence = useRef(0)

  const refresh = async () => {
    const [allNotes, allCollections] = await Promise.all([
      db.notes.orderBy('updatedAt').reverse().toArray(),
      db.collections.orderBy('sortOrder').toArray()
    ])
    setNotes(allNotes)
    setCollections(allCollections)
  }

  useEffect(() => {
    void ensureStartup()
    async function ensureStartup() {
      try {
        const { ensureDefaults } = await import('./db')
        await ensureDefaults()
        const settings = await db.settings.toArray()
        const savedTheme = settings.find((setting) => setting.key === 'theme')?.value
        const savedFont = settings.find((setting) => setting.key === 'editorFontSize')?.value
        if (typeof savedTheme === 'string') setTheme(savedTheme)
        if (typeof savedFont === 'number') setFontSize(Math.min(22, Math.max(12, savedFont)))
        await refresh()
      } catch {
        setSaving('Storage unavailable')
      }
    }
  }, [])

  useEffect(() => {
    const applyTheme = () => {
      const resolved = theme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : theme
      document.documentElement.dataset.theme = resolved
    }
    applyTheme()
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [theme])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        void create()
      }
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPalette(true)
        setPaletteQuery('')
      }
      if (event.key === 'Escape') {
        setModal(false)
        setPalette(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    const protectPending = (event: BeforeUnloadEvent) => {
      if (saving !== 'Saved') {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', protectPending)
    return () => window.removeEventListener('beforeunload', protectPending)
  }, [saving])

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const note of notes) for (const name of note.tags) counts.set(name, (counts.get(name) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [notes])

  const visible = useMemo(() => notes.filter((note) => {
    if (filter === 'trash') {
      if (note.deletedAt === null) return false
    } else if (filter === 'archive') {
      if (note.archivedAt === null || note.deletedAt !== null) return false
    } else {
      if (note.deletedAt !== null || note.archivedAt !== null) return false
      if (filter === 'pinned' && !note.pinned) return false
      if (filter.startsWith('type:') && note.type !== filter.slice(5)) return false
      if (filter.startsWith('collection:') && note.collectionId !== filter.slice('collection:'.length)) return false
    }
    if (tagFilter && !note.tags.some((name) => name.toLocaleLowerCase() === tagFilter.toLocaleLowerCase())) return false
    if (fromDate && note.updatedAt < new Date(`${fromDate}T00:00:00`).getTime()) return false
    if (toDate && note.updatedAt > new Date(`${toDate}T23:59:59.999`).getTime()) return false
    const term = query.toLocaleLowerCase().trim()
    return !term || [note.title, note.bodyMarkdown, note.summary, note.sourceUrl, ...note.tags].join(' ').toLocaleLowerCase().includes(term)
  }), [notes, query, filter, tagFilter, fromDate, toDate])

  const active = draft ?? visible.find((note) => note.id === selected) ?? notes.find((note) => note.id === selected) ?? null
  const count = notes.filter((note) => note.deletedAt === null && note.archivedAt === null).length

  async function create(type: NoteType = 'note') {
    const collectionId = filter.startsWith('collection:') ? filter.slice('collection:'.length) : null
    const note = blank(type, collectionId)
    await saveNote(note)
    await refresh()
    setSelected(note.id)
    setDraft(note)
    setMobilePane('editor')
    setPalette(false)
  }

  function update(patch: Partial<Note>) {
    if (!active) return
    const next: Note = { ...active, ...patch, updatedAt: Date.now() }
    setDraft(next)
    const sequence = ++saveSequence.current
    setSaving('Saving…')
    saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
      await saveNote(next)
      await refresh()
      if (sequence === saveSequence.current) setSaving('Saved')
    }).catch(() => {
      if (sequence === saveSequence.current) setSaving('Save failed')
    })
  }

  async function saveAction(note: Note, patch: Partial<Note>) {
    await saveQueue.current
    const next = { ...note, ...patch, updatedAt: Date.now() }
    await saveNote(next)
    if (draft?.id === note.id) setDraft(next)
    await refresh()
  }

  async function archive(note: Note) { await saveAction(note, { archivedAt: Date.now() }) }
  async function restore(note: Note) { await saveAction(note, { archivedAt: null, deletedAt: null }); setSelected(null); setDraft(null) }
  async function trash(note: Note) { await saveAction(note, { deletedAt: Date.now() }); setSelected(null); setDraft(null) }

  async function permanentlyDelete(note: Note) {
    if (!window.confirm('Permanently delete this note? This cannot be undone.')) return
    await saveQueue.current
    await db.notes.delete(note.id)
    setSelected(null)
    setDraft(null)
    await refresh()
  }

  async function togglePin(note: Note) { await saveAction(note, { pinned: !note.pinned }) }

  async function createCollection() {
    const name = window.prompt('Collection name')
    if (!name?.trim()) return
    const collection: Collection = { id: uid(), name: name.trim().slice(0, 100), parentId: null, sortOrder: collections.length, createdAt: Date.now() }
    await db.collections.add(collection)
    await refresh()
    setFilter(`collection:${collection.id}`)
  }

  async function renameCollection(collection: Collection) {
    const name = window.prompt('Rename collection', collection.name)
    if (!name?.trim() || name.trim() === collection.name) return
    await db.collections.update(collection.id, { name: name.trim().slice(0, 100) })
    await refresh()
  }

  async function deleteCollection(collection: Collection) {
    if (!window.confirm(`Delete “${collection.name}”? Notes will be kept and moved to No collection.`)) return
    await saveQueue.current
    await db.transaction('rw', db.collections, db.notes, async () => {
      await db.notes.where('collectionId').equals(collection.id).modify({ collectionId: null })
      await db.collections.delete(collection.id)
    })
    if (filter === `collection:${collection.id}`) setFilter('all')
    await refresh()
  }

  async function renameTag(name: string) {
    const next = window.prompt('Rename tag', name)
    if (!next?.trim() || next.trim().toLocaleLowerCase() === name.toLocaleLowerCase()) return
    try {
      await saveQueue.current
      await renameTagEverywhere(name, next)
      await refresh()
    } catch (error) {
      window.alert(`Could not rename tag: ${(error as Error).message}`)
    }
  }

  async function deleteTag(name: string) {
    if (!window.confirm(`Remove #${name} from every note? Notes themselves will be kept.`)) return
    await saveQueue.current
    await removeTagEverywhere(name)
    if (tagFilter === name) setTagFilter('')
    await refresh()
  }

  async function downloadMarkdown(noteList: Note[], fileName: string) {
    const content = noteList.map((note) =>
      `# ${note.title || 'Untitled note'}\n\n> Type: ${note.type} · Updated: ${new Date(note.updatedAt).toISOString()}\n\n${note.tags.map((tag) => `#${tag}`).join(' ')}\n\n${note.sourceUrl ? `[Source](${note.sourceUrl})\n\n` : ''}${note.summary ? `${note.summary}\n\n` : ''}${note.bodyMarkdown}`
    ).join('\n\n---\n\n')
    downloadFile(fileName, content, 'text/markdown;charset=utf-8')
  }

  async function downloadBackup() {
    await saveQueue.current
    downloadFile('secondbrain-backup.json', await exportBackup(), 'application/json')
  }

  async function handleMarkdownImport(file?: File) {
    if (!file) return
    const bodyMarkdown = await file.text()
    const firstLine = bodyMarkdown.split(/\r?\n/, 1)[0]
    const title = firstLine.startsWith('# ') ? firstLine.slice(2).trim() : file.name.replace(/\\.md$/i, '')
    const note = { ...blank(), title: title.slice(0, 500), bodyMarkdown }
    await saveQueue.current
    await saveNote(note)
    await refresh()
    setSelected(note.id)
    setDraft(note)
    setMobilePane('editor')
    setModal(false)
  }

  async function handleImport(file?: File) {
    if (!file) return
    try {
      const raw = await file.text()
      const parsed = parseBackup(raw)
      const existingIds = new Set(notes.map((note) => note.id))
      const conflicts = parsed.notes.filter((note) => existingIds.has(note.id)).length
      setPendingImport({ name: file.name, raw, noteCount: parsed.notes.length, conflicts })
    } catch (error) {
      window.alert(`Import rejected: ${(error as Error).message}`)
    }
  }

  async function applyImport(mode: 'merge' | 'replace') {
    if (!pendingImport) return
    if (mode === 'replace' && !window.confirm('Replace will delete all current notes, tags, collections and settings before importing. Continue?')) return
    await saveQueue.current
    try {
      await importBackup(pendingImport.raw, mode)
      const { ensureDefaults } = await import('./db')
      await ensureDefaults()
      const restoredSettings = await db.settings.toArray()
      const restoredTheme = restoredSettings.find((setting) => setting.key === 'theme')?.value
      const restoredFontSize = restoredSettings.find((setting) => setting.key === 'editorFontSize')?.value
      if (typeof restoredTheme === 'string') setTheme(restoredTheme)
      if (typeof restoredFontSize === 'number') setFontSize(Math.min(22, Math.max(12, restoredFontSize)))
      setPendingImport(null)
      setSelected(null)
      setDraft(null)
      setFilter('all')
      await refresh()
      window.alert(mode === 'merge'
        ? 'Import complete. Existing notes were preserved; ID conflicts were imported as separate copies.'
        : 'Workspace replaced with the validated backup.')
    } catch (error) {
      window.alert(`Import failed: ${(error as Error).message}`)
    }
  }

  async function clearWorkspace() {
    if (!window.confirm('Delete ALL notes, tags, collections and preferences from this browser? Export a backup first. This cannot be undone.')) return
    await saveQueue.current
    await clearAllData()
    const { ensureDefaults } = await import('./db')
    await ensureDefaults()
    setSelected(null)
    setDraft(null)
    setFilter('all')
    setTagFilter('')
    await refresh()
    setTheme('system')
    setFontSize(14)
  }

  async function saveTheme(value: string) {
    setTheme(value)
    await db.settings.put({ key: 'theme', value })
  }

  async function saveFontSize(value: number) {
    const next = Math.min(22, Math.max(12, value))
    setFontSize(next)
    await db.settings.put({ key: 'editorFontSize', value: next })
  }

  const paletteCommands = [
    { label: 'Create a note', detail: 'Capture a thought', run: () => void create('note') },
    { label: 'Create an idea', detail: 'Save a new idea', run: () => void create('idea') },
    { label: 'Create a meeting note', detail: 'Capture meeting notes', run: () => void create('meeting') },
    { label: 'Create a learning note', detail: 'Save something you learned', run: () => void create('learning') },
    { label: 'Create a code snippet', detail: 'Save code with syntax highlighting', run: () => void create('code') },
    { label: 'Save a bookmark', detail: 'Keep a link for later', run: () => void create('bookmark') },
    { label: 'Show all notes', detail: 'Return to the workspace', run: () => { setFilter('all'); setTagFilter(''); setPalette(false) } },
    { label: 'Show pinned notes', detail: 'Find your important notes', run: () => { setFilter('pinned'); setPalette(false) } },
    { label: 'Open settings and help', detail: 'Preferences, backup and shortcuts', run: () => { setModal(true); setPalette(false) } }
  ].filter((command) => `${command.label} ${command.detail}`.toLocaleLowerCase().includes(paletteQuery.toLocaleLowerCase()))

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Sparkles size={17}/></div><span>second<span className="brand-muted">brain</span></span></div>
      <button className="capture" onClick={() => void create()}><Plus size={17}/> New note <kbd>⌘ N</kbd></button>
      <div className="nav-label">WORKSPACE</div>
      <button className={filter === 'all' ? 'nav-item active' : 'nav-item'} onClick={() => setFilter('all')}><Inbox/> All notes <span>{count}</span></button>
      <button className={filter === 'pinned' ? 'nav-item active' : 'nav-item'} onClick={() => setFilter('pinned')}><Pin/> Pinned</button>
      <button className={filter === 'archive' ? 'nav-item active' : 'nav-item'} onClick={() => setFilter('archive')}><Archive/> Archive</button>
      <button className={filter === 'trash' ? 'nav-item active' : 'nav-item'} onClick={() => setFilter('trash')}><Trash2/> Trash</button>
      <div className="nav-label section-label">COLLECTIONS</div>
      {collections.map((collection) => <button key={collection.id} className={filter === 'collection:' + collection.id ? 'nav-item active' : 'nav-item'} onClick={() => setFilter('collection:' + collection.id)}><Folder size={15}/>{collection.name}</button>)}
      <button className="nav-item" onClick={() => void createCollection()}><Plus size={15}/> New collection</button>
      <div className="nav-label section-label">NOTE TYPES</div>
      {noteTypes.map((type) => <button key={type.id} className={filter === 'type:' + type.id ? 'nav-item active' : 'nav-item'} onClick={() => setFilter('type:' + type.id)}><span className="type-symbol">{type.icon}</span>{type.label}</button>)}
      <div className="sidebar-bottom">
        <div className="storage-card"><div className="storage-icon"><BookOpen size={16}/></div><div><b>Your space, your data</b><small>Stored on this device</small></div><span className="local-dot"/></div>
        <button className="nav-item" onClick={() => setModal(true)}><Settings/> Settings & help</button>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><b>{filter === 'all' ? 'All notes' : filter === 'pinned' ? 'Pinned' : filter === 'archive' ? 'Archive' : filter === 'trash' ? 'Trash' : filter.startsWith('collection:') ? collections.find((item) => item.id === filter.slice(11))?.name : noteTypes.find((item) => item.id === filter.slice(5))?.label}</b></div>
        <div className="top-actions">
          <div className="searchbox"><Search size={16}/><input id="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your brain…" aria-label="Search notes"/><kbd>⌘ K</kbd></div>
          <button className="icon-button" title="Open command palette" aria-label="Open command palette" onClick={() => setPalette(true)}><Command/></button>
          <button className="icon-button" title="Toggle theme" aria-label="Toggle theme" onClick={() => void saveTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun/> : <Moon/>}</button>
          <button className="avatar" aria-label="Open settings" onClick={() => setModal(true)}>K</button>
        </div>
      </header>
      <div className="workspace">
        <section className={'note-list ' + (mobilePane === 'editor' ? 'mobile-hidden' : '')}>
          <div className="list-heading">
            <div><h1>{filter === 'all' ? 'Your knowledge' : filter === 'pinned' ? 'Pinned notes' : filter === 'archive' ? 'Archived notes' : filter === 'trash' ? 'Recently deleted' : filter.startsWith('collection:') ? collections.find((item) => item.id === filter.slice(11))?.name : 'Your ' + filter.slice(5) + 's'}</h1><p>{visible.length} {visible.length === 1 ? 'note' : 'notes'} in your space</p></div>
            <button className="small-add" onClick={() => void create()} aria-label="Create note"><Plus size={16}/></button>
          </div>
          <div className="filter-strip">
            <label><TagIcon size={13}/><select aria-label="Filter by tag" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="">All tags</option>{allTags.map(([name]) => <option key={name} value={name}>#{name}</option>)}</select></label>
            <div className="date-filters"><CalendarDays size={13}/><input aria-label="Updated after" type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)}/><span>–</span><input aria-label="Updated before" type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)}/></div>
            {(tagFilter || fromDate || toDate) && <button className="clear-filters" onClick={() => { setTagFilter(''); setFromDate(''); setToDate('') }}>Clear</button>}
          </div>
          {visible.length === 0 ? <div className="empty-list"><div className="empty-icon"><BookOpen size={22}/></div><b>{query ? 'Nothing found' : filter === 'trash' ? 'Trash is empty' : 'A clear mind starts here'}</b><p>{query ? 'Try another search term or clear your filters.' : 'Capture a thought, save a link, or start an idea.'}</p>{!query && filter === 'all' && <button onClick={() => void create()} className="text-action">Create your first note <span>→</span></button>}</div> :
            <div className="notes">{visible.map((note) => <button key={note.id} className={'note-card ' + (selected === note.id ? 'selected' : '')} onClick={() => { setSelected(note.id); setDraft(null); setMobilePane('editor') }}>
              <div className="note-card-top"><span className={'type-pill ' + note.type}>{noteTypes.find((type) => type.id === note.type)?.label}</span>{note.pinned && <Pin size={13}/>}</div>
              <b><Highlight value={note.title || 'Untitled note'} query={query}/></b>
              <p><Highlight value={(note.summary || note.bodyMarkdown.replace(/[#>*`]/g, '').replaceAll('[', '').replaceAll(']', '')).slice(0, 100) || 'No additional text yet…'} query={query}/></p>
              <div className="note-meta"><span>{new Date(note.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>{note.tags.slice(0, 2).map((name) => <span className="tag" key={name}>#{name}</span>)}</div>
            </button>)}</div>}
        </section>
        <section className={'editor-pane ' + (mobilePane === 'list' ? 'mobile-hidden' : '')}>
          {active ? <><div className="editor-toolbar">
            <button className="back-mobile" onClick={() => setMobilePane('list')}>← Notes</button>
            <div className="save-state" role="status"><span className={saving === 'Saved' ? 'save-dot' : 'save-dot pending'}/>{saving}</div>
            <div className="toolbar-actions">
              {active.deletedAt !== null ? <><button title="Restore note" aria-label="Restore note" onClick={() => void restore(active)}><Undo2 size={16}/></button><button title="Delete permanently" aria-label="Delete permanently" onClick={() => void permanentlyDelete(active)}><Trash2 size={16}/></button></> : <>
                <button title="Pin note" aria-label="Pin note" onClick={() => void togglePin(active)} className={active.pinned ? 'toolbar-active' : ''}><Pin size={16}/></button>
                <button title="Archive" aria-label="Archive note" onClick={() => void archive(active)}><Archive size={16}/></button>
                <button title="Move to trash" aria-label="Move to trash" onClick={() => void trash(active)}><Trash2 size={16}/></button>
              </>}
            </div>
          </div><Editor note={active} collections={collections} allNotes={notes} fontSize={fontSize} onChange={update} onPending={() => setSaving('Unsaved changes')} onOpenNote={(target) => { setSelected(target.id); setDraft(null); setFilter('all'); setMobilePane('editor') }} onExport={(note) => void downloadMarkdown([note], `${(note.title || 'secondbrain-note').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'secondbrain-note'}.md`)}/></> :
            <div className="editor-empty"><div className="empty-orbit"><Sparkles size={25}/></div><h2>Your second brain, at your fingertips.</h2><p>Select a note to continue, or capture something before it slips away.</p><button className="capture" onClick={() => void create()}><Plus size={16}/> Create a note</button><div className="shortcut-hint"><kbd>⌘ N</kbd> new note <span>·</span> <kbd>⌘ K</kbd> command palette</div></div>}
        </section>
      </div>
    </main>

    {palette && <div className="modal-backdrop palette-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPalette(false) }}>
      <div className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-search"><Search size={17}/><input autoFocus value={paletteQuery} onChange={(event) => setPaletteQuery(event.target.value)} placeholder="Search commands…" aria-label="Search commands"/><kbd>ESC</kbd></div>
        <div className="palette-results">{paletteCommands.length ? paletteCommands.map((command) => <button key={command.label} onClick={command.run}><span><b>{command.label}</b><small>{command.detail}</small></span><span>↵</span></button>) : <p>No matching commands</p>}</div>
        <div className="palette-foot">Navigate with your keyboard · <kbd>Ctrl/⌘ K</kbd></div>
      </div>
    </div>}

    {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(false) }}>
      <div className="settings-modal settings-wide" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-head"><div><span className="eyebrow">PREFERENCES & DATA</span><h2 id="settings-title">Settings & help</h2></div><button className="icon-button" aria-label="Close settings" onClick={() => setModal(false)}><X/></button></div>
        <div className="setting-row"><div><b>Appearance</b><small>Choose system, light or dark mode</small></div><select aria-label="Appearance" value={theme} onChange={(event) => void saveTheme(event.target.value)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div>
        <div className="setting-row"><div><b>Editor text size</b><small>Adjust writing comfort</small></div><div className="font-size-control"><button aria-label="Decrease editor text size" onClick={() => void saveFontSize(fontSize - 1)}>−</button><span>{fontSize}px</span><button aria-label="Increase editor text size" onClick={() => void saveFontSize(fontSize + 1)}>+</button></div></div>
        <div className="settings-section"><h3><Folder size={15}/> Manage collections</h3>{collections.length === 0 ? <p className="muted-small">No collections yet.</p> : collections.map((collection) => <div className="manage-row" key={collection.id}><span>{collection.name}</span><button onClick={() => void renameCollection(collection)}>Rename</button><button className="danger-text" onClick={() => void deleteCollection(collection)}>Delete</button></div>)}<button className="outline-btn" onClick={() => void createCollection()}><Plus size={13}/> New collection</button></div>
        <div className="settings-section"><h3><TagIcon size={15}/> Manage tags</h3>{allTags.length === 0 ? <p className="muted-small">Tags you add to notes will appear here.</p> : allTags.map(([name, total]) => <div className="manage-row" key={name}><button className="tag-link" onClick={() => { setTagFilter(name); setModal(false) }}>#{name} <small>{total} notes</small></button><button onClick={() => void renameTag(name)}>Rename</button><button className="danger-text" onClick={() => void deleteTag(name)}>Remove everywhere</button></div>)}</div>
        <div className="settings-section"><h3><Download size={15}/> Backup & portability</h3><div className="setting-row"><div><b>Export JSON backup</b><small>Versioned backup including notes, tags, collections and preferences</small></div><button className="outline-btn" onClick={() => void downloadBackup()}>Export JSON</button></div>
          <div className="setting-row"><div><b>Export all notes as Markdown</b><small>Portable Markdown archive</small></div><button className="outline-btn" onClick={() => void downloadMarkdown(notes.filter((note) => note.deletedAt === null), 'secondbrain-notes.md')}>Export .md</button></div>
          <div className="setting-row"><div><b>Import a Markdown file</b><small>Bring a .md file in as a new note</small></div><label className="outline-btn file-label">Import .md<input aria-label="Import Markdown file" type="file" accept=".md,text/markdown" onChange={(event) => void handleMarkdownImport(event.target.files?.[0])}/></label></div>
          <div className="setting-row"><div><b>Import a JSON backup</b><small>Validate and preview before merging or replacing</small></div><label className="outline-btn file-label">Choose backup<input aria-label="Import JSON backup" type="file" accept="application/json,.json" onChange={(event) => void handleImport(event.target.files?.[0])}/></label></div>
          {pendingImport && <div className="import-preview" role="region" aria-label="Import preview"><b>Ready to import: {pendingImport.name}</b><p>{pendingImport.noteCount} notes · {pendingImport.conflicts} note ID conflicts detected.</p><small>Merge keeps existing notes and imports ID conflicts as separate copies. Replace explicitly removes current local data.</small><div><button className="outline-btn" onClick={() => void applyImport('merge')}>Merge safely</button><button className="danger-button" onClick={() => void applyImport('replace')}>Replace workspace…</button><button className="subtle-action" onClick={() => setPendingImport(null)}>Cancel</button></div></div>}
        </div>
        <div className="settings-section"><h3><Keyboard size={15}/> Keyboard shortcuts</h3><div className="shortcut-row"><span>New note</span><kbd>Ctrl / ⌘ + N</kbd></div><div className="shortcut-row"><span>Command palette</span><kbd>Ctrl / ⌘ + K</kbd></div><div className="shortcut-row"><span>Close dialogs</span><kbd>Esc</kbd></div></div>
        <div className="settings-section danger-zone"><h3><Trash2 size={15}/> Clear local workspace</h3><p>Delete all notes, tags, collections and preferences from this browser. Export a backup first. This does not affect other browsers or devices.</p><button className="danger-button" onClick={() => void clearWorkspace()}>Clear all local data…</button></div>
        <p className="privacy-note">Your notes live in this browser's IndexedDB. They are not encrypted or synced. Clearing browser data or changing devices can remove access. Export backups regularly. Avoid storing passwords, OTPs, recovery codes or identity scans.</p>
        <div className="modal-foot">SecondBrain · Local-first by design · No account or server sync</div>
      </div>
    </div>}
  </div>
}
