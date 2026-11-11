export type NoteType = 'note' | 'idea' | 'meeting' | 'learning' | 'code' | 'bookmark'
export interface Note {
  id: string; title: string; bodyMarkdown: string; type: NoteType; collectionId: string | null;
  tags: string[]; pinned: boolean; archivedAt: number | null; deletedAt: number | null;
  sourceUrl: string; codeLanguage: string; createdAt: number; updatedAt: number
}
export interface Tag { id: string; name: string; normalizedName: string; color: string; createdAt: number }
export interface Collection { id: string; name: string; parentId: string | null; sortOrder: number; createdAt: number }
export interface AppSetting { key: string; value: string | number | boolean }
export const noteTypes: { id: NoteType; label: string; icon: string }[] = [
  { id: 'note', label: 'Note', icon: '✎' }, { id: 'idea', label: 'Idea', icon: '✧' },
  { id: 'meeting', label: 'Meeting', icon: '◷' }, { id: 'learning', label: 'Learning', icon: '⌘' },
  { id: 'code', label: 'Code', icon: '</>' }, { id: 'bookmark', label: 'Bookmark', icon: '↗' }
]
export const uid = () => crypto.randomUUID()
