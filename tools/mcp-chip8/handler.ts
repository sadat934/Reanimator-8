// Transport-free core of the local MCP server: JSON-RPC message in, response (or null) out.
// Implements the small part of MCP (2024-11-05) that a tools-only server needs.
import { compile } from '../../src/compiler/compile';
import { runHeadless } from '../../src/harness/headless';
import type { CompileResult } from '../../src/compiler/compile';
import type { HarnessReport } from '../../src/harness/headless';

export const SERVER_INFO = { name: 'chip8', version: '0.1.0' } as const;
const PROTOCOL_VERSION = '2024-11-05';

export type CompileAndTestOutput =
  | { compile: { ok: true; romBytes: number }; report: HarnessReport }
  | { compile: Extract<CompileResult, { ok: false }>; report: null };

/** Compiles Octo source and, if it compiles, runs the headless harness on the ROM. */
export function compileAndTest(source: string): CompileAndTestOutput {
  const result = compile(source);
  if (!result.ok) return { compile: result, report: null };
  return { compile: { ok: true, romBytes: result.rom.length }, report: runHeadless(result.rom) };
}

const TOOL = {
  name: 'compile_and_test',
  description:
    'Compiles Octo (CHIP-8) source and runs the headless test harness on the ROM for 300 frames with scripted key presses. ' +
    'Returns the compile result (ROM size, or errors with line numbers) and the test report (passed, failures, and per-criterion fields).',
  inputSchema: {
    type: 'object',
    properties: { source: { type: 'string', description: 'Octo source code (.8o).' } },
    required: ['source'],
    additionalProperties: false,
  },
} as const;

type Json = Record<string, unknown>;
type Response = { jsonrpc: '2.0'; id: unknown; result?: unknown; error?: { code: number; message: string } };

const ok = (id: unknown, result: unknown): Response => ({ jsonrpc: '2.0', id, result });
const err = (id: unknown, code: number, message: string): Response => ({ jsonrpc: '2.0', id, error: { code, message } });

/** Handles one parsed JSON-RPC message. Returns null for notifications (no reply). */
export function handleMessage(msg: unknown): Response | null {
  if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) {
    return err(null, -32600, 'Invalid Request');
  }
  const m = msg as Json;
  const id = m.id;
  const isNotification = !('id' in m);
  if (typeof m.method !== 'string') return isNotification ? null : err(id, -32600, 'Invalid Request');

  switch (m.method) {
    case 'initialize': {
      const params = (m.params ?? {}) as Json;
      const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL_VERSION;
      return ok(id, { protocolVersion: requested, capabilities: { tools: {} }, serverInfo: SERVER_INFO });
    }
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: [TOOL] });
    case 'tools/call': {
      const params = (m.params ?? {}) as Json;
      if (params.name !== TOOL.name) return err(id, -32602, `Unknown tool: ${String(params.name)}`);
      const args = (params.arguments ?? {}) as Json;
      if (typeof args.source !== 'string') {
        return ok(id, { content: [{ type: 'text', text: 'Argument "source" must be a string.' }], isError: true });
      }
      const out = compileAndTest(args.source);
      return ok(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
    }
    default:
      return isNotification ? null : err(id, -32601, `Method not found: ${m.method}`);
  }
}
