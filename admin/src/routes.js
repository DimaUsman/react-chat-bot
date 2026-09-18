import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { query } from './db.js';
import { config } from './config.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-а-яА-ЯёЁ]+/g, '_');
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 20 },
});

function toPublicUrl(imagePath) {
  if (!imagePath) return null;
  if (imagePath.startsWith('http')) return imagePath;
  return `${config.publicUrl}${imagePath}`;
}

function mapReport(row) {
  let paths = Array.isArray(row.image_paths) ? row.image_paths : [];
  if ((!paths || paths.length === 0) && row.image_path) {
    paths = [row.image_path];
  }
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    dataSource: row.data_source,
    pages: row.pages || [],
    imagePaths: paths,
    imageUrls: paths.map(toPublicUrl).filter(Boolean),
    imagePath: paths[0] || row.image_path || null,
    imageUrl: toPublicUrl(paths[0] || row.image_path || null),
  };
}

async function setUserGroups(userId, groupIds = []) {
  await query(`DELETE FROM user_groups WHERE user_id = $1`, [userId]);
  for (const gid of groupIds) {
    await query(
      `INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, gid],
    );
  }
}

async function setGroupReports(groupId, reportIds = []) {
  await query(`DELETE FROM group_report_access WHERE group_id = $1`, [groupId]);
  for (const rid of reportIds) {
    await query(
      `INSERT INTO group_report_access (group_id, report_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [groupId, rid],
    );
  }
}

async function setGroupUsers(groupId, userIds = []) {
  await query(`DELETE FROM user_groups WHERE group_id = $1`, [groupId]);
  for (const uid of userIds) {
    await query(
      `INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [uid, groupId],
    );
  }
}

router.get('/users', async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT u.*,
        COALESCE(
          (SELECT json_agg(g.id) FROM user_groups ug JOIN groups g ON g.id = ug.group_id WHERE ug.user_id = u.id),
          '[]'::json
        ) AS group_ids
       FROM users u ORDER BY u.login`,
    );
    res.json({ items: result.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/users', async (req, res, next) => {
  try {
    const { login, fullname, firstname, role = 'user', groupIds = [] } = req.body;
    if (!login?.trim()) return res.status(400).json({ error: 'login required' });
    const safeRole = ['user', 'support', 'admin'].includes(role) ? role : 'user';
    const user = await query(
      `INSERT INTO users (login, fullname, firstname, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (login) DO UPDATE SET
         fullname = COALESCE(EXCLUDED.fullname, users.fullname),
         firstname = COALESCE(EXCLUDED.firstname, users.firstname),
         role = EXCLUDED.role
       RETURNING *`,
      [login.trim(), fullname || null, firstname || null, safeRole],
    );
    await setUserGroups(user.rows[0].id, groupIds);
    res.status(201).json({ user: user.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.put('/users/:id', async (req, res, next) => {
  try {
    const { login, fullname, firstname, role = 'user', groupIds = [] } = req.body;
    if (!login?.trim()) return res.status(400).json({ error: 'login required' });
    const safeRole = ['user', 'support', 'admin'].includes(role) ? role : 'user';
    const result = await query(
      `UPDATE users SET
         login = $2,
         fullname = $3,
         firstname = $4,
         role = $5
       WHERE id = $1
       RETURNING *`,
      [req.params.id, login.trim(), fullname || null, firstname || null, safeRole],
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    await setUserGroups(result.rows[0].id, groupIds);
    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    await query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/groups', async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT g.*,
        COALESCE(
          (SELECT json_agg(gra.report_id) FROM group_report_access gra WHERE gra.group_id = g.id),
          '[]'::json
        ) AS report_ids,
        COALESCE(
          (SELECT json_agg(ug.user_id) FROM user_groups ug WHERE ug.group_id = g.id),
          '[]'::json
        ) AS user_ids,
        (SELECT COUNT(*)::int FROM user_groups ug WHERE ug.group_id = g.id) AS users_count
       FROM groups g ORDER BY g.name`,
    );
    res.json({ items: result.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/groups', async (req, res, next) => {
  try {
    const { name, description, reportIds = [], userIds = [] } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });

    // Всегда создаём новую группу (не upsert) — иначе «пропадает» старая при совпадении имени
    const group = await query(
      `INSERT INTO groups (name, description) VALUES ($1, $2) RETURNING *`,
      [name.trim(), description || null],
    );
    const groupId = group.rows[0].id;
    await setGroupReports(groupId, reportIds);
    await setGroupUsers(groupId, userIds);
    res.status(201).json({ group: group.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Группа с таким именем уже есть' });
    }
    next(err);
  }
});

router.put('/groups/:id', async (req, res, next) => {
  try {
    const { name, description, reportIds = [], userIds = [] } = req.body;
    const groupId = req.params.id;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });

    const updated = await query(
      `UPDATE groups SET name = $2, description = $3 WHERE id = $1 RETURNING *`,
      [groupId, name.trim(), description || null],
    );
    if (!updated.rows[0]) return res.status(404).json({ error: 'Not found' });

    await setGroupReports(groupId, reportIds);
    await setGroupUsers(groupId, userIds);
    res.json({ group: updated.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Группа с таким именем уже есть' });
    }
    next(err);
  }
});

router.delete('/groups/:id', async (req, res, next) => {
  try {
    await query(`DELETE FROM groups WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/reports', async (_req, res, next) => {
  try {
    const result = await query(`SELECT * FROM reports ORDER BY name`);
    res.json({ items: result.rows.map(mapReport) });
  } catch (err) {
    next(err);
  }
});

router.post('/reports', upload.array('images', 20), async (req, res, next) => {
  try {
    const name = req.body.name?.trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    const pages = String(req.body.pages || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const files = req.files || [];
    const imagePaths = files.map((f) => `/uploads/${f.filename}`);
    const result = await query(
      `INSERT INTO reports (name, code, description, data_source, pages, image_path, image_paths)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)
       RETURNING *`,
      [
        name,
        req.body.code || null,
        req.body.description || null,
        req.body.dataSource || null,
        JSON.stringify(pages),
        imagePaths[0] || null,
        JSON.stringify(imagePaths),
      ],
    );
    res.status(201).json({ report: mapReport(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.put('/reports/:id', upload.array('images', 20), async (req, res, next) => {
  try {
    const pages = req.body.pages != null
      ? String(req.body.pages)
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
      : null;
    const files = req.files || [];
    const newPaths = files.map((f) => `/uploads/${f.filename}`);

    let imagePaths = null;
    if (newPaths.length > 0) {
      const current = await query(`SELECT image_paths, image_path FROM reports WHERE id = $1`, [
        req.params.id,
      ]);
      const row = current.rows[0];
      if (!row) return res.status(404).json({ error: 'Not found' });
      const existing = Array.isArray(row.image_paths) && row.image_paths.length
        ? row.image_paths
        : row.image_path
          ? [row.image_path]
          : [];
      imagePaths = [...existing, ...newPaths];
    }

    const result = await query(
      `UPDATE reports SET
         name = COALESCE($2, name),
         code = COALESCE($3, code),
         description = COALESCE($4, description),
         data_source = COALESCE($5, data_source),
         pages = COALESCE($6::jsonb, pages),
         image_path = COALESCE($7, image_path),
         image_paths = COALESCE($8::jsonb, image_paths),
         updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        req.params.id,
        req.body.name || null,
        req.body.code || null,
        req.body.description || null,
        req.body.dataSource || null,
        pages ? JSON.stringify(pages) : null,
        imagePaths?.[0] || null,
        imagePaths ? JSON.stringify(imagePaths) : null,
      ],
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ report: mapReport(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.delete('/reports/:id', async (req, res, next) => {
  try {
    await query(`DELETE FROM reports WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
