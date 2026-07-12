/**
 * Prompt variable extraction and expansion.
 *
 * Templates reference variables as {{name}} inside their body. Names are
 * restricted to a conservative identifier charset so expansion can't be
 * used to smuggle unexpected template syntax.
 */

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/** Extracts the unique variable names referenced in a template body, in order of first appearance. */
export function extractVariables(body: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const match of body.matchAll(VARIABLE_PATTERN)) {
    const name = match[1];
    if (name && !seen.has(name)) {
      seen.add(name);
      ordered.push(name);
    }
  }
  return ordered;
}

export class MissingVariableError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Missing value(s) for variable(s): ${missing.join(', ')}`);
    this.name = 'MissingVariableError';
    this.missing = missing;
  }
}

/**
 * Substitutes {{name}} placeholders with values. Throws MissingVariableError
 * if any referenced variable has no corresponding value (including empty
 * string, which is a valid explicit value and does not count as missing).
 */
export function expandTemplate(body: string, values: Record<string, string>): string {
  const required = extractVariables(body);
  const missing = required.filter((name) => !(name in values));
  if (missing.length > 0) {
    throw new MissingVariableError(missing);
  }
  return body.replace(VARIABLE_PATTERN, (_match, name: string) => values[name] ?? '');
}

/**
 * Expands a template against every combination in a variable matrix
 * (cartesian product), used by the batch engine to fan a template out into
 * multiple concrete prompts. Variables not present in the matrix must still
 * be supplied via `fixedValues`.
 */
export function expandMatrix(
  body: string,
  matrix: Record<string, string[]>,
  fixedValues: Record<string, string> = {},
): string[] {
  const keys = Object.keys(matrix);
  if (keys.length === 0) {
    return [expandTemplate(body, fixedValues)];
  }
  let combinations: Record<string, string>[] = [{}];
  for (const key of keys) {
    const options = matrix[key] ?? [];
    const next: Record<string, string>[] = [];
    for (const combo of combinations) {
      for (const option of options) {
        next.push({ ...combo, [key]: option });
      }
    }
    combinations = next;
  }
  return combinations.map((combo) => expandTemplate(body, { ...fixedValues, ...combo }));
}
