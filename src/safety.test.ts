import { describe, expect, it } from 'vitest'
import { NoteSchema, parseBackup, safeHttpUrl } from './db'
import { renderMarkdown } from './markdown'

const validNote = {
  id: '1a2b3c4d-1111-4111-8111-111111111111',
  title: 'A safe note',
  bodyMarkdown: 'hello',
  type: 'note',
  collectionId: null,
  tags: [],
  pinned: false,
  archivedAt: null,
  deletedAt: null,
  sourceUrl: '',
  codeLanguage: 'javascript',
  createdAt: 1,
  updatedAt: 1
}

describe('safeHttpUrl', () => {
  it('allows HTTP and HTTPS URLs and normalizes them', () => {
    expect(safeHttpUrl('https://example.com/path')).toBe('https://example.com/path')
    expect(safeHttpUrl('http://example.com')).toBe('http://example.com/')
  })
  it('rejects executable, data and malformed schemes', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBe('')
    expect(safeHttpUrl('data:text/html,hello')).toBe('')
    expect(safeHttpUrl('file:///etc/passwd')).toBe('')
    expect(safeHttpUrl('not a url')).toBe('')
  })
})

describe('NoteSchema', () => {
  it('accepts valid notes and defaults the bookmark summary for older data', () => {
    const parsed = NoteSchema.parse(validNote)
    expect(parsed.summary).toBe('')
  })
  it('rejects unsafe source URL schemes in imported data', () => {
    expect(NoteSchema.safeParse({ ...validNote, sourceUrl: 'javascript:alert(1)' }).success).toBe(false)
  })
})

describe('backup validation', () => {
  it('validates versioned backups and supplies empty optional collections', () => {
    const parsed = parseBackup(JSON.stringify({ schemaVersion: 1, notes: [validNote] }))
    expect(parsed.notes).toHaveLength(1)
    expect(parsed.notes[0].summary).toBe('')
    expect(parsed.tags).toEqual([])
    expect(parsed.collections).toEqual([])
  })
  it('rejects malformed notes and duplicate IDs before touching storage', () => {
    expect(() => parseBackup(JSON.stringify({ schemaVersion: 1, notes: [validNote, validNote] }))).toThrow(/duplicate note IDs/i)
    expect(() => parseBackup(JSON.stringify({ schemaVersion: 1, notes: [{ ...validNote, sourceUrl: 'javascript:alert(1)' }] }))).toThrow()
  })
})

describe('safe Markdown rendering', () => {
  it('does not create executable HTML nodes from raw HTML', () => {
    const html = renderMarkdown('<script>window.pwned = true</script>\n\n<img src=x onerror=alert(1)>')
    const container = document.createElement('div')
    container.innerHTML = html
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('window.pwned')
  })
  it('does not automatically render remote Markdown images', () => {
    const html = renderMarkdown('![private](https://example.com/private.png)')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('example.com')
  })
  it('keeps ordinary Markdown formatting', () => {
    expect(renderMarkdown('## Heading\n\n- one\n- two')).toContain('<h2')
    expect(renderMarkdown('## Heading\n\n- one\n- two')).toContain('<li>')
  })
})
