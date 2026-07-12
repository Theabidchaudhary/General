import { useState } from 'react';
import type { MediaKind, PromptTemplate } from '@/types/models';
import { expandTemplate, extractVariables, MissingVariableError } from '@/prompts/variables';
import { MAX_BATCH_SIZE } from '@/queue/batch';
import { useAppStore } from '../store';

interface FormState {
  id: string | undefined;
  name: string;
  body: string;
  kind: MediaKind;
  tagsText: string;
}

const EMPTY_FORM: FormState = { id: undefined, name: '', body: '', kind: 'image', tagsText: '' };

/** Prompt template library: create/edit/delete templates and use them to enqueue jobs with variables filled in. */
export function PromptsView() {
  const templates = useAppStore((s) => s.templates);
  const providers = useAppStore((s) => s.providers);
  const saveTemplate = useAppStore((s) => s.saveTemplate);
  const deleteTemplate = useAppStore((s) => s.deleteTemplate);
  const enqueue = useAppStore((s) => s.enqueue);
  const lastError = useAppStore((s) => s.lastError);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [useTarget, setUseTarget] = useState<PromptTemplate | undefined>(undefined);
  const [batchTarget, setBatchTarget] = useState<PromptTemplate | undefined>(undefined);

  const liveVariables = extractVariables(form.body);

  async function submitForm() {
    const saved = await saveTemplate({
      ...(form.id ? { id: form.id } : {}),
      name: form.name,
      body: form.body,
      kind: form.kind,
      tags: form.tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
    if (saved) setForm(EMPTY_FORM);
  }

  return (
    <section aria-labelledby="prompts-heading" className="space-y-4">
      <h2 id="prompts-heading" className="text-base font-semibold">
        Prompt Library
      </h2>

      {lastError && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {lastError}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitForm();
        }}
        className="space-y-2 rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <p className="text-sm font-medium">{form.id ? 'Edit template' : 'New template'}</p>
        <div className="flex gap-2">
          <input
            aria-label="Template name"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="flex-1 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <select
            aria-label="Media kind"
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as MediaKind })}
            className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
        </div>
        <textarea
          aria-label="Template body"
          placeholder="a portrait of {{subject}} in {{style}} style"
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          rows={3}
          className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        {liveVariables.length > 0 && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Variables: {liveVariables.join(', ')}
          </p>
        )}
        <input
          aria-label="Tags (comma-separated)"
          placeholder="Tags (comma-separated)"
          value={form.tagsText}
          onChange={(e) => setForm({ ...form, tagsText: e.target.value })}
          className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
          >
            {form.id ? 'Save changes' : 'Create template'}
          </button>
          {form.id && (
            <button
              type="button"
              onClick={() => setForm(EMPTY_FORM)}
              className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {templates.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No templates yet. Create one above.
        </p>
      ) : (
        <ul className="space-y-2">
          {templates.map((template) => (
            <li
              key={template.id}
              className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{template.name}</p>
                  <p className="truncate text-xs text-neutral-500 dark:text-neutral-400" title={template.body}>
                    {template.body}
                  </p>
                </div>
                <span className="shrink-0 rounded bg-neutral-200 px-1.5 py-0.5 text-[11px] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  {template.kind}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setUseTarget(template)}
                  className="rounded bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  disabled={providers.length === 0}
                >
                  Use
                </button>
                {template.variables.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setBatchTarget(template)}
                    className="rounded border border-indigo-300 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950"
                    disabled={providers.length === 0}
                  >
                    Batch
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      id: template.id,
                      name: template.name,
                      body: template.body,
                      kind: template.kind,
                      tagsText: template.tags.join(', '),
                    })
                  }
                  className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void deleteTemplate(template.id)}
                  className="rounded border border-rose-300 px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {useTarget && (
        <UseTemplateDialog
          template={useTarget}
          providerId={providers[0]?.id}
          onClose={() => setUseTarget(undefined)}
          onEnqueue={(prompt) => {
            const providerId = providers[0]?.id;
            if (!providerId) return;
            void enqueue({
              providerId,
              kind: useTarget.kind,
              prompt,
              params: {},
              templateId: useTarget.id,
            });
            setUseTarget(undefined);
          }}
        />
      )}

      {batchTarget && (
        <BatchDialog
          template={batchTarget}
          providerId={providers[0]?.id}
          onClose={() => setBatchTarget(undefined)}
        />
      )}
    </section>
  );
}

function UseTemplateDialog({
  template,
  providerId,
  onClose,
  onEnqueue,
}: {
  template: PromptTemplate;
  providerId: string | undefined;
  onClose: () => void;
  onEnqueue: (prompt: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(template.variables.map((name) => [name, ''])),
  );
  const [error, setError] = useState<string | undefined>(undefined);

  function submit() {
    try {
      const prompt = expandTemplate(template.body, values);
      onEnqueue(prompt);
    } catch (e) {
      setError(e instanceof MissingVariableError ? e.message : String(e));
    }
  }

  return (
    <div
      role="dialog"
      aria-label={`Use template ${template.name}`}
      className="space-y-2 rounded border border-indigo-300 bg-indigo-50 p-3 dark:border-indigo-800 dark:bg-indigo-950"
    >
      <p className="text-sm font-medium">Use "{template.name}"</p>
      {!providerId && (
        <p className="text-xs text-rose-600 dark:text-rose-400">No provider available.</p>
      )}
      {template.variables.map((name) => (
        <div key={name} className="flex items-center gap-2">
          <label htmlFor={`var-${name}`} className="w-24 shrink-0 text-xs font-medium">
            {name}
          </label>
          <input
            id={`var-${name}`}
            value={values[name] ?? ''}
            onChange={(e) => setValues({ ...values, [name]: e.target.value })}
            className="flex-1 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
      ))}
      {error && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!providerId}
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Enqueue
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function parseOptions(text: string): string[] {
  return text
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Fans a template out across a variable-option matrix (comma-separated
 * options per variable) into a batch of queued jobs via BatchEngine.
 */
function BatchDialog({
  template,
  providerId,
  onClose,
}: {
  template: PromptTemplate;
  providerId: string | undefined;
  onClose: () => void;
}) {
  const submitBatch = useAppStore((s) => s.submitBatch);
  const [optionsText, setOptionsText] = useState<Record<string, string>>(
    Object.fromEntries(template.variables.map((name) => [name, ''])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<string | undefined>(undefined);

  const matrix = Object.fromEntries(
    template.variables.map((name) => [name, parseOptions(optionsText[name] ?? '')]),
  );
  const emptyVariables = template.variables.filter((name) => (matrix[name]?.length ?? 0) === 0);
  const combinationCount = template.variables.reduce(
    (total, name) => total * (matrix[name]?.length ?? 0),
    1,
  );
  const overLimit = combinationCount > MAX_BATCH_SIZE;

  async function submit() {
    if (!providerId || emptyVariables.length > 0 || overLimit) return;
    setSubmitting(true);
    setOutcome(undefined);
    const result = await submitBatch({
      providerId,
      kind: template.kind,
      body: template.body,
      matrix,
      templateId: template.id,
    });
    setSubmitting(false);
    if (result) setOutcome(`Enqueued ${result.jobs.length} job(s).`);
  }

  return (
    <div
      role="dialog"
      aria-label={`Batch from template ${template.name}`}
      className="space-y-2 rounded border border-indigo-300 bg-indigo-50 p-3 dark:border-indigo-800 dark:bg-indigo-950"
    >
      <p className="text-sm font-medium">Batch from "{template.name}"</p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Enter comma-separated options for each variable; one job is created per combination.
      </p>
      {!providerId && (
        <p className="text-xs text-rose-600 dark:text-rose-400">No provider available.</p>
      )}
      {template.variables.map((name) => (
        <div key={name} className="flex items-center gap-2">
          <label htmlFor={`batch-var-${name}`} className="w-24 shrink-0 text-xs font-medium">
            {name}
          </label>
          <input
            id={`batch-var-${name}`}
            placeholder="option1, option2, ..."
            value={optionsText[name] ?? ''}
            onChange={(e) => setOptionsText({ ...optionsText, [name]: e.target.value })}
            className="flex-1 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
      ))}
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {combinationCount} job(s) would be created
        {overLimit && ` — exceeds the limit of ${MAX_BATCH_SIZE}`}
      </p>
      {outcome && <p className="text-xs text-emerald-600 dark:text-emerald-400">{outcome}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!providerId || emptyVariables.length > 0 || overLimit || submitting}
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {submitting ? 'Enqueuing…' : 'Enqueue batch'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Close
        </button>
      </div>
    </div>
  );
}
