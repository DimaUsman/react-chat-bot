/**
 * Typebot-like flow for КОРОБКО-КОТ (BI support chatbot).
 */

export function buildFlow({ session, context }) {
  const user = session?.user;
  const firstname = user?.firstname || context?.firstname;

  const name = firstname || user?.fullname || user?.login || 'гость';
  const canReports = Boolean(session?.menu?.canViewReports);
  const hasOpenSupport = Boolean(session?.menu?.hasOpenSupport);
  const isSupport = Boolean(session?.menu?.isSupport);
  const dsLabel = context?.dsName || context?.dsNumber;


  if (isSupport) {
    return supportFlow({ user });
  }

  return userFlow({ name, canReports, hasOpenSupport, dsLabel, context });
}

function userFlow({ name, canReports, hasOpenSupport, dsLabel, context }) {
  const rootChoices = [];

  if (canReports) {
    rootChoices.push({
      id: 'reports',
      label: 'Посмотреть отчёты',
      next: 'reports_list',
      action: 'load_reports',
    });
  }

  if (hasOpenSupport) {
    rootChoices.push({
      id: 'continue_support',
      label: 'Продолжить общение с поддержкой',
      next: 'support_live',
      action: 'open_support',
    });
  } else {
    rootChoices.push({
      id: 'new_support',
      label: 'Написать обращение в поддержку',
      next: 'support_compose',
    });
  }

  rootChoices.push({
    id: 'history',
    label: 'История общения с поддержкой',
    next: 'history_list',
    action: 'load_history',
  });

  const greeting = context?.login
    ? `Здравствуйте, ${name}! Я КОРОБКО-КОТ — помощник по BI. Чем помочь?`
    : `Здравствуйте! Вы не авторизованы — я всё равно запомню диалог на несколько дней. Чем помочь?`;

  return {
    start: 'root',
    steps: {
      root: {
        messages: [
          greeting,
          dsLabel ? `Сейчас открыт отчёт: «${dsLabel}».` : null,
        ].filter(Boolean),
        choices: rootChoices,
      },
      reports_list: {
        messages: ['Отчёты, к которым у вас есть доступ:'],
        mode: 'reports_list',
      },
      report_view: {
        messages: ['Карточка отчёта:'],
        mode: 'report_view',
      },
      support_compose: {
        messages: [
          'Опишите проблему одним сообщением — я создам обращение для поддержки.',
          dsLabel ? `К обращению прикреплю отчёт «${dsLabel}».` : null,
        ].filter(Boolean),
        input: {
          placeholder: 'Текст обращения…',
          submitLabel: 'Отправить',
          action: 'create_ticket',
        },
      },
      support_live: {
        messages: ['Переключаю на чат с поддержкой…'],
        mode: 'support_chat',
      },
      history_list: {
        messages: ['Закрытые обращения:'],
        mode: 'history_list',
      },
      history_view: {
        messages: ['Просмотр закрытого обращения (только чтение).'],
        mode: 'history_view',
      },
    },
  };
}

function supportFlow({ user }) {
  return {
    start: 'root',
    steps: {
      root: {
        messages: [
          `Кабинет поддержки · ${user?.fullname || user?.login || 'агент'}`,
          'Управление отчётами — в админ-панели. Здесь только чаты.',
        ],
        choices: [
          {
            id: 'inbox',
            label: 'Текущие чаты',
            next: 'inbox',
            action: 'load_inbox',
          },
          {
            id: 'support_history',
            label: 'История чатов',
            next: 'support_history',
            action: 'load_support_history',
          },
        ],
      },
      inbox: {
        messages: ['Открытые обращения (неотвеченные отмечены):'],
        mode: 'support_inbox',
      },
      support_history: {
        messages: ['Закрытые чаты:'],
        mode: 'support_history_list',
      },
      support_chat: {
        messages: ['Чат с пользователем:'],
        mode: 'support_chat',
      },
      history_view: {
        messages: ['Просмотр закрытого чата (только чтение).'],
        mode: 'history_view',
      },
    },
  };
}
