import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
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

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
type EditorProps = {
  note: Note
  collections: Collection[]
  allNotes: Note[]
  onChange: (patch: Partial<Note>) => void
  onOpenNote: (note: Note) => void
}

export default function Editor({ note, collections, allNotes, onChange, onOpenNote }: EditorProps) {
  const [tag, setTag] = useState('')
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [note.id])

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
  const html = useMemo(() => DOMPurify.sanitize(md.render(previewSource)), [previewSource])
  const backlinks = useMemo(() => allNotes.filter((candidate) =>
    candidate.id !== note.id && candidate.deletedAt === null &&
    candidate.bodyMarkdown.toLocaleLowerCase().includes(`[[${note.title.toLocaleLowerCase()}]]`)
  ), [allNotes, note.id, note.title])

  function updateBody(bodyMarkdown: string) {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => onChange({ bodyMarkdown }), 250)
  }

  function addTag(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && tag.trim()) {
      event.preventDefault()
      const next = tag.trim().replace(/^#/, '')
      if (!note.tags.some((existing) => existing.toLowerCase() === next.toLowerCase())) {
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
      // Ignore malformed links rather than navigating to an unexpected URL.
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
    </div>
    <input className="title-input" value={note.title} onChange={(event) => onChange({ title: event.target.value })} placeholder="Untitled note" aria-label="Note title" />
    <div className="editor-details">
      {note.type === 'bookmark' && <input className="source-input" value={note.sourceUrl} onChange={(event) => onChange({ sourceUrl: event.target.value })} onBlur={(event) => { const value = safeHttpUrl(event.target.value); onChange({ sourceUrl: value }) }} placeholder="https://example.com" aria-label="Source URL" />}
      {note.type === 'code' && <select aria-label="Code language" value={note.codeLanguage} onChange={(event) => onChange({ codeLanguage: event.target.value })}>
        <option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="python">Python</option><option value="json">JSON</option><option value="bash">Bash</option>
      </select>}
      <div className="tag-input"><span>Tags</span>{note.tags.map((value) => <button key={value} className="tag" onClick={() => onChange({ tags: note.tags.filter((existing) => existing !== value) })}>#{value} ×</button>)}<input value={tag} onChange={(event) => setTag(event.target.value)} onKeyDown={addTag} placeholder="+ add tag" /></div>
    </div>
    <div className="write-tabs"><button className={tab === 'write' ? 'chosen' : ''} onClick={() => setTab('write')}>Write</button><button className={tab === 'preview' ? 'chosen' : ''} onClick={() => setTab('preview')}>Preview</button><span>Markdown supported · use [[Note title]] to link notes</span></div>
    {tab === 'write' ? <div className="code-editor"><CodeMirror value={note.bodyMarkdown} height="min(58vh, 620px)" extensions={[languageExtension]} onChange={updateBody} basicSetup={{ lineNumbers: note.type === 'code', foldGutter: false, highlightActiveLine: false }} placeholder="Start with a thought… Use Markdown to shape it." /></div> : <article className="markdown-preview" onClick={openInternalLink} dangerouslySetInnerHTML={{ __html: html }} />}
    {backlinks.length > 0 && <div className="backlinks"><b>Linked mentions</b>{backlinks.map((backlink) => <button key={backlink.id} onClick={() => onOpenNote(backlink)}>{backlink.title || 'Untitled note'}</button>)}</div>}
    <div className="editor-footer"><span>Created {new Date(note.createdAt).toLocaleString()}</span><span>Changes save automatically</span></div>
  </div>
}
