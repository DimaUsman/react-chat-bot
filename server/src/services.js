import { query } from './db.js';
import { config } from './config.js';

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export async function ensureVisitor(visitorId) {
  const expiresAt = addDays(config.visitorTtlDays);

  if (visitorId) {
    const existing = await query(
      `UPDATE visitors SET expires_at = GREATEST(expires_at, $2)
       WHERE id = $1
       RETURNING id, linked_user_id, expires_at`,
      [visitorId, expiresAt],
    );
    if (existing.rows[0]) return existing.rows[0];
  }

  const created = await query(
    `INSERT INTO visitors (expires_at) VALUES ($1)
     RETURNING id, linked_user_id, expires_at`,
    [expiresAt],
  );
  return created.rows[0];
}

export async function upsertUser({ login, fullname, firstname, forceSupport }) {
  if (!login) return null;

  const role = forceSupport || config.supportLogins.includes(login)
    ? 'support'
    : 'user';

  const result = await query(
    `INSERT INTO users (login, fullname, firstname, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (login) DO UPDATE SET
       fullname = COALESCE(EXCLUDED.fullname, users.fullname),
       firstname = COALESCE(EXCLUDED.firstname, users.firstname),
       role = CASE
         WHEN users.role = 'support' OR EXCLUDED.role = 'support' THEN 'support'
         ELSE users.role
       END
     RETURNING id, login, fullname, firstname, role`,
    [login, fullname || null, firstname || null, role],
  );
  return result.rows[0];
}

export async function linkVisitorToUser(visitorId, userId) {
  await query(
    `UPDATE visitors SET linked_user_id = $2 WHERE id = $1`,
    [visitorId, userId],
  );
  await query(
    `UPDATE conversations SET user_id = $2
     WHERE visitor_id = $1 AND user_id IS NULL`,
    [visitorId, userId],
  );
}

export async function resolveIdentity({ visitorId, login, fullname, firstname }) {
  const visitor = await ensureVisitor(visitorId);
  const user = login
    ? await upsertUser({ login, fullname, firstname })
    : null;

  // Не привязываем гостевые тикеты к аккаунтам support/admin —
  // иначе обращения гостей «пропадают» из нормального вида inbox
  // и переписываются на сотрудника при общем visitorId в браузере.
  if (user && user.role === 'user') {
    await linkVisitorToUser(visitor.id, user.id);
  }

  return { visitor, user };
}

export function buildWelcome({ user, openSupport, lastSupportSender, supportQueue }) {
  if (user?.role === 'support') {
    if (supportQueue.unanswered > 0) {
      return {
        welcomeMsg: 'Есть неотвеченные запросы',
        waitingTimeSec: 3,
      };
    }
    if (supportQueue.open > 0) {
      return {
        welcomeMsg: 'Есть активные чаты',
        waitingTimeSec: 8,
      };
    }
    return {
      welcomeMsg: 'Все запросы решены',
      waitingTimeSec: 120,
    };
  }

  if (!user) {
    return {
      welcomeMsg: 'Есть проблемы с авторизацией?',
      waitingTimeSec: 120,
    };
  }

  if (openSupport && lastSupportSender === 'support') {
    return {
      welcomeMsg: 'У вас есть ответы от поддержки',
      waitingTimeSec: 5,
    };
  }

  const name = user.firstname || user.fullname || user.login;
  return {
    welcomeMsg: `Есть вопросы, ${name}?`,
    waitingTimeSec: 120,
  };
}

export async function getSupportQueueStats() {
  const result = await query(`
    WITH last_msg AS (
      SELECT DISTINCT ON (m.conversation_id)
        m.conversation_id,
        m.sender
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.kind = 'support' AND c.status = 'open'
      ORDER BY m.conversation_id, m.created_at DESC
    )
    SELECT
      COUNT(*)::int AS open,
      COUNT(*) FILTER (WHERE lm.sender = 'user')::int AS unanswered
    FROM conversations c
    LEFT JOIN last_msg lm ON lm.conversation_id = c.id
    WHERE c.kind = 'support' AND c.status = 'open'
  `);
  return result.rows[0] || { open: 0, unanswered: 0 };
}

export async function getOpenSupportForIdentity({ visitorId, userId }) {
  const result = await query(
    `SELECT c.*,
      (
        SELECT m.sender FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC LIMIT 1
      ) AS last_sender
     FROM conversations c
     WHERE c.kind = 'support' AND c.status = 'open'
       AND (
         ($1::uuid IS NOT NULL AND c.visitor_id = $1)
         OR ($2::uuid IS NOT NULL AND c.user_id = $2)
       )
     ORDER BY c.last_message_at DESC
     LIMIT 1`,
    [visitorId || null, userId || null],
  );
  return result.rows[0] || null;
}

export async function listMessages(conversationId) {
  const result = await query(
    `SELECT id, conversation_id, sender, text, created_at
     FROM messages WHERE conversation_id = $1
     ORDER BY created_at ASC`,
    [conversationId],
  );
  return result.rows;
}

export async function addMessage(conversationId, sender, text) {
  const msg = await query(
    `INSERT INTO messages (conversation_id, sender, text)
     VALUES ($1, $2, $3)
     RETURNING id, conversation_id, sender, text, created_at`,
    [conversationId, sender, text],
  );
  await query(
    `UPDATE conversations SET last_message_at = now() WHERE id = $1`,
    [conversationId],
  );
  return msg.rows[0];
}

export async function createSupportConversation({
  visitorId,
  userId,
  dsNumber,
  dsName,
  firstMessage,
}) {
  const title = firstMessage?.slice(0, 80) || 'Обращение';
  const conv = await query(
    `INSERT INTO conversations
      (visitor_id, user_id, kind, status, ds_number, ds_name, title)
     VALUES ($1, $2, 'support', 'open', $3, $4, $5)
     RETURNING *`,
    [visitorId || null, userId || null, dsNumber || null, dsName || null, title],
  );
  const conversation = conv.rows[0];
  const message = await addMessage(conversation.id, 'user', firstMessage);
  return { conversation, message };
}

export async function closeConversation(id) {
  const result = await query(
    `UPDATE conversations SET status = 'closed' WHERE id = $1 RETURNING *`,
    [id],
  );
  return result.rows[0];
}

export async function getConversation(id) {
  const result = await query(`SELECT * FROM conversations WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

export async function listUserSupportHistory({ visitorId, userId, status }) {
  const result = await query(
    `SELECT c.*,
      (
        SELECT m.text FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at ASC LIMIT 1
      ) AS first_message,
      (
        SELECT m.sender FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC LIMIT 1
      ) AS last_sender
     FROM conversations c
     WHERE c.kind = 'support'
       AND ($3::text IS NULL OR c.status = $3)
       AND (
         ($1::uuid IS NOT NULL AND c.visitor_id = $1)
         OR ($2::uuid IS NOT NULL AND c.user_id = $2)
       )
     ORDER BY c.last_message_at DESC`,
    [visitorId || null, userId || null, status || null],
  );
  return result.rows;
}

export async function listSupportInbox({ status = 'open' }) {
  const result = await query(
    `SELECT c.*,
      u.fullname, u.login, u.firstname,
      (
        SELECT m.text FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at ASC LIMIT 1
      ) AS first_message,
      (
        SELECT m.sender FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC LIMIT 1
      ) AS last_sender
     FROM conversations c
     LEFT JOIN users u ON u.id = c.user_id
     WHERE c.kind = 'support' AND c.status = $1
     ORDER BY c.last_message_at DESC`,
    [status],
  );
  return result.rows;
}
