/** Find a real source path for verification without selecting unreachable text. */
export function routeTo(passages, target) {
  const byId = new Map(
    passages.map((p, i) => [p.id, { ...p, fallback: passages[i + 1]?.id }]),
  );
  const previous = new Map([[passages[0].id, null]]),
    queue = [passages[0].id];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i],
      p = byId.get(id);
    if (id === target) break;
    const edges =
      p.kind === 'choice'
        ? p.choices.map((c) => ({ to: c.next, answer: c.id }))
        : p.kind === 'end'
          ? []
          : [{ to: p.next === undefined ? p.fallback : p.next }];
    for (const edge of edges)
      if (edge.to && !previous.has(edge.to)) {
        previous.set(edge.to, { from: id, answer: edge.answer });
        queue.push(edge.to);
      }
  }
  if (!previous.has(target)) throw Error(`Unreachable passage ${target}`);
  const ids = [],
    answers = {};
  let id = target;
  while (id) {
    ids.push(id);
    const edge = previous.get(id);
    if (edge?.answer) answers[edge.from] = edge.answer;
    id = edge?.from;
  }
  return { ids: ids.reverse(), answers };
}
