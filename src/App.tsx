import { useEffect, useMemo, useState } from 'react'
import { Archive, BookOpen, Folder, Inbox, Moon, Pin, Plus, Search, Settings, Sparkles, Sun, Trash2, Undo2, X } from 'lucide-react'
import { db, saveNote, exportBackup, importBackup } from './db'
import type { Collection, Note, NoteType } from './types'
import { noteTypes, uid } from './types'

// App data stays in browser-local IndexedDB; imported notes are validated before storage.
import Editor from './Editor'

const blank = (type: NoteType = 'note', collectionId: string | null = null): Note => ({ id: uid(), title: '', bodyMarkdown: '', type, collectionId, tags: [], pinned: false, archivedAt: null, deletedAt: null, sourceUrl: '', codeLanguage: 'javascript', createdAt: Date.now(), updatedAt: Date.now() })
export default function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [theme, setTheme] = useState('dark')
  const [saving, setSaving] = useState('Saved')
  const [modal, setModal] = useState(false)
  const [mobilePane, setMobilePane] = useState<'list'|'editor'>('list')
  const [draft, setDraft] = useState<Note | null>(null)
  const refresh = async () => {
    const [allNotes, allCollections] = await Promise.all([db.notes.orderBy('updatedAt').reverse().toArray(), db.collections.orderBy('sortOrder').toArray()])
    setNotes(allNotes)
    setCollections(allCollections)
  }
  useEffect(() => { void refresh(); void db.settings.get('theme').then(s => { if (s) setTheme(String(s.value)) }) }, [])
  useEffect(() => { document.documentElement.dataset.theme = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme }, [theme])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); create() }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.getElementById('search')?.focus() }
      if (e.key === 'Escape') setModal(false)
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  })
  const visible = useMemo(() => notes.filter(n => {
    if (filter === 'trash') {
      if (n.deletedAt === null) return false
    } else if (filter === 'archive') {
      if (n.archivedAt === null || n.deletedAt !== null) return false
    } else {
      if (n.deletedAt !== null || n.archivedAt !== null) return false
      if (filter === 'pinned' && !n.pinned) return false
      if (filter.startsWith('type:') && n.type !== filter.slice(5)) return false
      if (filter.startsWith('collection:') && n.collectionId !== filter.slice('collection:'.length)) return false
    }
    const q = query.toLowerCase().trim()
    return !q || [n.title, n.bodyMarkdown, n.sourceUrl, ...n.tags].join(' ').toLowerCase().includes(q)
  }), [notes, query, filter])
  const active = draft ?? visible.find(n => n.id === selected) ?? notes.find(n => n.id === selected) ?? null
  async function create(type: NoteType = 'note') {
    const collectionId = filter.startsWith('collection:') ? filter.slice('collection:'.length) : null
    const n = blank(type, collectionId); await saveNote(n); await refresh(); setSelected(n.id); setDraft(n); setMobilePane('editor')
  }
  async function update(patch: Partial<Note>) {
    if (!active) return
    const next = { ...active, ...patch, updatedAt: Date.now() }; setDraft(next); setSaving('Saving…')
    try { await saveNote(next); setSaving('Saved'); await refresh() } catch { setSaving('Save failed') }
  }
  async function archive(n: Note) { await saveNote({ ...n, archivedAt: Date.now(), updatedAt: Date.now() }); await refresh() }
  async function restore(n: Note) { await saveNote({ ...n, archivedAt: null, deletedAt: null, updatedAt: Date.now() }); setSelected(null); setDraft(null); await refresh() }
  async function permanentlyDelete(n: Note) { if (!window.confirm('Permanently delete this note? This cannot be undone.')) return; await db.notes.delete(n.id); setSelected(null); setDraft(null); await refresh() }
  async function createCollection() { const name = window.prompt('Collection name'); if (!name?.trim()) return; const collection: Collection = { id: uid(), name: name.trim(), parentId: null, sortOrder: collections.length, createdAt: Date.now() }; await db.collections.add(collection); await refresh() }
  async function trash(n: Note) { await saveNote({ ...n, deletedAt: Date.now(), updatedAt: Date.now() }); setSelected(null); setDraft(null); await refresh() }
  async function togglePin(n: Note) { await saveNote({ ...n, pinned: !n.pinned, updatedAt: Date.now() }); await refresh() }
  async function downloadMarkdown() { const content = notes.filter(n => n.deletedAt === null).map(n => `# ${n.title || 'Untitled note'}\n\n> Type: ${n.type} · Updated: ${new Date(n.updatedAt).toISOString()}\n\n${n.sourceUrl ? `[Source](${n.sourceUrl})\n\n` : ''}${n.bodyMarkdown}`).join('\n\n---\n\n'); const blob = new Blob([content], {type:'text/markdown;charset=utf-8'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'secondbrain-notes.md'; a.click(); URL.revokeObjectURL(a.href) }
  async function importMarkdown(file?: File) { if (!file) return; const bodyMarkdown = await file.text(); const title = bodyMarkdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || file.name.replace(/\.md$/i, ''); const note = { ...blank(), title, bodyMarkdown }; await saveNote(note); await refresh(); setSelected(note.id); setDraft(note); setMobilePane('editor') }
  async function downloadBackup() { const blob = new Blob([await exportBackup()], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'secondbrain-backup.json'; a.click(); URL.revokeObjectURL(a.href) }
  async function importFile(file?: File) { if (!file) return; try { await importBackup(await file.text(), 'merge'); await refresh(); alert('Backup merged successfully.') } catch (e) { alert('Import failed: ' + (e as Error).message) } }
  const count = notes.filter(n => !n.deletedAt && !n.archivedAt).length
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Sparkles size={17}/></div><span>second<span className="brand-muted">brain</span></span></div>
      <button className="capture" onClick={() => void create()}><Plus size={17}/> New note <kbd>⌘ N</kbd></button>
      <div className="nav-label">WORKSPACE</div>
      <button className={filter==='all'?'nav-item active':'nav-item'} onClick={()=>setFilter('all')}><Inbox/> All notes <span>{count}</span></button>
      <button className={filter==='pinned'?'nav-item active':'nav-item'} onClick={()=>setFilter('pinned')}><Pin/> Pinned</button>
      <button className={filter==='archive'?'nav-item active':'nav-item'} onClick={()=>setFilter('archive')}><Archive/> Archive</button>
      <button className={filter==='trash'?'nav-item active':'nav-item'} onClick={()=>setFilter('trash')}><Trash2/> Trash</button>
      <div className="nav-label section-label">COLLECTIONS</div>
      {collections.map(collection => <button key={collection.id} className={filter==='collection:'+collection.id?'nav-item active':'nav-item'} onClick={()=>setFilter('collection:'+collection.id)}><Folder size={15}/>{collection.name}</button>)}
      <button className="nav-item" onClick={()=>void createCollection()}><Plus size={15}/> New collection</button>
      <div className="nav-label section-label">NOTE TYPES</div>
      {noteTypes.map(t=><button key={t.id} className={filter==='type:'+t.id?'nav-item active':'nav-item'} onClick={()=>setFilter('type:'+t.id)}><span className="type-symbol">{t.icon}</span>{t.label}</button>)}
      <div className="sidebar-bottom"><div className="storage-card"><div className="storage-icon"><BookOpen size={16}/></div><div><b>Your space, your data</b><small>Stored on this device</small></div><span className="local-dot"/></div>
        <button className="nav-item" onClick={()=>setModal(true)}><Settings/> Settings</button>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><b>{filter==='all'?'All notes':filter==='pinned'?'Pinned':filter==='archive'?'Archive':filter==='trash'?'Trash':filter.startsWith('collection:')?collections.find(c=>c.id===filter.slice(11))?.name:noteTypes.find(t=>t.id===filter.slice(5))?.label}</b></div>
        <div className="top-actions"><div className="searchbox"><Search size={16}/><input id="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search your brain…" /><kbd>⌘ K</kbd></div><button className="icon-button" title="Toggle theme" onClick={()=>{const t=theme==='dark'?'light':'dark';setTheme(t);void db.settings.put({key:'theme',value:t})}}>{theme==='dark'?<Sun/>:<Moon/>}</button><button className="avatar">K</button></div>
      </header>
      <div className="workspace">
        <section className={'note-list '+(mobilePane==='editor'?'mobile-hidden':'')}>
          <div className="list-heading"><div><h1>{filter==='all'?'Your knowledge':filter==='pinned'?'Pinned notes':filter==='archive'?'Archived notes':filter==='trash'?'Recently deleted':filter.startsWith('collection:')?collections.find(c=>c.id===filter.slice(11))?.name:'Your '+filter.slice(5)+'s'}</h1><p>{visible.length} {visible.length===1?'note':'notes'} in your space</p></div><button className="small-add" onClick={()=>void create()}><Plus size={16}/></button></div>
          {visible.length===0 ? <div className="empty-list"><div className="empty-icon"><BookOpen size={22}/></div><b>{query?'Nothing found':filter==='trash'?'Trash is empty':'A clear mind starts here'}</b><p>{query?'Try another search term.':'Capture a thought, save a link, or start an idea.'}</p>{!query&&filter==='all'&&<button onClick={()=>void create()} className="text-action">Create your first note <span>→</span></button>}</div> :
            <div className="notes">{visible.map(n=><button key={n.id} className={'note-card '+(selected===n.id?'selected':'')} onClick={()=>{setSelected(n.id);setDraft(null);setMobilePane('editor')}}>
              <div className="note-card-top"><span className={'type-pill '+n.type}>{noteTypes.find(t=>t.id===n.type)?.label}</span>{n.pinned&&<Pin size={13}/>}</div><b>{n.title||'Untitled note'}</b><p>{n.bodyMarkdown.replace(/[#>*`\[\]]/g,'').slice(0,100)||'No additional text yet…'}</p><div className="note-meta"><span>{new Date(n.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span>{n.tags.slice(0,2).map(t=><span className="tag" key={t}>#{t}</span>)}</div>
            </button>)}</div>}
        </section>
        <section className={'editor-pane '+(mobilePane==='list'?'mobile-hidden':'')}>
          {active ? <><div className="editor-toolbar"><button className="back-mobile" onClick={()=>setMobilePane('list')}>← Notes</button><div className="save-state"><span className={saving==='Saved'?'save-dot':'save-dot pending'}/>{saving}</div><div className="toolbar-actions">{active.deletedAt !== null ? <><button title="Restore note" onClick={()=>void restore(active)}><Undo2 size={16}/></button><button title="Delete permanently" onClick={()=>void permanentlyDelete(active)}><Trash2 size={16}/></button></> : <><button title="Pin note" onClick={()=>void togglePin(active)} className={active.pinned?'toolbar-active':''}><Pin size={16}/></button><button title="Archive" onClick={()=>void archive(active)}><Archive size={16}/></button><button title="Move to trash" onClick={()=>void trash(active)}><Trash2 size={16}/></button></>}</div></div>
            <Editor note={active} collections={collections} allNotes={notes} onChange={update} onOpenNote={(target)=>{setSelected(target.id);setDraft(null);setFilter('all');setMobilePane('editor')}}/>
          </> : <div className="editor-empty"><div className="empty-orbit"><Sparkles size={25}/></div><h2>Your second brain, at your fingertips.</h2><p>Select a note to continue, or capture something before it slips away.</p><button className="capture" onClick={()=>void create()}><Plus size={16}/> Create a note</button><div className="shortcut-hint"><kbd>⌘ N</kbd> new note <span>·</span> <kbd>⌘ K</kbd> search</div></div>}
        </section>
      </div>
    </main>
    {modal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(false)}}><div className="settings-modal"><div className="modal-head"><div><span className="eyebrow">PREFERENCES</span><h2>Settings</h2></div><button className="icon-button" onClick={()=>setModal(false)}><X/></button></div><div className="setting-row"><div><b>Appearance</b><small>Choose how SecondBrain looks</small></div><select value={theme} onChange={e=>{setTheme(e.target.value);void db.settings.put({key:'theme',value:e.target.value})}}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div><div className="setting-row"><div><b>Export your data</b><small>Download all notes as a JSON backup</small></div><button className="outline-btn" onClick={()=>void downloadBackup()}>Export JSON</button></div>
          <div className="setting-row"><div><b>Markdown export</b><small>Export your notes as one Markdown file</small></div><button className="outline-btn" onClick={()=>void downloadMarkdown()}>Export .md</button></div>
          <div className="setting-row"><div><b>Import Markdown</b><small>Import one Markdown file as a new note</small></div><label className="outline-btn file-label">Import .md<input type="file" accept=".md,text/markdown" onChange={e=>void importMarkdown(e.target.files?.[0])}/></label></div><div className="setting-row"><div><b>Import a backup</b><small>Merge validated notes from a JSON backup</small></div><label className="outline-btn file-label">Import JSON<input type="file" accept="application/json" onChange={e=>void importFile(e.target.files?.[0])}/></label></div><p className="privacy-note">Your notes live in this browser's IndexedDB. They are not encrypted or synced. Clearing browser data or changing devices can remove access. Export backups regularly.</p><div className="modal-foot">SecondBrain · Local-first by design</div></div></div>}
  </div>
}
