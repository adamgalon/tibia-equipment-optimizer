/** A data file entry as the importer writes it: plain values and one level of nested objects. */
export type Entry = Record<string, unknown>;

export interface FileChanges {
  added: string[];
  removed: string[];
  changed: { name: string; fields: string[] }[];
  /** Wiki edits that left every imported value alone (only the revision moved). */
  editsOnly: number;
}

// Long values such as a creature's drop list are cut so one change stays one readable line.
const show = (value: unknown) => {
  const text = JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
};

// Nested objects become "resist.fire"-style keys so a change reads as one line per value.
function flatten(entry: Entry): Map<string, string> {
  const flat = new Map<string, string>();
  for (const [key, value] of Object.entries(entry)) {
    if (key === 'rev') continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [sub, v] of Object.entries(value)) flat.set(`${key}.${sub}`, show(v));
    } else {
      flat.set(key, show(value));
    }
  }
  return flat;
}

/** What changed between two imports of one data file, matching entries by `key` and naming them by `label`. */
export function diffEntries(before: Entry[], after: Entry[], key: (e: Entry) => string, label: (e: Entry) => string = key): FileChanges {
  const old = new Map(before.map((e) => [key(e), e]));
  const now = new Map(after.map((e) => [key(e), e]));
  const changes: FileChanges = { added: [], removed: [], changed: [], editsOnly: 0 };
  for (const [k, e] of now) {
    const previous = old.get(k);
    if (!previous) {
      changes.added.push(label(e));
      continue;
    }
    const [a, b] = [flatten(previous), flatten(e)];
    const fields = [...new Set([...a.keys(), ...b.keys()])]
      .filter((f) => a.get(f) !== b.get(f))
      .map((f) => `${f} ${a.get(f) ?? '—'} → ${b.get(f) ?? '—'}`);
    if (fields.length) changes.changed.push({ name: label(e), fields });
    else if (previous.rev !== e.rev) changes.editsOnly++;
  }
  for (const [k, e] of old) if (!now.has(k)) changes.removed.push(label(e));
  return changes;
}

/** A plain-text change list, at most `limit` lines per section so a large import stays readable. */
export function describeChanges(sections: { title: string; changes: FileChanges }[], limit = 40): string {
  return sections.flatMap(({ title, changes: c }) => {
    if (!c.added.length && !c.removed.length && !c.changed.length && !c.editsOnly) return [];
    const lines = [
      ...c.added.map((name) => `+ ${name}`),
      ...c.removed.map((name) => `- ${name}`),
      ...c.changed.map(({ name, fields }) => `~ ${name}: ${fields.join('; ')}`),
    ];
    const shown = lines.length > limit ? [...lines.slice(0, limit), `… and ${lines.length - limit} more`] : lines;
    const counts = `${c.added.length} added, ${c.removed.length} removed, ${c.changed.length} changed, ${c.editsOnly} wiki edits without value changes`;
    return [`${title}: ${counts}`, ...shown, ''];
  }).join('\n').trim();
}
