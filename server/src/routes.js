import { Router } from 'express';
import {
  resolveIdentity,
  buildWelcome,
  getSupportQueueStats,
  getOpenSupportForIdentity,
  listMessages,
  addMessage,
  createSupportConversation,
  closeConversation,
  getConversation,
  listUserSupportHistory,
  listSupportInbox,
} from './services.js';

const router = Router();

function sessionFromBody(body = {}) {
  return {
    visitorId: body.visitorId || null,
    login: body.login || null,
    fullname: body.fullname || null,
    firstname: body.firstname || null,
    dsNumber: body.dsNumber || null,
    dsName: body.dsName || null,
  };
}

router.get('/health', (_req, res) => {
  res.json({ ok: true });
});

router.post('/session', async (req, res, next) => {
  try {
    const input = sessionFromBody(req.body);
    const { visitor, user } = await resolveIdentity(input);
    const openSupport = await getOpenSupportForIdentity({
      visitorId: visitor.id,
      userId: user?.id,
    });
    const supportQueue = user?.role === 'support'
      ? await getSupportQueueStats()
      : { open: 0, unanswered: 0 };

    const welcome = buildWelcome({
      user,
      openSupport,
      lastSupportSender: openSupport?.last_sender,
      supportQueue,
    });

    res.json({
      visitorId: visitor.id,
      expiresAt: visitor.expires_at,
      user,
      openSupportConversationId: openSupport?.id || null,
      welcome,
      menu: {
        canViewReports: Boolean(user),
        hasOpenSupport: Boolean(openSupport),
        isSupport: user?.role === 'support',
      },
      context: {
        dsNumber: input.dsNumber,
        dsName: input.dsName,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/conversations/:id/messages', async (req, res, next) => {
  try {
    const conversation = await getConversation(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Not found' });
    const messages = await listMessages(conversation.id);
    res.json({ conversation, messages });
  } catch (err) {
    next(err);
  }
});

router.post('/conversations/:id/messages', async (req, res, next) => {
  try {
    const { text, sender = 'user' } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'text required' });

    const conversation = await getConversation(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Not found' });
    if (conversation.status === 'closed') {
      return res.status(400).json({ error: 'Conversation closed' });
    }
    if (!['user', 'support', 'bot'].includes(sender)) {
      return res.status(400).json({ error: 'Invalid sender' });
    }

    const message = await addMessage(conversation.id, sender, text.trim());
    res.status(201).json({ message });
  } catch (err) {
    next(err);
  }
});

router.post('/support/tickets', async (req, res, next) => {
  try {
    const input = sessionFromBody(req.body);
    const text = req.body.text?.trim();
    if (!text) return res.status(400).json({ error: 'text required' });

    const { visitor, user } = await resolveIdentity(input);
    const existing = await getOpenSupportForIdentity({
      visitorId: visitor.id,
      userId: user?.id,
    });
    if (existing) {
      const message = await addMessage(existing.id, 'user', text);
      return res.json({ conversation: existing, message, reused: true });
    }

    const created = await createSupportConversation({
      visitorId: visitor.id,
      userId: user?.id,
      dsNumber: input.dsNumber,
      dsName: input.dsName,
      firstMessage: text,
    });
    res.status(201).json({ ...created, reused: false });
  } catch (err) {
    next(err);
  }
});

router.post('/support/tickets/:id/close', async (req, res, next) => {
  try {
    const conversation = await closeConversation(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Not found' });
    res.json({ conversation });
  } catch (err) {
    next(err);
  }
});

router.post('/support/history', async (req, res, next) => {
  try {
    const input = sessionFromBody(req.body);
    const { visitor, user } = await resolveIdentity(input);
    const items = await listUserSupportHistory({
      visitorId: visitor.id,
      userId: user?.id,
      status: req.body.status || 'closed',
    });
    res.json({
      visitorId: visitor.id,
      items: items.map(formatTicketLabel),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/support/inbox', async (req, res, next) => {
  try {
    const status = req.query.status === 'closed' ? 'closed' : 'open';
    const items = await listSupportInbox({ status });
    res.json({
      items: items.map((row) => ({
        ...formatTicketLabel(row),
        unanswered: row.last_sender === 'user' && row.status === 'open',
        fullname: row.fullname,
        login: row.login,
      })),
    });
  } catch (err) {
    next(err);
  }
});

function formatTicketLabel(row) {
  const date = new Date(row.created_at).toLocaleString('ru-RU');
  const parts = [
    row.first_message || row.title || 'Обращение',
    row.ds_name || null,
    date,
  ].filter(Boolean);

  return {
    id: row.id,
    status: row.status,
    dsNumber: row.ds_number,
    dsName: row.ds_name,
    title: row.title,
    firstMessage: row.first_message,
    lastSender: row.last_sender,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    label: parts.join(' – '),
  };
}

export default router;
