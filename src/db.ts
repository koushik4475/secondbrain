import Dexie, { type Table } from 'dexie'
import { z } from 'zod'
import type { Note, Tag, Collection, AppSetting } from './types'

export function safeHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

export const NoteSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(500),
  bodyMarkdown: z.string(),
  type: z.enum(['note', 'idea', 'meeting', 'learning', 'code', 'bookmark']),
  collectionId: z.string().nullable(),
  tags: z.array(z.string().max(100)),
  pinned: z.boolean(),
  archivedAt: z.number().nullable(),
  deletedAt: z.number().nullable(),
  sourceUrl: z.string().refine((value) => value === '' || safeHttpUrl(value) !== '', 'Source URL must use HTTP or HTTPS.'),
  codeLanguage: z.enum(['javascript', 'typescript', 'python', 'json', 'bash']),
  createdAt: z.number(),
  updatedAt: z.number()
})

const TagSchema = z.object({
  id: z.string(), name: z.string().min(1).max(100), normalizedName: z.string().min(1).max(100), color: z.string(), createdAt: z.number()
})
const CollectionSchema = z.object({
  id: z.string(), name: z.string().min(1).max(100), parentId: z.string().nullable(), sortOrder: z.number(), createdAt: z.number()
})
const SettingSchema = z.object({ key: z.string().min(1), value: z.union([z.string(), z.number(), z.boolean()]) })

class BrainDB extends Dexie {
  notes!: Table<Note, string>
  tags!: Table<Tag, string>
  collections!: Table<Collection, string>
  settings!: Table<AppSetting, string>

  constructor() {
    super('secondbrain')
    this.version(1).stores({
      notes: 'id, title, type, collectionId, pinned, archivedAt, deletedAt, createdAt, updatedAt, *tags',
      tags: 'id, &normalizedName, name',
      collections: 'id, name, parentId, sortOrder',
      settings: 'key'
    })
  }
}

export const db = new BrainDB()

export async function ensureDefaults() {
  const count = await db.collections.count()
  if (!count) {
    await db.collections.add({ id: crypto.randomUUID(), name: 'Personal', parentId: null, sortOrder: 0, createdAt: Date.now() })
  }
  if (!(await db.settings.get('theme'))) await db.settings.put({ key: 'theme', value: 'system' })
}

export async function saveNote(note: Note) {
  const validated = NoteSchema.parse(note)
  await db.notes.put(validated)
}

export async function exportBackup() {
  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    notes: await db.notes.toArray(),
    tags: await db.tags.toArray(),
    collections: await db.collections.toArray(),
    settings: await db.settings.toArray()
  }
  return JSON.stringify(payload, null, 2)
}

export async function importBackup(raw: string, mode: 'merge' | 'replace') {
  const parsed = z.object({
    schemaVersion: z.literal(1),
    exportedAt: z.string().optional(),
    notes: z.array(NoteSchema),
    tags: z.array(TagSchema).default([]),
    collections: z.array(CollectionSchema).default([]),
    settings: z.array(SettingSchema).optional()
  }).parse(JSON.parse(raw))

  for (const [label, items] of [['note', parsed.notes], ['tag', parsed.tags], ['collection', parsed.collections]] as const) {
    const ids = items.map((item) => item.id)
    if (new Set(ids).size !== ids.length) throw new Error(`Backup contains duplicate ${label} IDs.`)
  }

  await db.transaction('rw', db.notes, db.tags, db.collections, db.settings, async () => {
    if (mode === 'replace') {
      await db.notes.clear()
      await db.tags.clear()
      await db.collections.clear()
      await db.settings.clear()
    }
    await db.notes.bulkPut(parsed.notes)
    await db.tags.bulkPut(parsed.tags)
    await db.collections.bulkPut(parsed.collections)
    if (parsed.settings) await db.settings.bulkPut(parsed.settings)
  })
}
