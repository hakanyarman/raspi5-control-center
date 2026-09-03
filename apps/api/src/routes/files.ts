import type { DatabasePool } from '@raspi5-control-center/database'
import { Router } from 'express'
import { FilePathError, FilesRootUnavailableError, getDownloadFile, listFiles } from '../files/browser'

export function createFilesRouter(_pool?: DatabasePool): Router {
  const router = Router()
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  router.get('/', async (req, res, next) => {
    const sort = req.query.sort === 'size' || req.query.sort === 'modified' ? req.query.sort : 'name'
    const order = req.query.order === 'desc' ? 'desc' : 'asc'
    const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : ''
    try { res.json(await listFiles(req.query.path ?? '', search, sort, order)) }
    catch (error) { if (error instanceof FilesRootUnavailableError) { res.status(503).json({ error: 'Files root unavailable' }); return } if (error instanceof FilePathError) { res.status(400).json({ error: error.message }); return } next(error) }
  })
  router.get('/download', async (req, res, next) => {
    try { const file = await getDownloadFile(req.query.path); res.download(file.path, file.name, { maxAge: 0 }, (error) => { if (error && !res.headersSent) next(error) }) }
    catch (error) { if (error instanceof FilesRootUnavailableError) { res.status(503).json({ error: 'Files root unavailable' }); return } if (error instanceof FilePathError) { res.status(400).json({ error: error.message }); return } next(error) }
  })
  return router
}
