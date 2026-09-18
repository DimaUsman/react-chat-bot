import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildFlow } from './flow.js';

/**
 * Conversational bot engine: timeline of bubbles + step stack for Back.
 */
export function useBotEngine({ session, context, ready }) {
  const flow = useMemo(
    () => (session ? buildFlow({ session, context }) : null),
    // стабильные поля — иначе новый объект session/context каждый рендер сбрасывает диалог
    [
      session?.user?.login,
      session?.user?.firstname,
      session?.user?.fullname,
      session?.user?.role,
      session?.menu?.canViewReports,
      session?.menu?.hasOpenSupport,
      session?.menu?.isSupport,
      context?.login,
      context?.firstname,
      context?.fullname,
      context?.dsNumber,
      context?.dsName,
      context?.actingAsSupport,
    ],
  );

  const [stepId, setStepId] = useState(null);
  const [stack, setStack] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [typing, setTyping] = useState(false);
  /** Счётчик перезапуска play — нужен, когда stepId уже root, а ленту очистили */
  const [playEpoch, setPlayEpoch] = useState(0);
  const gen = useRef(0);
  const skipPlayRef = useRef(false);

  const resetToRoot = useCallback(() => {
    if (!flow) return;
    gen.current += 1;
    skipPlayRef.current = false;
    setStack([]);
    setTimeline([]);
    setStepId(flow.start);
    setPlayEpoch((n) => n + 1);
  }, [flow]);

  // Restart only when host identity / role / report context changes — not on every session refresh
  useEffect(() => {
    if (!ready || !flow) return;
    resetToRoot();
  }, [
    ready,
    resetToRoot,
    session?.user?.login,
    session?.menu?.isSupport,
    context?.dsNumber,
    context?.firstname,
  ]);

  const step = flow && stepId ? flow.steps[stepId] : null;

  // Animate bot messages when entering a step / after reset
  useEffect(() => {
    if (!step || !stepId) return undefined;
    if (skipPlayRef.current) {
      skipPlayRef.current = false;
      return undefined;
    }

    const myGen = gen.current;
    let cancelled = false;

    async function play() {
      const msgs = step.messages || [];
      for (let i = 0; i < msgs.length; i += 1) {
        if (cancelled || myGen !== gen.current) return;
        setTyping(true);
        await wait(280 + Math.min(msgs[i].length, 80) * 6);
        if (cancelled || myGen !== gen.current) return;
        setTyping(false);
        setTimeline((t) => [
          ...t,
          {
            id: `${stepId}-bot-${i}-${Date.now()}`,
            speaker: 'bot',
            authorLabel: 'КОРОБКО-КОТ',
            text: msgs[i],
            stepId,
          },
        ]);
      }
    }

    play();
    return () => {
      cancelled = true;
      setTyping(false);
    };
  }, [stepId, playEpoch, step]);

  const pushUser = useCallback((text) => {
    setTimeline((t) => [
      ...t,
      {
        id: `user-${Date.now()}`,
        speaker: 'user',
        authorLabel: 'Вы',
        text,
        stepId,
      },
    ]);
  }, [stepId]);

  const go = useCallback(
    (nextId, { userLabel } = {}) => {
      if (!flow?.steps[nextId]) return;
      if (userLabel) pushUser(userLabel);
      setStack((s) => [...s, stepId]);
      setStepId(nextId);
      setPlayEpoch((n) => n + 1);
    },
    [flow, stepId, pushUser],
  );

  const back = useCallback(() => {
    setStack((s) => {
      if (s.length === 0) return s;
      const copy = [...s];
      const prev = copy.pop();
      gen.current += 1;
      skipPlayRef.current = true;
      setStepId(prev);
      setTimeline((t) => trimTimelineToStep(t, prev, copy));
      return copy;
    });
  }, []);

  const canBack = stack.length > 0;

  return {
    flow,
    step,
    stepId,
    timeline,
    typing,
    canBack,
    go,
    back,
    pushUser,
    resetToRoot,
    setStepId,
    setStack,
  };
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function trimTimelineToStep(timeline, targetStepId, remainingStack) {
  const allowed = new Set([targetStepId, ...remainingStack]);
  let lastIdx = -1;
  for (let i = 0; i < timeline.length; i += 1) {
    const m = timeline[i];
    const who = m.speaker || m.from || m.role;
    if (who === 'bot' && m.stepId === targetStepId) lastIdx = i;
    if (who === 'user' && allowed.has(m.stepId)) lastIdx = i;
  }
  if (lastIdx === -1) {
    let cut = timeline.length;
    for (let i = timeline.length - 1; i >= 0; i -= 1) {
      const who = timeline[i].speaker || timeline[i].from || timeline[i].role;
      if (who === 'user') {
        cut = i;
        break;
      }
    }
    return timeline.slice(0, cut);
  }
  return timeline.slice(0, lastIdx + 1);
}
