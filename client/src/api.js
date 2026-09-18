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

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export function createApi(context) {
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
        body: JSON.stringify({ text, sender }),
      });
    },
    openTicket(text) {
      return request('/support/tickets', {
        method: 'POST',
        body: JSON.stringify({ ...base(), text }),
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
