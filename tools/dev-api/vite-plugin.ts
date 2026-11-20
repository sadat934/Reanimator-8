// Mounts POST /api/generate on the Vite dev and preview servers (local stand-in for the hosted API).
// The handler imports src/llm/prompt.ts, which uses ?raw imports that the config bundler cannot
// resolve, so it is loaded lazily with ssrLoadModule instead of being imported here.
import { createServer, loadEnv } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
type HandlerModule = { createGenerateHandler(options: { env: Record<string, string | undefined> }): Handler };

const HANDLER_MODULE = '/tools/dev-api/handler.ts';

function fail(res: ServerResponse): void {
  if (res.headersSent) {
    if (!res.writableEnded) res.end();
    return;
  }
  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Something went wrong on the server. Try again.' }));
}

function middlewareFor(getServer: () => Promise<ViteDevServer>, env: Record<string, string>): Middleware {
  let handler: Promise<Handler> | null = null;
  const load = (): Promise<Handler> => {
    handler ??= getServer().then(async (server) => {
      const mod = (await server.ssrLoadModule(HANDLER_MODULE)) as HandlerModule;
      return mod.createGenerateHandler({ env });
    });
    return handler;
  };
  return (req, res) => {
    load()
      .then((h) => h(req, res))
      .catch(() => fail(res));
  };
}

export function devApiPlugin(): Plugin {
  return {
    name: 'reanimator-dev-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '');
      server.middlewares.use('/api/generate', middlewareFor(() => Promise.resolve(server), env));
    },
    configurePreviewServer(preview) {
      // Preview has no ssrLoadModule, so a private middleware-mode server loads the handler.
      const env = loadEnv(preview.config.mode, preview.config.root, '');
      let helper: Promise<ViteDevServer> | null = null;
      const getServer = (): Promise<ViteDevServer> => {
        helper ??= createServer({
          root: preview.config.root,
          mode: preview.config.mode,
          configFile: false,
          appType: 'custom',
          logLevel: 'silent',
          server: { middlewareMode: true, hmr: false, watch: null },
        });
        return helper;
      };
      preview.middlewares.use('/api/generate', middlewareFor(getServer, env));
      preview.httpServer.once('close', () => {
        void helper?.then((s) => s.close());
      });
    },
  };
}
