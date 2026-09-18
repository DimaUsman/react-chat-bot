import { useMemo, useState } from 'react';
import ChatWidget from './ChatWidget.jsx';
import './styles.css';

const PRESETS = {
  guest: {
    label: 'Гость (без логина)',
    login: '',
    fullname: '',
    firstname: '',
    dsNumber: '',
    dsName: '',
  },
  user: {
    label: 'Пользователь в отчёте',
    login: 'ivanov',
    fullname: 'Иван Иванов',
    firstname: 'Иван',
    dsNumber: '42',
    dsName: 'Продажи Q1',
  },
  support: {
    label: 'Поддержка',
    login: 'support',
    fullname: 'Анна Поддержка',
    firstname: 'Анна',
    dsNumber: '',
    dsName: '',
  },
};

export default function App() {
  const [preset, setPreset] = useState('user');
  const [actingAsSupport, setActingAsSupport] = useState(false);
  const context = useMemo(
    () => ({ ...PRESETS[preset], actingAsSupport }),
    [preset, actingAsSupport],
  );

  return (
    <div className="demo-shell">
      <header className="demo-hero">
        <p className="demo-kicker">BI Analytics</p>
        <h1>Сервис отчётов</h1>
        <p className="demo-lead">
          Демо-хост чат-бота. Откройте виджет справа внизу — диалог идёт как в Typebot:
          сообщения бота, кнопки-опции, шаг назад.
        </p>
      </header>

      <aside className="demo-controls">
        <h2>Контекст хоста</h2>
        {Object.entries(PRESETS).map(([key, value]) => (
          <button
            key={key}
            type="button"
            className={preset === key ? 'is-active' : ''}
            onClick={() => {
              setPreset(key);
              setActingAsSupport(key === 'support');
            }}
          >
            {value.label}
          </button>
        ))}
        <p className="demo-hint">
          API: Docker <code>Dockerfile.api</code> · БД: <code>docker compose</code>
        </p>
      </aside>

      <ChatWidget key={preset} context={context} onSupportMode={setActingAsSupport} />
    </div>
  );
}
