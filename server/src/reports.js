import { query } from './db.js';

function normalizeImagePaths(row) {
  let paths = Array.isArray(row.image_paths) ? row.image_paths.filter(Boolean) : [];
  if (paths.length === 0 && row.image_path) paths = [row.image_path];
  return paths;
}

function mapReport(row, uploadsBase = '') {
  if (!row) return null;
  const paths = normalizeImagePaths(row);
  const toUrl = (p) => {
    if (!p) return null;
    if (p.startsWith('http')) return p;
    return `${uploadsBase}${p}`;
  };
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    dataSource: row.data_source,
    pages: row.pages || [],
    imagePaths: paths,
    imageUrls: paths.map(toUrl).filter(Boolean),
    imagePath: paths[0] || null,
    imageUrl: toUrl(paths[0] || null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listReportsForLogin(login) {
  if (!login) return [];
  const result = await query(
    `SELECT DISTINCT r.*
     FROM reports r
     JOIN group_report_access gra ON gra.report_id = r.id
     JOIN user_groups ug ON ug.group_id = gra.group_id
     JOIN users u ON u.id = ug.user_id
     WHERE u.login = $1
     ORDER BY r.name ASC`,
    [login],
  );
  return result.rows.map((row) => mapReport(row));
}

export async function listAllReports() {
  const result = await query(`SELECT * FROM reports ORDER BY name ASC`);
  return result.rows.map((row) => mapReport(row));
}

export async function getReport(id) {
  const result = await query(`SELECT * FROM reports WHERE id = $1`, [id]);
  return mapReport(result.rows[0]);
}

export async function createReport({
  name,
  code,
  description,
  dataSource,
  pages,
  imagePaths = [],
}) {
  const paths = imagePaths.filter(Boolean);
  const result = await query(
    `INSERT INTO reports (name, code, description, data_source, pages, image_path, image_paths)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)
     RETURNING *`,
    [
      name,
      code || null,
      description || null,
      dataSource || null,
      JSON.stringify(pages || []),
      paths[0] || null,
      JSON.stringify(paths),
    ],
  );
  return mapReport(result.rows[0]);
}

export async function updateReport(id, fields) {
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
      id,
      fields.name ?? null,
      fields.code ?? null,
      fields.description ?? null,
      fields.dataSource ?? null,
      fields.pages != null ? JSON.stringify(fields.pages) : null,
      fields.imagePaths?.[0] ?? fields.imagePath ?? null,
      fields.imagePaths != null ? JSON.stringify(fields.imagePaths) : null,
    ],
  );
  return mapReport(result.rows[0]);
}

export async function deleteReport(id) {
  await query(`DELETE FROM reports WHERE id = $1`, [id]);
}

export async function listGroups() {
  const result = await query(
    `SELECT g.*,
      (SELECT COUNT(*)::int FROM user_groups ug WHERE ug.group_id = g.id) AS users_count,
      (SELECT COUNT(*)::int FROM group_report_access gra WHERE gra.group_id = g.id) AS reports_count
     FROM groups g
     ORDER BY g.name`,
  );
  return result.rows;
}

export async function createGroup({ name, description }) {
  const result = await query(
    `INSERT INTO groups (name, description) VALUES ($1, $2) RETURNING *`,
    [name, description || null],
  );
  return result.rows[0];
}

export async function deleteGroup(id) {
  await query(`DELETE FROM groups WHERE id = $1`, [id]);
}

export async function listUsers() {
  const result = await query(
    `SELECT u.*,
      COALESCE(
        (SELECT json_agg(json_build_object('id', g.id, 'name', g.name) ORDER BY g.name)
         FROM user_groups ug
         JOIN groups g ON g.id = ug.group_id
         WHERE ug.user_id = u.id),
        '[]'::json
      ) AS groups
     FROM users u
     ORDER BY u.login`,
  );
  return result.rows;
}

export async function upsertManagedUser({ login, fullname, firstname, role }) {
  const safeRole = ['user', 'support', 'admin'].includes(role) ? role : 'user';
  const result = await query(
    `INSERT INTO users (login, fullname, firstname, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (login) DO UPDATE SET
       fullname = COALESCE(EXCLUDED.fullname, users.fullname),
       firstname = COALESCE(EXCLUDED.firstname, users.firstname),
       role = EXCLUDED.role
     RETURNING *`,
    [login, fullname || null, firstname || null, safeRole],
  );
  return result.rows[0];
}

export async function setUserGroups(userId, groupIds = []) {
  await query(`DELETE FROM user_groups WHERE user_id = $1`, [userId]);
  for (const groupId of groupIds) {
    await query(
      `INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, groupId],
    );
  }
}

export async function setGroupReports(groupId, reportIds = []) {
  await query(`DELETE FROM group_report_access WHERE group_id = $1`, [groupId]);
  for (const reportId of reportIds) {
    await query(
      `INSERT INTO group_report_access (group_id, report_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [groupId, reportId],
    );
  }
}

export async function getGroupReportIds(groupId) {
  const result = await query(
    `SELECT report_id FROM group_report_access WHERE group_id = $1`,
    [groupId],
  );
  return result.rows.map((r) => r.report_id);
}
