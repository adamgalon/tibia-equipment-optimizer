import type { AppState } from './useApp.tsx';

/** Hides or shows a section's body; the choice is remembered in this browser. */
export function Toggle({ app, name }: { app: AppState; name: string }) {
  const hidden = !!app.hidden[name];
  return (
    <button type="button" aria-expanded={!hidden} aria-controls={`${name}-body`} onClick={() => app.toggleSection(name)}>
      {app.t(hidden ? 'show' : 'hide')}
    </button>
  );
}
