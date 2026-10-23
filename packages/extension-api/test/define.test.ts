import { afterEach, describe, expect, it } from 'vitest';
import { defineExtension, editorIdsFor, type SandboxedPlugin } from '../src/index';

const g = globalThis as { filarrSandboxedPlugin?: SandboxedPlugin };

afterEach(() => {
  delete g.filarrSandboxedPlugin;
});

describe('defineExtension', () => {
  const mount = () => ({ destroy() {}, getBytes: () => new Uint8Array() });

  it('pose le global, avec <id>-editor et les alias de test local', () => {
    const plugin = defineExtension({ id: 'kanban', editor: { mount } });
    expect(g.filarrSandboxedPlugin).toBe(plugin);
    const ids = plugin.editors!.map((e) => e.id);
    expect(ids[0]).toBe('kanban-editor');
    expect(ids).toContain('dev-local-1-editor');
    expect(ids).toContain('dev-local-8-editor');
    expect(ids).toEqual(editorIdsFor('kanban'));
  });

  it('sans alias quand on le demande', () => {
    const plugin = defineExtension({ id: 'kanban', editor: { mount }, devLocalAliases: false });
    expect(plugin.editors!.map((e) => e.id)).toEqual(['kanban-editor']);
  });

  it('encode en UTF-8 un export rendu en chaîne (l’hôte n’accepte que des octets)', async () => {
    const plugin = defineExtension({
      id: 'notes',
      functions: { export: (_b, ctx) => `# export ${ctx.to}` as never },
    });
    const out = await plugin.functions!.export!(new Uint8Array(), {
      fileName: 'a.notes',
      to: 'md',
      locale: 'fr',
    });
    expect(out).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(out as Uint8Array)).toBe('# export md');
  });

  it('jette un message lisible sur une définition fautive', () => {
    expect(() => defineExtension({ id: 'Mauvais', editor: { mount } })).toThrow(/identifiant/);
    expect(() => defineExtension({ id: 'vide' })).toThrow(/rien à exposer/);
    expect(() => defineExtension({ id: 'ok-id', editor: {} as never })).toThrow(/mount/);
  });
});
