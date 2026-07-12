import { describe, expect, it } from 'vitest';
import { expandMatrix, expandTemplate, extractVariables, MissingVariableError } from './variables';

describe('extractVariables', () => {
  it('extracts unique variable names in order of first appearance', () => {
    expect(extractVariables('a {{subject}} in {{style}}, {{subject}} again')).toEqual([
      'subject',
      'style',
    ]);
  });

  it('returns an empty array when there are no variables', () => {
    expect(extractVariables('a static prompt')).toEqual([]);
  });

  it('ignores malformed braces', () => {
    expect(extractVariables('{subject} {{ }} {{1bad}}')).toEqual([]);
  });
});

describe('expandTemplate', () => {
  it('substitutes all variables', () => {
    expect(expandTemplate('{{subject}} in {{style}} style', { subject: 'a fox', style: 'oil' })).toBe(
      'a fox in oil style',
    );
  });

  it('allows explicit empty string values', () => {
    expect(expandTemplate('prefix {{tag}} suffix', { tag: '' })).toBe('prefix  suffix');
  });

  it('throws MissingVariableError listing all missing names', () => {
    try {
      expandTemplate('{{a}} {{b}} {{c}}', { a: '1' });
      expect.fail('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(MissingVariableError);
      expect((error as MissingVariableError).missing).toEqual(['b', 'c']);
    }
  });
});

describe('expandMatrix', () => {
  it('produces the cartesian product of variable options', () => {
    const results = expandMatrix('{{subject}} in {{style}}', {
      subject: ['fox', 'owl'],
      style: ['oil', 'ink'],
    });
    expect(results).toEqual([
      'fox in oil',
      'fox in ink',
      'owl in oil',
      'owl in ink',
    ]);
  });

  it('merges fixed values with matrix values', () => {
    const results = expandMatrix(
      '{{subject}} in {{mood}} mood, {{style}}',
      { subject: ['fox', 'owl'] },
      { style: 'watercolor', mood: 'calm' },
    );
    expect(results).toEqual([
      'fox in calm mood, watercolor',
      'owl in calm mood, watercolor',
    ]);
  });

  it('returns a single expansion when the matrix is empty', () => {
    expect(expandMatrix('static {{x}}', {}, { x: 'value' })).toEqual(['static value']);
  });

  it('propagates MissingVariableError when fixedValues is incomplete', () => {
    expect(() => expandMatrix('{{a}} {{b}}', { a: ['1'] })).toThrow(MissingVariableError);
  });
});
