const VISITOR_KEY = 'chatbot_visitor_id';

export function getVisitorId() {
  return localStorage.getItem(VISITOR_KEY);
}

export function setVisitorId(id) {
  if (id) localStorage.setItem(VISITOR_KEY, id);
}

export function clearVisitorId() {
  localStorage.removeItem(VISITOR_KEY);
}

function normalizeApiBase(base) {
  const raw = String(base || '').trim();
  if (!raw) return '';
  // "/chat-api" — same-origin proxy
  if (raw.startsWith('/')) return raw.replace(/\/$/, '');
  // "192.168.x.x:8747" без схемы → браузер ходит на Luxms как на path
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
    return `http://${raw}`.replace(/\/$/, '');
  }
  return raw.replace(/\/$/, '');
}

function joinUrl(base, path) {
  const root = normalizeApiBase(base);
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${root}${suffix}`;
}

export function createApi(context, apiBase = '') {
  const request = async (path, options = {}) => {
    const url = joinUrl(apiBase, `/api${path}`);
    let res;
    try {
      res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
      });
    } catch (err) {
      throw new Error(
        `Не удалось связаться с API (${url}): ${err.message}. ` +
          `Проверьте apiBase и CORS_ORIGIN на сервере API.`,
      );
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  };

  const base = () => ({
    visitorId: getVisitorId(),
    login: context.login || null,
    fullname: context.fullname || null,
    firstname: context.firstname || null,
    dsNumber: context.dsNumber || null,
    dsName: context.dsName || null,
  });

  return {
    async session() {
      const data = await request('/session', {
        method: 'POST',
        body: JSON.stringify(base()),
      });
      setVisitorId(data.visitorId);
      return data;
    },
    getMessages(id) {
      return request(`/conversations/${id}/messages`);
    },
    sendMessage(id, text, sender = 'user') {
      return request(`/conversations/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ ...base(), text, sender }),
      });
    },
    openTicket(text) {
      return request('/support/tickets', {
        method: 'POST',
        body: JSON.stringify({ ...base(), text }),
      });
    },
    reports() {
      return request('/reports', {
        method: 'POST',
        body: JSON.stringify(base()),
      });
    },
    closeTicket(id) {
      return request(`/support/tickets/${id}/close`, { method: 'POST', body: '{}' });
    },
    history(status = 'closed') {
      return request('/support/history', {
        method: 'POST',
        body: JSON.stringify({ ...base(), status }),
      });
    },
    inbox(status = 'open') {
      return request(`/support/inbox?status=${status}`);
    },
  };
}
