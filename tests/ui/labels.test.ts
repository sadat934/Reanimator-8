import { describe, expect, it } from 'vitest';
import { OFFLINE_NOTICE } from '../../src/loop/reanimate';
import { MOCK_LABEL } from '../../src/llm/mock';
import { LABEL_OFFLINE, labelFor } from '../../src/ui/labels';

describe('labelFor', () => {
  it('labels gallery games pre-generated, with or without a note', () => {
    expect(labelFor({ kind: 'gallery' })).toBe('pre-generated');
    expect(labelFor({ kind: 'gallery', note: 'x' })).toBe('pre-generated');
  });

  it('labels a live result from a real provider generated just now', () => {
    expect(labelFor({ kind: 'live', provider: 'gemini', offline: false })).toBe('generated just now');
  });

  it('labels an offline result as an offline stand-in and never as generated just now', () => {
    const label = labelFor({ kind: 'live', provider: 'mock', offline: true });
    expect(label).toBe('offline stand-in, not generated just now');
    expect(label).not.toBe('generated just now');
  });

  it('keeps the offline text identical to the server-side notice', () => {
    expect(LABEL_OFFLINE).toBe(OFFLINE_NOTICE);
    expect(LABEL_OFFLINE).toBe(MOCK_LABEL);
  });
});
