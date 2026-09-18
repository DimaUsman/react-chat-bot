import { config } from './config.js';

/**
 * Notify support via Pachca incoming webhook.
 * Default payload field is `message` (markdown). Structured fields are also
 * sent so a Liquid/Mustache template on the bot can use them if configured.
 */
export async function notifyPachcaSupport({
  intro,
  context,
  nameInfo,
  additionalInfo,
}) {
  const url = config.pachcaWebhookUrl;
  if (!url) {
    console.warn('[pachca] PACHCA_WEBHOOK_URL is not set — skip notify');
    return { ok: false, skipped: true };
  }

  const message = [
    '🛠️**Сервис** - `Luxms BI`',
    intro,
    `**${context}**`,
    `👤 ${nameInfo}`,
    '',
    '**Дополнительная информация:**',
    '```text',
    additionalInfo,
    '```',
  ].join('\n');

  const body = {
    message,
    intro,
    context,
    name_info: nameInfo,
    additional_info: additionalInfo,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[pachca] webhook failed', res.status, text);
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch (err) {
    console.error('[pachca] webhook error', err.message);
    return { ok: false, error: err.message };
  }
}

export function buildSupportNotifyPayload({
  user,
  input,
  text,
  conversationId,
  isNew,
}) {
  const fullname = user?.fullname || input.fullname;
  const firstname = user?.firstname || input.firstname;
  const login = user?.login || input.login;

  let nameInfo = 'Гость (без авторизации)';
  if (login || fullname || firstname) {
    const display = fullname || firstname || login;
    nameInfo = login ? `${display} · \`${login}\`` : display;
  }

  const ds =
    input.dsName || input.dsNumber
      ? [input.dsName, input.dsNumber && `№ ${input.dsNumber}`]
          .filter(Boolean)
          .join(' · ')
      : null;

  const context = ds
    ? `Отчёт: ${ds}`
    : isNew
      ? 'Новое обращение в чат-боте'
      : 'Сообщение в открытом обращении';

  const intro = isNew
    ? '📩 Новое обращение от пользователя'
    : '💬 Новое сообщение в обращении';

  const additionalInfo = [
    text,
    '',
    `ticket_id: ${conversationId}`,
    input.visitorId ? `visitor_id: ${input.visitorId}` : null,
    login ? `login: ${login}` : null,
    ds ? `report: ${ds}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return { intro, context, nameInfo, additionalInfo };
}
