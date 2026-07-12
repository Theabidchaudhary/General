import { describe, expect, it } from 'vitest';
import type { HistoryRecord, PromptTemplate, UserSettings } from '@/types/models';
import { DEFAULT_SETTINGS } from '@/types/models';
import type { SaveTemplateInput } from '@/prompts/library';
import {
  EXPORT_BUNDLE_VERSION,
  ImportExportService,
  ImportValidationError,
  type ExportBundle,
  type HistorySink,
  type SettingsSink,
  type TemplateSink,
} from './service';

class FakeTemplates implements TemplateSink {
  saved: SaveTemplateInput[] = [];
  #templates: PromptTemplate[];
  constructor(templates: PromptTemplate[] = []) {
    this.#templates = templates;
  }
  async list(): Promise<PromptTemplate[]> {
    return this.#templates;
  }
  async save(input: SaveTemplateInput): Promise<PromptTemplate> {
    this.saved.push(input);
    const now = Date.now();
    return {
      id: `tpl_${this.saved.length}`,
      name: input.name,
      body: input.body,
      variables: [],
      kind: input.kind,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
  }
}

class FakeSettings implements SettingsSink {
  #settings: UserSettings;
  updates: Partial<UserSettings>[] = [];
  constructor(settings: UserSettings = DEFAULT_SETTINGS) {
    this.#settings = settings;
  }
  get(): UserSettings {
    return this.#settings;
  }
  async update(patch: Partial<UserSettings>): Promise<UserSettings> {
    this.updates.push(patch);
    this.#settings = { ...this.#settings, ...patch };
    return this.#settings;
  }
}

class FakeHistory implements HistorySink {
  imported: HistoryRecord[][] = [];
  #records: HistoryRecord[];
  constructor(records: HistoryRecord[] = []) {
    this.#records = records;
  }
  list(): HistoryRecord[] {
    return this.#records;
  }
  async importRecords(records: HistoryRecord[]): Promise<void> {
    this.imported.push(records);
  }
}

function template(): PromptTemplate {
  const now = Date.now();
  return {
    id: 'tpl_x',
    name: 'A',
    body: 'b',
    variables: [],
    kind: 'image',
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

function historyRecord(): HistoryRecord {
  return {
    id: 'hist_x',
    jobId: 'job_x',
    request: { providerId: 'mock', kind: 'image', prompt: 'x', params: {} },
    finalState: 'completed',
    outputs: [],
    durationMs: 10,
    finishedAt: Date.now(),
  };
}

describe('ImportExportService', () => {
  it('exports templates, settings, and history into a versioned bundle', async () => {
    const service = new ImportExportService(
      new FakeTemplates([template()]),
      new FakeSettings({ ...DEFAULT_SETTINGS, maxConcurrentJobs: 5 }),
      new FakeHistory([historyRecord()]),
    );
    const bundle = await service.exportBundle();
    expect(bundle.version).toBe(EXPORT_BUNDLE_VERSION);
    expect(bundle.templates).toHaveLength(1);
    expect(bundle.settings.maxConcurrentJobs).toBe(5);
    expect(bundle.history).toHaveLength(1);
    expect(bundle.exportedAt).toBeGreaterThan(0);
  });

  it('imports templates as new entries and merges settings/history', async () => {
    const templates = new FakeTemplates();
    const settings = new FakeSettings();
    const history = new FakeHistory();
    const service = new ImportExportService(templates, settings, history);

    const bundle: ExportBundle = {
      version: EXPORT_BUNDLE_VERSION,
      exportedAt: Date.now(),
      templates: [template()],
      settings: { ...DEFAULT_SETTINGS, theme: 'dark' },
      history: [historyRecord()],
    };
    const summary = await service.importBundle(bundle);

    expect(summary).toEqual({ templatesImported: 1, historyImported: 1, settingsUpdated: true });
    expect(templates.saved).toHaveLength(1);
    expect(templates.saved[0]?.name).toBe('A');
    expect(settings.updates[0]?.theme).toBe('dark');
    expect(history.imported[0]).toHaveLength(1);
  });

  it('rejects a non-object payload', async () => {
    const service = new ImportExportService(new FakeTemplates(), new FakeSettings(), new FakeHistory());
    await expect(service.importBundle('not an object')).rejects.toBeInstanceOf(ImportValidationError);
    await expect(service.importBundle(null)).rejects.toBeInstanceOf(ImportValidationError);
  });

  it('rejects an unsupported version', async () => {
    const service = new ImportExportService(new FakeTemplates(), new FakeSettings(), new FakeHistory());
    await expect(
      service.importBundle({ version: 999, templates: [], settings: {}, history: [] }),
    ).rejects.toBeInstanceOf(ImportValidationError);
  });

  it('rejects missing templates/history arrays or a missing settings object', async () => {
    const service = new ImportExportService(new FakeTemplates(), new FakeSettings(), new FakeHistory());
    await expect(
      service.importBundle({ version: EXPORT_BUNDLE_VERSION, settings: {}, history: [] }),
    ).rejects.toBeInstanceOf(ImportValidationError);
    await expect(
      service.importBundle({ version: EXPORT_BUNDLE_VERSION, templates: [], settings: {} }),
    ).rejects.toBeInstanceOf(ImportValidationError);
    await expect(
      service.importBundle({ version: EXPORT_BUNDLE_VERSION, templates: [], history: [] }),
    ).rejects.toBeInstanceOf(ImportValidationError);
  });
});
