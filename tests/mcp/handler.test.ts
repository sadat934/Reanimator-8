import { describe, expect, it } from 'vitest';
import { handleMessage, compileAndTest } from '../../tools/mcp-chip8/handler';

const GOOD = `: main
  v0 := 0
  i := hex v0
  sprite v0 v0 5
  loop
    v1 += 1
    i := hex v1
    sprite v0 v0 5
    sprite v0 v0 5
  again
`;

type Reply = { id: unknown; result?: Record<string, unknown>; error?: { code: number } } | null;
const call = (method: string, params?: unknown, id: unknown = 1): Reply =>
  handleMessage({ jsonrpc: '2.0', id, method, params }) as Reply;

describe('mcp handler', () => {
  it('initializes and lists the tool', () => {
    expect(call('initialize', { protocolVersion: '2024-11-05' })?.result?.capabilities).toEqual({ tools: {} });
    const tools = call('tools/list')?.result?.tools as { name: string }[];
    expect(tools.map((t) => t.name)).toEqual(['compile_and_test']);
  });

  it('returns no reply for notifications', () => {
    expect(handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
  });

  it('reports compile errors with line numbers and no report', () => {
    const out = compileAndTest(': main\n  v0 := \n  bogus-word\n');
    expect(out.compile.ok).toBe(false);
    expect(out.report).toBeNull();
    if (!out.compile.ok) expect(out.compile.errors[0]?.line).toBeGreaterThan(0);
  });

  it('compiles and tests a program via tools/call', () => {
    const reply = call('tools/call', { name: 'compile_and_test', arguments: { source: GOOD } });
    const content = reply?.result?.content as { text: string }[];
    const parsed = JSON.parse(content[0]!.text);
    expect(parsed.compile.ok).toBe(true);
    expect(parsed.report.framesRun).toBe(300);
  });

  it('rejects bad arguments, unknown tools and unknown methods', () => {
    expect(call('tools/call', { name: 'compile_and_test', arguments: {} })?.result?.isError).toBe(true);
    expect(call('tools/call', { name: 'nope' })?.error?.code).toBe(-32602);
    expect(call('nope')?.error?.code).toBe(-32601);
    expect(handleMessage(42)).toMatchObject({ error: { code: -32600 } });
  });
});
