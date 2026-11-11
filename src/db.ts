import Dexie, { type Table } from 'dexie'
import { z } from 'zod'
import type { Note, Tag, Collection, AppSetting } from './types'

export function safeHttpUrl(value: string) {
  try {
    const url = new URL(value.trim())
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

export const NoteSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(500),
  bodyMarkdown: z.string(),
  summary: z.string().default(''),
  type: z.enum(['note', 'idea', 'meeting', 'learning', 'code', 'bookmark']),
  collectionId: z.string().nullable(),
  tags: z.array(z.string().trim().min(1).max(100)),
  pinned: z.boolean(),
  archivedAt: z.number().nullable(),
  deletedAt: z.number().nullable(),
  sourceUrl: z.string().refine((value) => value === '' || safeHttpUrl(value) !== '', 'Source URL must use HTTP or HTTPS.'),
  codeLanguage: z.enum(['javascript', 'typescript', 'python', 'json', 'bash']),
  createdAt: z.number(),
  updatedAt: z.number()
})
export const TagSchema = z.object({
  id: z.string().min(1), name: z.string().trim().min(1).max(100),
  normalizedName: z.string().trim().min(1).max(100), color: z.string(), createdAt: z.number()
})
export const CollectionSchema = z.object({
  id: z.string().min(1), name: z.string().trim().min(1).max(100),
  parentId: z.string().nullable(), sortOrder: z.number(), createdAt: z.number()
})
const SettingSchema = z.object({ key: z.string().min(1), value: z.union([z.string(), z.number(), z.boolean()]) })
const BackupSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string().optional(),
  notes: z.array(NoteSchema),
  tags: z.array(TagSchema).default([]),
  collections: z.array(CollectionSchema).default([]),
  settings: z.array(SettingSchema).default([])
})
export type ParsedBackup = z.infer<typeof BackupSchema>

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
    this.version(2).stores({
      notes: 'id, title, type, collectionId, pinned, archivedAt, deletedAt, createdAt, updatedAt, *tags',
      tags: 'id, &normalizedName, name',
      collections: 'id, name, parentId, sortOrder',
      settings: 'key'
    }).upgrade(async (transaction) => {
      await transaction.table('notes').toCollection().modify((note: Record<string, unknown>) => {
        if (typeof note.summary !== 'string') note.summary = ''
      })
    })
  }
}

export const db = new BrainDB()

export async function ensureDefaults() {
  if (!(await db.settings.get('theme'))) await db.settings.put({ key: 'theme', value: 'system' })
  if (!(await db.settings.get('editorFontSize'))) await db.settings.put({ key: 'editorFontSize', value: 14 })
}

export async function saveNote(note: Note) {
  const validated = NoteSchema.parse(note) as Note
  await db.transaction('rw', db.notes, db.tags, async () => {
    await db.notes.put(validated)
    const existing = await db.tags.toArray()
    const byName = new Map(existing.map((tag) => [tag.normalizedName, tag]))
    const used = new Set<string>()
    for (const raw of validated.tags) {
      const name = raw.trim().replace(/^#/, '')
      if (!name) continue
      const normalizedName = name.toLocaleLowerCase()
      used.add(normalizedName)
      if (!byName.has(normalizedName)) {
        const tag: Tag = { id: crypto.randomUUID(), name, normalizedName, color: 'violet', createdAt: Date.now() }
        await db.tags.add(tag)
        byName.set(normalizedName, tag)
      }
    }
    const allNotes = await db.notes.toArray()
    const stillUsed = new Set(allNotes.flatMap((item) => item.tags.map((value) => value.toLocaleLowerCase())))
    for (const tag of existing) if (!stillUsed.has(tag.normalizedName)) await db.tags.delete(tag.id)
  })
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

export function parseBackup(raw: string): ParsedBackup {
  const parsed = BackupSchema.parse(JSON.parse(raw))
  for (const [label, items] of [['note', parsed.notes], ['tag', parsed.tags], ['collection', parsed.collections]] as const) {
    const ids = items.map((item) => item.id)
    if (new Set(ids).size !== ids.length) throw new Error(`Backup contains duplicate ${label} IDs.`)
  }
  const normalizedTags = parsed.tags.map((tag) => tag.normalizedName.toLocaleLowerCase())
  if (new Set(normalizedTags).size !== normalizedTags.length) throw new Error('Backup contains duplicate normalized tag names.')
  return parsed
}

export async function importBackup(raw: string, mode: 'merge' | 'replace') {
  const parsed = parseBackup(raw)
  await db.transaction('rw', db.notes, db.tags, db.collections, db.settings, async () => {
    if (mode === 'replace') {
      await db.notes.clear()
      await db.tags.clear()
      await db.collections.clear()
      await db.settings.clear()
    }

    const existingNotes = mode === 'merge' ? new Set(await db.notes.toCollection().primaryKeys()) : new Set<string>()
    const existingCollections = mode === 'merge' ? new Set(await db.collections.toCollection().primaryKeys()) : new Set<string>()
    const collectionIds = new Map<string, string>()
    for (const collection of parsed.collections) {
      const id = existingCollections.has(collection.id) ? crypto.randomUUID() : collection.id
      collectionIds.set(collection.id, id)
      await db.collections.put({ ...collection, id })
    }

    const safeNotes = parsed.notes.map((note) => ({
      ...note,
      id: existingNotes.has(note.id) ? crypto.randomUUID() : note.id,
      collectionId: note.collectionId ? (collectionIds.get(note.collectionId) ?? null) : null
    }))
    await db.notes.bulkPut(safeNotes)

    const existingTags = new Set((await db.tags.toArray()).map((tag) => tag.normalizedName.toLocaleLowerCase()))
    const importedTags = parsed.tags.filter((tag) => !existingTags.has(tag.normalizedName.toLocaleLowerCase()))
    const existingTagIds = new Set(await db.tags.toCollection().primaryKeys())
    await db.tags.bulkPut(importedTags.map((tag) => ({ ...tag, id: existingTagIds.has(tag.id) ? crypto.randomUUID() : tag.id, normalizedName: tag.normalizedName.toLocaleLowerCase() })))

    if (mode === 'replace') await db.settings.bulkPut(parsed.settings)
    else {
      const existingSettings = new Set((await db.settings.toArray()).map((setting) => setting.key))
      await db.settings.bulkPut(parsed.settings.filter((setting) => !existingSettings.has(setting.key)))
    }
  })
}

export async function renameTagEverywhere(oldName: string, newName: string) {
  const oldNormalized = oldName.toLocaleLowerCase()
  const name = newName.trim().replace(/^#/, '').slice(0, 100)
  const normalizedName = name.toLocaleLowerCase()
  if (!name) throw new Error('Tag name cannot be empty.')
  await db.transaction('rw', db.notes, db.tags, async () => {
    const current = await db.tags.where('normalizedName').equals(oldNormalized).first()
    const target = await db.tags.where('normalizedName').equals(normalizedName).first()
    const allNotes = await db.notes.toArray()
    for (const note of allNotes) {
      if (!note.tags.some((tag) => tag.toLocaleLowerCase() === oldNormalized)) continue
      const renamed = note.tags.map((tag) => tag.toLocaleLowerCase() === oldNormalized ? (target?.name ?? name) : tag)
      const unique = [...new Map(renamed.map((tag) => [tag.toLocaleLowerCase(), tag])).values()]
      await db.notes.put({ ...note, tags: unique, updatedAt: Date.now() })
    }
    if (current && current.id !== target?.id) await db.tags.delete(current.id)
    if (!target) await db.tags.put({ id: current?.id ?? crypto.randomUUID(), name, normalizedName, color: current?.color ?? 'violet', createdAt: current?.createdAt ?? Date.now() })
  })
}

export async function removeTagEverywhere(rawName: string) {
  const normalizedName = rawName.toLocaleLowerCase()
  await db.transaction('rw', db.notes, db.tags, async () => {
    const allNotes = await db.notes.toArray()
    for (const note of allNotes) {
      if (note.tags.some((tag) => tag.toLocaleLowerCase() === normalizedName)) {
        await db.notes.put({ ...note, tags: note.tags.filter((tag) => tag.toLocaleLowerCase() !== normalizedName), updatedAt: Date.now() })
      }
    }
    const tag = await db.tags.where('normalizedName').equals(normalizedName).first()
    if (tag) await db.tags.delete(tag.id)
  })
}

export async function clearAllData() {
  await db.transaction('rw', db.notes, db.tags, db.collections, db.settings, async () => {
    await db.notes.clear()
    await db.tags.clear()
    await db.collections.clear()
    await db.settings.clear()
  })
}
