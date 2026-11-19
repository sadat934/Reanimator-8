// stdio transport: one JSON-RPC message per line on stdin, one reply per line on stdout.
// stdout carries protocol messages only; diagnostics go to stderr.
import { createInterface } from 'node:readline';
import { handleMessage } from './handler';

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (line.trim() === '') return;
  let reply;
  try {
    reply = handleMessage(JSON.parse(line));
  } catch (e) {
    if (e instanceof SyntaxError) {
      reply = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } };
    } else {
      process.stderr.write(`internal error: ${e instanceof Error ? e.message : String(e)}\n`);
      reply = { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } };
    }
  }
  if (reply) process.stdout.write(JSON.stringify(reply) + '\n');
});
