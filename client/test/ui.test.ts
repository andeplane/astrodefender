import { describe, expect, it } from 'vitest';
import type { UiState } from '../src/contract';
import { createUiStore, sameSite } from '../src/ui';

describe('ui store', () => {
  it('starts empty', () => {
    expect(createUiStore().state).toEqual({ selected: null, preview: null });
  });

  it('notifies subscribers on a change and not on a no-op', () => {
    const ui = createUiStore();
    const seen: UiState[] = [];
    ui.subscribe((state) => seen.push(state));
    ui.set({ selected: { kind: 'surface', slot: 2 } });
    ui.set({ selected: { kind: 'surface', slot: 2 } });
    ui.set({});
    expect(seen).toHaveLength(1);
    ui.set({ preview: 'laser' });
    ui.set({ preview: 'laser' });
    expect(seen).toHaveLength(2);
    expect(ui.state).toEqual({ selected: { kind: 'surface', slot: 2 }, preview: 'laser' });
    ui.set({ selected: { kind: 'shell', shell: 0, slot: 2 } });
    ui.set({ selected: { kind: 'shell', shell: 1, slot: 2 } });
    ui.set({ selected: null, preview: null });
    expect(seen).toHaveLength(5);
  });

  it('stops notifying after unsubscribe', () => {
    const ui = createUiStore();
    let calls = 0;
    const off = ui.subscribe(() => calls++);
    ui.set({ preview: 'a' });
    off();
    ui.set({ preview: 'b' });
    expect(calls).toBe(1);
  });
});

describe('sameSite', () => {
  it('compares sites by value', () => {
    expect(sameSite(null, null)).toBe(true);
    expect(sameSite(null, { kind: 'surface', slot: 0 })).toBe(false);
    expect(sameSite({ kind: 'surface', slot: 0 }, null)).toBe(false);
    expect(sameSite({ kind: 'surface', slot: 1 }, { kind: 'surface', slot: 1 })).toBe(true);
    expect(sameSite({ kind: 'surface', slot: 1 }, { kind: 'surface', slot: 2 })).toBe(false);
    expect(sameSite({ kind: 'surface', slot: 1 }, { kind: 'shell', shell: 0, slot: 1 })).toBe(false);
    expect(sameSite({ kind: 'shell', shell: 0, slot: 1 }, { kind: 'shell', shell: 0, slot: 1 })).toBe(true);
    expect(sameSite({ kind: 'shell', shell: 0, slot: 1 }, { kind: 'shell', shell: 2, slot: 1 })).toBe(false);
  });
});
