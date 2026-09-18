import React, { useEffect, useRef, useState } from 'react';
import { createApi } from './api.js';
import { useBotEngine } from './bot/useBotEngine.js';

const BOT_NAME = 'КОРОБКО-КОТ';
const DEFAULT_BOT_AVATAR = '/korobko-kot.jpg';

/**
 * Embeddable chat widget.
 *
 * @param {object} props
 * @param {object} props.context — { login, fullname, firstname, dsNumber, dsName, actingAsSupport? }
 * @param {string} [props.apiBase] — origin API, e.g. https://chat-api.example.com (пусто = same origin /proxy)
 * @param {string} [props.avatarUrl] — URL аватара КОРОБКО-КОТ
 * @param {(v:boolean)=>void} [props.onSupportMode]
 */
export default function ChatWidget({
  context: contextProp,
  onSupportMode,
  apiBase = '',
  avatarUrl = DEFAULT_BOT_AVATAR,
}) {
  const context = contextProp || {};
  const api = createApi(context, apiBase);
  const BOT_AVATAR = avatarUrl;
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
  const [reports, setReports] = useState([]);
  const [activeReport, setActiveReport] = useState(null);

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
        const isDev =
          typeof import.meta !== 'undefined' &&
          import.meta.env &&
          import.meta.env.DEV;
        const delay = isDev ? Math.min(waitMs, 6000) : waitMs;
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
  }, [bot.timeline, bot.typing, messages, listItems, reports, activeReport, open]);

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
      if (choice.action === 'load_reports') {
        setBusy(true);
        const data = await api.reports();
        setReports(data.items || []);
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

  function pickReport(report) {
    bot.pushUser(report.name);
    setActiveReport(report);
    bot.go('report_view');
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
  const showReports = mode === 'reports_list';
  const showReportView = mode === 'report_view';

  return (
    <div className="chatbot-root">
      {toast && !open && (
        <button
          type="button"
          className="chat-toast"
          onClick={() => {
            setToast(null);
            setOpen(true);
          }}
        >
          <img src={BOT_AVATAR} alt="" className="chat-toast__avatar" />
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
        {open ? (
          <span className="chat-fab__close">×</span>
        ) : (
          <MessageCloudIcon />
        )}
      </button>

      {open && (
        <section className="chat-panel" aria-label="Чат КОРОБКО-КОТ">
          <header className="chat-panel__header">
            <div className="chat-panel__titles">
              {bot.canBack ? (
                <button type="button" className="chat-back" onClick={bot.back}>
                  ← Назад
                </button>
              ) : (
                <div className="chat-brand-row">
                  <img src={BOT_AVATAR} alt="" className="chat-brand-avatar" />
                  <span className="chat-brand">{BOT_NAME}</span>
                </div>
              )}
              <span className="chat-panel__sub">
                {session?.menu?.isSupport ? 'Режим поддержки' : 'Помощник BI'}
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
                <Bubble key={m.id} from={m.from} text={m.text} avatarUrl={BOT_AVATAR} />
              ))}
              {bot.typing && <TypingIndicator avatarUrl={BOT_AVATAR} />}
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
                    className={`chat-choice ${item.unanswered ? 'is-alert' : ''} ${item.isGuest ? 'is-guest' : ''}`}
                    disabled={busy}
                    onClick={() => pickListItem(item)}
                  >
                    <strong>
                      {item.fullname || (item.isGuest ? 'Гость' : 'Пользователь')}
                      {item.login ? ` – ${item.login}` : ''}
                      {item.dsName ? ` – ${item.dsName}` : ''}
                    </strong>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}

            {showReports && (
              <div className="chat-choices">
                {reports.length === 0 && (
                  <p className="chat-muted">Нет доступных отчётов</p>
                )}
                {reports.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="chat-choice"
                    disabled={busy}
                    onClick={() => pickReport(r)}
                  >
                    <strong>{r.name}</strong>
                    {r.code && <span>Код: {r.code}</span>}
                  </button>
                ))}
              </div>
            )}

            {showReportView && activeReport && (
              <ReportCard report={activeReport} />
            )}

            {(showLiveChat || showHistoryView) && (
              <div className="chat-live">
                <div className="chat-timeline chat-timeline--live">
                  {messages.map((m) => (
                    <Bubble
                      key={m.id}
                      from={
                        m.sender === 'support'
                          ? 'support'
                          : m.sender === 'bot'
                            ? 'bot'
                            : 'user'
                      }
                      text={m.text}
                      meta={liveMeta(m.sender, context.actingAsSupport)}
                      avatarUrl={BOT_AVATAR}
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
    </div>
  );
}

function MessageCloudIcon() {
  return (
    <svg className="chat-fab__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4.5 3.4c-.7.5-1.5 0-1.5-.8V6a2 2 0 0 1 2-2Zm2 4v2h12V8H6Zm0 4v2h8v-2H6Z"
      />
    </svg>
  );
}

function Avatar({ from, avatarUrl = DEFAULT_BOT_AVATAR }) {
  if (from === 'bot') {
    return <img src={avatarUrl} alt="" className="bubble-avatar bubble-avatar--bot" />;
  }
  if (from === 'support') {
    return (
      <span className="bubble-avatar bubble-avatar--support" aria-hidden="true">
        <HeadsetIcon />
      </span>
    );
  }
  return (
    <span className="bubble-avatar bubble-avatar--user" aria-hidden="true">
      <UserIcon />
    </span>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Zm0 2c-4 0-7.5 2-7.5 4.5V20h15v-1.5C19.5 16 16 14 12 14Z" />
    </svg>
  );
}

function HeadsetIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M12 3a8 8 0 0 0-8 8v5a3 3 0 0 0 3 3h1v-6H6v-2a6 6 0 1 1 12 0v2h-2v6h1a3 3 0 0 0 3-3v-5a8 8 0 0 0-8-8Z" />
    </svg>
  );
}

/** from: bot | support | user — не называть prop `role` (конфликт с HTML role в хостах вроде Luxms). */
function Bubble({ from, text, meta, avatarUrl }) {
  const who = from === 'bot' || from === 'support' || from === 'user' ? from : 'bot';
  const label =
    meta ||
    (who === 'bot' ? BOT_NAME : who === 'support' ? 'Поддержка' : 'Вы');

  return (
    <div className={`bubble-row bubble-row--${who}`}>
      {who !== 'user' && <Avatar from={who} avatarUrl={avatarUrl} />}
      <div className={`bubble bubble--${who}`}>
        <span className="bubble__meta">{label}</span>
        <p>{text}</p>
      </div>
      {who === 'user' && <Avatar from="user" />}
    </div>
  );
}

function TypingIndicator({ avatarUrl }) {
  return (
    <div className="bubble-row bubble-row--bot">
      <Avatar from="bot" avatarUrl={avatarUrl} />
      <div className="bubble bubble--bot bubble--typing" aria-label={`${BOT_NAME} печатает`}>
        <span />
        <span />
        <span />
      </div>
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

function ReportCard({ report }) {
  const pages = Array.isArray(report.pages) ? report.pages : [];
  const imageUrls = report.imageUrls?.length
    ? report.imageUrls
    : report.imageUrl
      ? [report.imageUrl]
      : [];

  return (
    <article className="report-card">
      {imageUrls.length > 0 && (
        <div className="report-card__gallery">
          {imageUrls.map((url) => (
            <img key={url} src={url} alt="" className="report-card__image" />
          ))}
        </div>
      )}
      <h3>{report.name}</h3>
      {report.code && <p className="chat-muted">Код: {report.code}</p>}
      {report.description && <p>{report.description}</p>}
      {report.dataSource || report.data_source ? (
        <p>
          <strong>Источник:</strong> {report.dataSource || report.data_source}
        </p>
      ) : null}
      {pages.length > 0 && (
        <div>
          <strong>Страницы:</strong>
          <ul className="report-card__pages">
            {pages.map((page) => (
              <li key={page}>{page}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function liveMeta(sender, actingAsSupport) {
  if (sender === 'support') return actingAsSupport ? 'Вы' : 'Поддержка';
  if (sender === 'bot') return BOT_NAME;
  return actingAsSupport ? 'Пользователь' : 'Вы';
}
