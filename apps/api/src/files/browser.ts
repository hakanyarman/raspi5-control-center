import { lstat, readdir, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { FileEntry, FileListing } from '@raspi5-control-center/shared'

export const DEFAULT_FILES_ROOT = '/home/hakanyarman/control-center-files'

export function getFilesRoot(): string {
  return resolve(process.env.FILES_ROOT ?? DEFAULT_FILES_ROOT)
}
export const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024

export class FilesRootUnavailableError extends Error {}
export class FilePathError extends Error {}

function ensureContained(root: string, candidate: string): string {
  const rel = relative(root, candidate)
  if (rel !== '' && (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))) {
    throw new FilePathError('Path escapes files root')
  }
  return candidate
}

export async function resolveFilesPath(requestedPath: unknown, root = getFilesRoot()): Promise<string> {
  if (typeof requestedPath !== 'string' || requestedPath.includes('\0') || requestedPath.includes('\\')) {
    throw new FilePathError('Invalid path')
  }
  if (isAbsolute(requestedPath)) throw new FilePathError('Absolute paths are not allowed')
  const parts = requestedPath.split('/').filter(Boolean)
  if (parts.some((part) => part === '..')) throw new FilePathError('Path traversal is not allowed')
  const realRoot = await realpath(root).catch(() => { throw new FilesRootUnavailableError('Files root unavailable') })
  const candidate = ensureContained(realRoot, resolve(realRoot, ...parts))
  const realCandidate = await realpath(candidate).catch(() => { throw new FilePathError('File not found') })
  return ensureContained(realRoot, realCandidate)
}

function mimeTypeFor(name: string): string | null {
  const values: Record<string, string> = { '.txt': 'text/plain', '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.json': 'application/json', '.csv': 'text/csv', '.md': 'text/markdown' }
  return values[extname(name).toLowerCase()] ?? null
}

export async function listFiles(requestedPath: unknown, search = '', sort: 'name' | 'size' | 'modified' = 'name', order: 'asc' | 'desc' = 'asc', root = getFilesRoot()): Promise<FileListing> {
  const directory = await resolveFilesPath(requestedPath, root)
  const directoryStat = await stat(directory).catch(() => { throw new FilePathError('File not found') })
  if (!directoryStat.isDirectory()) throw new FilePathError('Path is not a directory')
  const names = await readdir(directory)
  const entries = (await Promise.all(names.map(async (name): Promise<FileEntry | null> => {
    const child = resolve(directory, name)
    const childStat = await lstat(child).catch(() => null)
    if (!childStat) return null
    if (childStat.isSymbolicLink()) return null
    const kind: FileEntry['kind'] = childStat.isDirectory() ? 'directory' : 'file'
    const rootReal = await realpath(root)
    const childReal = await realpath(child)
    ensureContained(rootReal, childReal)
    return { name, relativePath: relative(rootReal, childReal).split(sep).join('/'), kind, sizeBytes: kind === 'file' ? childStat.size : null, modifiedAt: childStat.mtime.toISOString(), mimeType: kind === 'file' ? mimeTypeFor(name) : null }
  }))).filter((entry): entry is FileEntry => entry !== null && entry.name.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')))
  entries.sort((a, b) => {
    const result = sort === 'size' ? (a.sizeBytes ?? -1) - (b.sizeBytes ?? -1) : sort === 'modified' ? a.modifiedAt.localeCompare(b.modifiedAt) : a.name.localeCompare(b.name, 'tr')
    return order === 'asc' ? result : -result
  })
  const rootReal = await realpath(root)
  return { root: rootReal, path: relative(rootReal, directory).split(sep).join('/'), entries, readOnly: true }
}

export async function getDownloadFile(requestedPath: unknown, root = getFilesRoot()): Promise<{ path: string; name: string; sizeBytes: number }> {
  const filePath = await resolveFilesPath(requestedPath, root)
  const fileStat = await stat(filePath).catch(() => { throw new FilePathError('File not found') })
  if (!fileStat.isFile()) throw new FilePathError('Only files can be downloaded')
  if (fileStat.size > MAX_DOWNLOAD_BYTES) throw new FilePathError('File exceeds download limit')
  return { path: filePath, name: filePath.split(sep).pop() ?? 'download', sizeBytes: fileStat.size }
}
