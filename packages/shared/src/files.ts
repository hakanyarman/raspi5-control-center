export type FileKind = 'file' | 'directory'

export interface FileEntry {
  name: string
  relativePath: string
  kind: FileKind
  sizeBytes: number | null
  modifiedAt: string
  mimeType: string | null
}

export interface FileListing {
  root: string
  path: string
  entries: FileEntry[]
  readOnly: true
}
