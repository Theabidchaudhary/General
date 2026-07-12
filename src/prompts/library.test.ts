import { describe, expect, it } from 'vitest';
import { MemoryTemplateStore } from '@/services/storage/templateStore';
import { PromptLibrary, TemplateValidationError } from './library';

function makeLibrary() {
  return new PromptLibrary(new MemoryTemplateStore());
}

describe('PromptLibrary', () => {
  it('creates a template and derives its variables', async () => {
    const library = makeLibrary();
    const template = await library.save({
      name: 'Portrait',
      body: 'a portrait of {{subject}} in {{style}} style',
      kind: 'image',
      tags: ['portrait', ' portrait ', ''],
    });
    expect(template.variables).toEqual(['subject', 'style']);
    expect(template.tags).toEqual(['portrait']);
    expect(template.id).toMatch(/^tpl_/);
  });

  it('rejects empty name or body', async () => {
    const library = makeLibrary();
    await expect(
      library.save({ name: '  ', body: 'x', kind: 'image' }),
    ).rejects.toBeInstanceOf(TemplateValidationError);
    await expect(
      library.save({ name: 'x', body: '   ', kind: 'image' }),
    ).rejects.toBeInstanceOf(TemplateValidationError);
  });

  it('updates an existing template in place, recomputing variables', async () => {
    const library = makeLibrary();
    const created = await library.save({ name: 'A', body: '{{x}}', kind: 'image' });
    const updated = await library.save({
      id: created.id,
      name: 'A2',
      body: '{{y}} and {{z}}',
      kind: 'video',
    });
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('A2');
    expect(updated.kind).toBe('video');
    expect(updated.variables).toEqual(['y', 'z']);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
  });

  it('rejects updates to unknown ids', async () => {
    const library = makeLibrary();
    await expect(
      library.save({ id: 'tpl_missing', name: 'A', body: 'b', kind: 'image' }),
    ).rejects.toBeInstanceOf(TemplateValidationError);
  });

  it('lists templates newest-updated first', async () => {
    const library = makeLibrary();
    const first = await library.save({ name: 'First', body: 'a', kind: 'image' });
    const second = await library.save({ name: 'Second', body: 'b', kind: 'image' });
    const listed = await library.list();
    expect(listed.map((t) => t.id)).toEqual([second.id, first.id]);
  });

  it('deletes templates', async () => {
    const library = makeLibrary();
    const created = await library.save({ name: 'A', body: 'a', kind: 'image' });
    await library.delete(created.id);
    expect(await library.get(created.id)).toBeUndefined();
  });
});
