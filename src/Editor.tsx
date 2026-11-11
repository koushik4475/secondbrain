import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import DOMPurify from 'dompurify'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { StreamLanguage } from '@codemirror/language'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import type { Collection, Note } from './types'
import { noteTypes } from './types'
import { safeHttpUrl } from './db'
import { renderMarkdown } from './markdown'

type EditorProps = {
  note: Note
  collections: Collection[]
  allNotes: Note[]
  fontSize: number
  onChange: (patch: Partial<Note>) => void
  onPending: () => void
  onOpenNote: (note: Note) => void
  onExport: (note: Note) => void
}

export default function Editor({ note, collections, allNotes, fontSize, onChange, onPending, onOpenNote, onExport }: EditorProps) {
  const [tag, setTag] = useState('')
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [copied, setCopied] = useState(false)
  const [urlError, setUrlError] = useState('')
  const [bookmarkUrl, setBookmarkUrl] = useState(note.sourceUrl)
  const changeRef = useRef(onChange)
  const timer = useRef<number | undefined>(undefined)
  const pendingBody = useRef(note.bodyMarkdown)

  useEffect(() => {
    pendingBody.current = note.bodyMarkdown
  }, [note.id, note.bodyMarkdown])

  useEffect(() => { changeRef.current = onChange }, [onChange])
  useEffect(() => { setBookmarkUrl(note.sourceUrl) }, [note.id, note.sourceUrl])

  useEffect(() => () => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current)
      changeRef.current({ bodyMarkdown: pendingBody.current })
      timer.current = undefined
    }
  }, [note.id])

  const languageExtension = useMemo(() => {
    if (note.type !== 'code') return markdown()
    switch (note.codeLanguage) {
      case 'typescript': return javascript({ typescript: true })
      case 'python': return python()
      case 'json': return json()
      case 'bash': return StreamLanguage.define(shell)
      default: return javascript()
    }
  }, [note.codeLanguage, note.type])

  const previewSource = useMemo(
    () => note.bodyMarkdown.replace(/\[\[([^\]]+)\]\]/g, (_match, title: string) => `[${title.trim()}](#note=${encodeURIComponent(title.trim())})`),
    [note.bodyMarkdown]
  )
  const html = useMemo(() => DOMPurify.sanitize(renderMarkdown(previewSource)), [previewSource])
  const backlinks = useMemo(() => allNotes.filter((candidate) =>
    candidate.id !== note.id && candidate.deletedAt === null &&
    candidate.bodyMarkdown.toLocaleLowerCase().includes(`[[${note.title.trim().toLocaleLowerCase()}]]`) && note.title.trim().length > 0
  ), [allNotes, note.id, note.title])

  function updateBody(bodyMarkdown: string) {
    pendingBody.current = bodyMarkdown
    onPending()
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      onChange({ bodyMarkdown: pendingBody.current })
    }, 250)
  }

  function addTag(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && tag.trim()) {
      event.preventDefault()
      const next = tag.trim().replace(/^#/, '').slice(0, 100)
      if (next && !note.tags.some((existing) => existing.toLocaleLowerCase() === next.toLocaleLowerCase())) {
        onChange({ tags: [...note.tags, next] })
      }
      setTag('')
    }
  }

  function openInternalLink(event: MouseEvent<HTMLElement>) {
    const target = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#note="]')
    if (!target) return
    event.preventDefault()
    try {
      const title = decodeURIComponent(target.hash.slice('#note='.length)).toLocaleLowerCase()
      const match = allNotes.find((candidate) => candidate.deletedAt === null && candidate.title.trim().toLocaleLowerCase() === title)
      if (match) onOpenNote(match)
    } catch {
      // Malformed internal references are inert.
    }
  }

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(note.bodyMarkdown)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return <div className="editor-content">
    <div className="editor-type">
      <span className={'type-pill ' + note.type}>{noteTypes.find((type) => type.id === note.type)?.label}</span>
      <select aria-label="Note type" value={note.type} onChange={(event) => onChange({ type: event.target.value as Note['type'] })}>
        {noteTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
      </select>
      <select aria-label="Note collection" value={note.collectionId ?? ''} onChange={(event) => onChange({ collectionId: event.target.value || null })}>
        <option value="">No collection</option>
        {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
      </select>
      <button className="subtle-action export-note" onClick={() => onExport(note)} title="Export this note as Markdown">Export .md</button>
    </div>
    <input className="title-input" value={note.title} onChange={(event) => onChange({ title: event.target.value })} placeholder="Untitled note" aria-label="Note title" />
    <div className="editor-details">
      {note.type === 'bookmark' && <>
        <label className="field-label" htmlFor="bookmark-url">Bookmark URL</label>
        <input id="bookmark-url" className="source-input" value={bookmarkUrl} onChange={(event) => { setBookmarkUrl(event.target.value); setUrlError('') }} onBlur={(event) => {
          const value = event.target.value.trim()
          const safe = value ? safeHttpUrl(value) : ''
          setBookmarkUrl(safe)
          onChange({ sourceUrl: safe })
          setUrlError(value && !safe ? 'Only valid HTTP or HTTPS links are allowed.' : '')
        }} placeholder="https://example.com" aria-label="Source URL" />
        {urlError && <small className="field-error" role="alert">{urlError}</small>}
        <label className="field-label" htmlFor="bookmark-summary">Short summary (optional)</label>
        <textarea id="bookmark-summary" className="summary-input" value={note.summary} onChange={(event) => onChange({ summary: event.target.value })} placeholder="Why is this link worth saving?" rows={2}/>
      </>}
      {note.type === 'code' && <>
        <label className="field-label" htmlFor="code-language">Language</label>
        <select id="code-language" aria-label="Code language" value={note.codeLanguage} onChange={(event) => onChange({ codeLanguage: event.target.value as Note['codeLanguage'] })}>
          <option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="python">Python</option><option value="json">JSON</option><option value="bash">Bash</option>
        </select>
        <label className="field-label" htmlFor="code-summary">Description (optional)</label>
        <textarea id="code-summary" className="summary-input" value={note.summary} onChange={(event) => onChange({ summary: event.target.value })} placeholder="What does this snippet do?" rows={2}/>
      </>}
      <div className="tag-input"><span>Tags</span>{note.tags.map((value) => <button key={value} aria-label={`Remove tag ${value}`} className="tag" onClick={() => onChange({ tags: note.tags.filter((existing) => existing !== value) })}>#{value} ×</button>)}<input aria-label="Add tag" value={tag} onChange={(event) => setTag(event.target.value)} onKeyDown={addTag} placeholder="+ add tag, press Enter" /></div>
    </div>
    <div className="write-tabs">
      <button className={tab === 'write' ? 'chosen' : ''} onClick={() => setTab('write')}>Write</button>
      <button className={tab === 'preview' ? 'chosen' : ''} onClick={() => setTab('preview')}>Preview</button>
      <span>{note.type === 'code' ? 'Code is highlighted but never executed' : 'Markdown · [[Note title]] links'}</span>
    </div>
    {tab === 'write' ? <div className="code-editor" style={{ fontSize }}>
      <CodeMirror value={note.bodyMarkdown} height="min(58vh, 620px)" extensions={[languageExtension]} onChange={updateBody} basicSetup={{ lineNumbers: note.type === 'code', foldGutter: true, highlightActiveLine: true }} placeholder={note.type === 'code' ? 'Write or paste a code snippet…' : 'Start with a thought… Use Markdown to shape it.'} />
    </div> : note.type === 'code' ? <div className="code-preview"><div className="code-preview-head"><span>{note.codeLanguage} · read only</span><button onClick={() => void copySnippet()}>{copied ? 'Copied!' : 'Copy code'}</button></div><CodeMirror value={note.bodyMarkdown} height="auto" extensions={[languageExtension]} readOnly basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: false }}/></div> : <article className="markdown-preview" onClick={openInternalLink} dangerouslySetInnerHTML={{ __html: html }} />}
    {note.type === 'bookmark' && note.summary && tab === 'preview' && <p className="bookmark-summary">{note.summary}</p>}
    {backlinks.length > 0 && <div className="backlinks"><b>Backlinks · {backlinks.length}</b>{backlinks.map((backlink) => <button key={backlink.id} onClick={() => onOpenNote(backlink)}>{backlink.title || 'Untitled note'}</button>)}</div>}
    <div className="editor-footer"><span>Created {new Date(note.createdAt).toLocaleString()}</span><span>Autosave writes to this browser only</span></div>
  </div>
}
