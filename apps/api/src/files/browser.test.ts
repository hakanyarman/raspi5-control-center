import assert from 'node:assert/strict'
import { mkdtemp, mkdir, symlink, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { FilePathError, getDownloadFile, listFiles, MAX_DOWNLOAD_BYTES, resolveFilesPath } from './browser'

describe('files browser containment', () => {
  it('lists files and directories while ignoring symlinks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'raspi-files-'))
    try {
      await mkdir(join(root, 'docs'))
      await writeFile(join(root, 'docs', 'note.txt'), 'hello')
      await symlink('/etc/passwd', join(root, 'passwd-link'))
      const listing = await listFiles('', '', 'name', 'asc', root)
      assert.deepEqual(listing.entries.map((entry) => entry.name), ['docs'])
      const nested = await listFiles('docs', '', 'name', 'asc', root)
      assert.equal(nested.entries[0]?.relativePath, 'docs/note.txt')
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('rejects traversal, absolute paths, and symlink escapes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'raspi-files-'))
    try {
      await symlink('/etc', join(root, 'escape'))
      await assert.rejects(resolveFilesPath('../etc', root), FilePathError)
      await assert.rejects(resolveFilesPath('/etc/passwd', root), FilePathError)
      await assert.rejects(resolveFilesPath('escape/passwd', root), FilePathError)
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('allows only bounded regular-file downloads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'raspi-files-'))
    try {
      await writeFile(join(root, 'small.txt'), 'ok')
      const file = await getDownloadFile('small.txt', root)
      assert.equal(file.sizeBytes, 2)
      await assert.rejects(getDownloadFile('', root), FilePathError)
      await writeFile(join(root, 'large.bin'), Buffer.alloc(MAX_DOWNLOAD_BYTES + 1))
      await assert.rejects(getDownloadFile('large.bin', root), FilePathError)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
