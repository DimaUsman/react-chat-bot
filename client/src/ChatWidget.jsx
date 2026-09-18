import { useEffect, useRef, useState } from 'react';
import { createApi } from './api.js';
import { useBotEngine } from './bot/useBotEngine.js';

export default function ChatWidget({ context, onSupportMode }) {
  const api = createApi(context);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const [messages, setMessages] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [listItems, setListItems] = useState([]);

  const toastTimer = useRef(null);
  const pollRef = useRef(null);
  const scrollerRef = useRef(null);

  const bot = useBotEngine({ session, context, ready });

  async function refreshSession() {
    const data = await api.session();
    setSession(data);
    return data;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setReady(false);
        const data = await refreshSession();
        if (cancelled) return;
        setReady(true);
        clearTimeout(toastTimer.current);
        const waitMs = (data.welcome?.waitingTimeSec ?? 120) * 1000;
        const delay = import.meta.env.DEV ? Math.min(waitMs, 6000) : waitMs;
        toastTimer.current = setTimeout(() => {
          setToast(data.welcome?.welcomeMsg);
        }, delay);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(toastTimer.current);
    };
  }, [context.login, context.dsNumber, context.firstname]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bot.timeline, bot.typing, messages, listItems, open]);

  const mode = bot.step?.mode;

  useEffect(() => {
    if (!open || mode !== 'support_chat' || !conversation?.id || conversation.status === 'closed') {
      clearInterval(pollRef.current);
      return undefined;
    }
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.getMessages(conversation.id);
        setMessages(data.messages);
        setConversation(data.conversation);
      } catch {
        /* ignore */
      }
    }, 4000);
    return () => clearInterval(pollRef.current);
  }, [open, mode, conversation?.id, conversation?.status]);

  async function handleChoice(choice) {
    setError('');
    try {
      if (choice.action === 'load_history') {
        setBusy(true);
        const data = await api.history('closed');
        setListItems(data.items);
        bot.go(choice.next, { userLabel: choice.label });
        return;
      }
      if (choice.action === 'load_inbox') {
        setBusy(true);
        onSupportMode?.(true);
        const data = await api.inbox('open');
        setListItems(data.items);
        bot.go(choice.next, { userLabel: choice.label });
        return;
      }
      if (choice.action === 'load_support_history') {
        setBusy(true);
        onSupportMode?.(true);
        const data = await api.inbox('closed');
        setListItems(data.items);
        bot.go(choice.next, { userLabel: choice.label });
        return;
      }
      if (choice.action === 'open_support') {
        setBusy(true);
        onSupportMode?.(false);
        await openSupportThread();
        bot.go(choice.next, { userLabel: choice.label });
        return;
      }
      bot.go(choice.next, { userLabel: choice.label });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function openSupportThread(existingId) {
    let id = existingId || session?.openSupportConversationId;
    if (!id) {
      const created = await api.openTicket(
        context.dsNumber
          ? `Нужна помощь по отчёту ${context.dsName || context.dsNumber}`
          : 'Здравствуйте, нужна помощь',
      );
      id = created.conversation.id;
    }
    const data = await api.getMessages(id);
    setConversation(data.conversation);
    setMessages(data.messages);
    await refreshSession();
  }

  async function submitCompose() {
    if (!draft.trim()) return;
    const text = draft.trim();
    setDraft('');
    setBusy(true);
    setError('');
    try {
      bot.pushUser(text);
      onSupportMode?.(false);
      const created = await api.openTicket(text);
      const data = await api.getMessages(created.conversation.id);
      setConversation(data.conversation);
      setMessages(data.messages);
      await refreshSession();
      bot.go('support_live');
    } catch (e) {
      setError(e.message);
      setDraft(text);
    } finally {
      setBusy(false);
    }
  }

  async function sendLive() {
    if (!draft.trim() || !conversation) return;
    const text = draft.trim();
    setDraft('');
    setBusy(true);
    try {
      const sender = context.actingAsSupport ? 'support' : 'user';
      await api.sendMessage(conversation.id, text, sender);
      const data = await api.getMessages(conversation.id);
      setMessages(data.messages);
      setConversation(data.conversation);
      await refreshSession();
    } catch (e) {
      setError(e.message);
      setDraft(text);
    } finally {
      setBusy(false);
    }
  }

  async function closeTicket() {
    if (!conversation) return;
    setBusy(true);
    try {
      await api.closeTicket(conversation.id);
      await refreshSession();
      setConversation(null);
      setMessages([]);
      bot.resetToRoot();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function pickListItem(item) {
    setBusy(true);
    setError('');
    try {
      bot.pushUser(item.label);
      const data = await api.getMessages(item.id);
      setConversation(data.conversation);
      setMessages(data.messages);

      if (mode === 'history_list') {
        bot.go('history_view');
      } else if (mode === 'support_inbox') {
        onSupportMode?.(true);
        bot.go('support_chat');
      } else if (mode === 'support_history_list') {
        bot.go('history_view');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const showChoices =
    bot.step?.choices?.length > 0 &&
    !bot.typing &&
    !mode;

  const showCompose = bot.step?.input && !bot.typing && mode == null;
  const showLiveChat = mode === 'support_chat';
  const showHistoryView = mode === 'history_view';
  const showList =
    mode === 'history_list' ||
    mode === 'support_inbox' ||
    mode === 'support_history_list';

  return (
    <>
      {toast && !open && (
        <button
          type="button"
          className="chat-toast"
          onClick={() => {
            setToast(null);
            setOpen(true);
          }}
        >
          <span className="chat-toast__dot" />
          {toast}
        </button>
      )}

      <button
        type="button"
        className={`chat-fab ${open ? 'is-open' : ''}`}
        aria-label={open ? 'Закрыть чат' : 'Открыть чат'}
        onClick={() => {
          setOpen((v) => !v);
          setToast(null);
        }}
      >
        {open ? '×' : '?'}
      </button>

      {open && (
        <section className="chat-panel" aria-label="Чат-бот поддержки">
          <header className="chat-panel__header">
            <div className="chat-panel__titles">
              {bot.canBack ? (
                <button type="button" className="chat-back" onClick={bot.back}>
                  ← Назад
                </button>
              ) : (
                <span className="chat-brand">BI Support</span>
              )}
              <span className="chat-panel__sub">
                {session?.menu?.isSupport ? 'Режим поддержки' : 'Чат-бот'}
              </span>
            </div>
            <button type="button" className="chat-close" onClick={() => setOpen(false)}>
              ✕
            </button>
          </header>

          <div className="chat-panel__body" ref={scrollerRef}>
            {error && <p className="chat-error">{error}</p>}

            <div className="chat-timeline">
              {bot.timeline.map((m) => (
                <Bubble key={m.id} role={m.role} text={m.text} />
              ))}
              {bot.typing && <TypingIndicator />}
            </div>

            {showChoices && (
              <div className="chat-choices">
                {bot.step.choices.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="chat-choice"
                    disabled={busy}
                    onClick={() => handleChoice(c)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {showCompose && (
              <Composer
                draft={draft}
                setDraft={setDraft}
                onSubmit={submitCompose}
                placeholder={bot.step.input.placeholder}
                disabled={busy}
              />
            )}

            {showList && (
              <div className="chat-choices">
                {listItems.length === 0 && (
                  <p className="chat-muted">Пока пусто</p>
                )}
                {listItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`chat-choice ${item.unanswered ? 'is-alert' : ''}`}
                    disabled={busy}
                    onClick={() => pickListItem(item)}
                  >
                    {item.fullname && (
                      <strong>
                        {item.fullname} – {item.login}
                        {item.dsName ? ` – ${item.dsName}` : ''}
                      </strong>
                    )}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}

            {(showLiveChat || showHistoryView) && (
              <div className="chat-live">
                <div className="chat-timeline chat-timeline--live">
                  {messages.map((m) => (
                    <Bubble
                      key={m.id}
                      role={m.sender === 'support' ? 'support' : m.sender === 'bot' ? 'bot' : 'user'}
                      text={m.text}
                      meta={liveMeta(m.sender, context.actingAsSupport)}
                    />
                  ))}
                </div>

                {showLiveChat && conversation?.status === 'open' && (
                  <>
                    <Composer
                      draft={draft}
                      setDraft={setDraft}
                      onSubmit={sendLive}
                      placeholder={
                        context.actingAsSupport
                          ? 'Ответ поддержки…'
                          : 'Сообщение в поддержку…'
                      }
                      disabled={busy}
                    />
                    <button
                      type="button"
                      className="chat-choice chat-choice--ghost"
                      onClick={closeTicket}
                      disabled={busy}
                    >
                      Закрыть обращение
                    </button>
                  </>
                )}

                {(showHistoryView || conversation?.status === 'closed') && (
                  <p className="chat-muted">Обращение закрыто — только просмотр</p>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}

function Bubble({ role, text, meta }) {
  return (
    <div className={`bubble bubble--${role}`}>
      {(meta || role === 'bot' || role === 'support') && (
        <span className="bubble__meta">
          {meta || (role === 'bot' ? 'Бот' : role === 'support' ? 'Поддержка' : '')}
        </span>
      )}
      <p>{text}</p>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="bubble bubble--bot bubble--typing" aria-label="Бот печатает">
      <span />
      <span />
      <span />
    </div>
  );
}

function Composer({ draft, setDraft, onSubmit, placeholder, disabled }) {
  return (
    <form
      className="chat-composer"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      <button type="submit" disabled={disabled || !draft.trim()} aria-label="Отправить">
        →
      </button>
    </form>
  );
}

function liveMeta(sender, actingAsSupport) {
  if (sender === 'support') return actingAsSupport ? 'Вы' : 'Поддержка';
  if (sender === 'bot') return 'Бот';
  return actingAsSupport ? 'Пользователь' : 'Вы';
}
