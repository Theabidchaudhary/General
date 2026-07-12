/**
 * Import/export: bundles templates, settings, and history into a single
 * portable JSON object, and restores one back in. Depends on each source
 * module through a minimal interface (same narrow-dependency pattern as
 * History/Downloads/Analytics/Scheduler), not the concrete services.
 *
 * Imported templates are always created as new templates (fresh ids) rather
 * than merged by id — a bundle may come from a different browser profile
 * entirely, where ids carry no meaning, so "create matching content" is the
 * only safe interpretation. Imported history records DO merge by jobId
 * (via HistoryService.importRecords), since jobId is stable and re-importing
 * the same bundle should stay idempotent there.
 */

import type { HistoryRecord, PromptTemplate, UserSettings } from '@/types/models';
import type { SaveTemplateInput } from '@/prompts/library';

export const EXPORT_BUNDLE_VERSION = 1;

export interface ExportBundle {
  version: typeof EXPORT_BUNDLE_VERSION;
  exportedAt: number;
  templates: PromptTemplate[];
  settings: UserSettings;
  history: HistoryRecord[];
}

export interface ImportSummary {
  templatesImported: number;
  historyImported: number;
  settingsUpdated: boolean;
}

export interface TemplateSink {
  list(): Promise<PromptTemplate[]>;
  save(input: SaveTemplateInput): Promise<PromptTemplate>;
}

export interface SettingsSink {
  get(): UserSettings;
  update(patch: Partial<UserSettings>): Promise<UserSettings>;
}

export interface HistorySink {
  list(): HistoryRecord[];
  importRecords(records: HistoryRecord[]): Promise<void>;
}

export class ImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportValidationError';
  }
}

function validateBundle(value: unknown): ExportBundle {
  if (typeof value !== 'object' || value === null) {
    throw new ImportValidationError('Import file is not a valid JSON object');
  }
  const bundle = value as Partial<ExportBundle>;
  if (bundle.version !== EXPORT_BUNDLE_VERSION) {
    throw new ImportValidationError(`Unsupported export version: ${String(bundle.version)}`);
  }
  if (!Array.isArray(bundle.templates)) {
    throw new ImportValidationError('Import file is missing a templates array');
  }
  if (!Array.isArray(bundle.history)) {
    throw new ImportValidationError('Import file is missing a history array');
  }
  if (typeof bundle.settings !== 'object' || bundle.settings === null) {
    throw new ImportValidationError('Import file is missing a settings object');
  }
  return bundle as ExportBundle;
}

export class ImportExportService {
  #templates: TemplateSink;
  #settings: SettingsSink;
  #history: HistorySink;

  constructor(templates: TemplateSink, settings: SettingsSink, history: HistorySink) {
    this.#templates = templates;
    this.#settings = settings;
    this.#history = history;
  }

  async exportBundle(): Promise<ExportBundle> {
    return {
      version: EXPORT_BUNDLE_VERSION,
      exportedAt: Date.now(),
      templates: await this.#templates.list(),
      settings: this.#settings.get(),
      history: this.#history.list(),
    };
  }

  async importBundle(value: unknown): Promise<ImportSummary> {
    const bundle = validateBundle(value);

    for (const template of bundle.templates) {
      await this.#templates.save({
        name: template.name,
        body: template.body,
        kind: template.kind,
        tags: template.tags,
      });
    }
    await this.#settings.update(bundle.settings);
    await this.#history.importRecords(bundle.history);

    return {
      templatesImported: bundle.templates.length,
      historyImported: bundle.history.length,
      settingsUpdated: true,
    };
  }
}
