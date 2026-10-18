export function resolveBaExpression(
  requested: string | undefined,
  animations: readonly string[],
) {
  // An actor placement without the optional expression field changes only
  // position/visibility. Reconstruct the face already active on that actor.
  if (!requested) return { mode: 'unchanged' as const, animation: '' };
  const match = animations.find(
    (name) => name.toLowerCase() === requested.toLowerCase(),
  );
  if (match) return { mode: 'animation' as const, animation: match };
  // Single-pose NPCs have either an Idle_01 animation or only the neutral 00
  // pose. Their script still uses 00/01, without a separate expression bank.
  const expressionBank = animations.some((name) =>
    /^(?:s\d+_)?(?:0[2-9]|[1-9]\d)$/i.test(name),
  );
  if ((requested === '00' || requested === '01') && !expressionBank)
    return {
      mode: 'neutral' as const,
      animation: animations.includes('00') ? '00' : '',
    };
  // The reference viewer leaves its previous face track unchanged when the
  // requested animation does not exist. Keep that distinction observable.
  return { mode: 'hold' as const, animation: '' };
}
