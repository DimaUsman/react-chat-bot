import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildFlow } from './flow.js';

/**
 * Conversational bot engine: timeline of bubbles + step stack for Back.
 */
export function useBotEngine({ session, context, ready }) {
  const flow = useMemo(
    () => (session ? buildFlow({ session, context }) : null),
    [session, context],
  );

  const [stepId, setStepId] = useState(null);
  const [stack, setStack] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [typing, setTyping] = useState(false);
  const gen = useRef(0);
  const skipPlayRef = useRef(false);

  const resetToRoot = useCallback(() => {
    if (!flow) return;
    gen.current += 1;
    skipPlayRef.current = false;
    setStack([]);
    setTimeline([]);
    setStepId(flow.start);
  }, [flow]);

  // Restart only when host identity / role / report context changes — not on every session refresh
  useEffect(() => {
    if (!ready || !flow) return;
    resetToRoot();
  }, [
    ready,
    session?.user?.login,
    session?.menu?.isSupport,
    context.dsNumber,
    context.firstname,
  ]);

  const step = flow && stepId ? flow.steps[stepId] : null;

  // Animate bot messages when entering a step
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
        await wait(380 + Math.min(msgs[i].length, 80) * 8);
        if (cancelled || myGen !== gen.current) return;
        setTyping(false);
        setTimeline((t) => [
          ...t,
          {
            id: `${stepId}-bot-${i}-${Date.now()}`,
            role: 'bot',
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
  }, [stepId]);

  const pushUser = useCallback((text) => {
    setTimeline((t) => [
      ...t,
      { id: `user-${Date.now()}`, role: 'user', text, stepId },
    ]);
  }, [stepId]);

  const go = useCallback(
    (nextId, { userLabel } = {}) => {
      if (!flow?.steps[nextId]) return;
      if (userLabel) pushUser(userLabel);
      setStack((s) => [...s, stepId]);
      setStepId(nextId);
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
  // Keep messages until (and including) the last bot block of targetStepId
  let lastIdx = -1;
  for (let i = 0; i < timeline.length; i += 1) {
    const m = timeline[i];
    if (m.role === 'bot' && m.stepId === targetStepId) lastIdx = i;
    if (m.role === 'user' && allowed.has(m.stepId)) lastIdx = i;
  }
  if (lastIdx === -1) {
    // Fallback: drop trailing user choice + following bots
    let cut = timeline.length;
    for (let i = timeline.length - 1; i >= 0; i -= 1) {
      if (timeline[i].role === 'user') {
        cut = i;
        break;
      }
    }
    return timeline.slice(0, cut);
  }
  return timeline.slice(0, lastIdx + 1);
}
