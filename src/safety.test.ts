import { describe, expect, it } from 'vitest'
import { NoteSchema, safeHttpUrl } from './db'

describe('safeHttpUrl', () => {
  it('allows HTTP and HTTPS URLs', () => {
    expect(safeHttpUrl('https://example.com/path')).toBe('https://example.com/path')
    expect(safeHttpUrl('http://example.com')).toBe('http://example.com/')
  })
  it('rejects executable and malformed schemes', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBe('')
    expect(safeHttpUrl('data:text/html,hello')).toBe('')
    expect(safeHttpUrl('not a url')).toBe('')
  })
})


describe('NoteSchema', () => {
  const validNote = {
    id: '1a2b3c4d-1111-4111-8111-111111111111', title: 'A safe note', bodyMarkdown: 'hello', type: 'note',
    collectionId: null, tags: [], pinned: false, archivedAt: null, deletedAt: null, sourceUrl: '',
    codeLanguage: 'javascript', createdAt: 1, updatedAt: 1
  }

  it('accepts valid note data', () => {
    expect(NoteSchema.safeParse(validNote).success).toBe(true)
  })

  it('rejects unsafe source URL schemes in imported data', () => {
    expect(NoteSchema.safeParse({ ...validNote, sourceUrl: 'javascript:alert(1)' }).success).toBe(false)
  })
})
