import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// ONNX Runtime asks for its .wasm next to its own JS; we serve one copy from public/stt/ort instead (wasmPaths in
// sttWorker.ts), so drop the duplicate Vite would otherwise emit into assets/.
const dropOrtWasm = (): Plugin => ({
  name: 'drop-ort-wasm',
  generateBundle(_o, bundle) { for (const k of Object.keys(bundle)) if (/ort-wasm[^/]*\.wasm$/.test(k)) delete bundle[k]; },
});

// dev server only: public/voice and public/art are rebuilt by tools while the game runs; Vite never learns about
// files ADDED there after start-up and answers them with index.html. Serve those folders straight from disk.
const TYPES: Record<string, string> = { '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg' };
const freshMedia = (): Plugin => ({
  name: 'fresh-media',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = decodeURIComponent((req.url ?? '').split('?')[0]);
      if (!/^\/(voice|art)\/[^/]+$/.test(url)) return next();
      const root = server.config.publicDir, file = normalize(join(root, url));
      if (!file.startsWith(root) || !existsSync(file)) return next();
      res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
      res.setHeader('Content-Length', String(statSync(file).size));
      res.setHeader('Cache-Control', 'no-store');
      if (req.method === 'HEAD') { res.end(); return; }
      createReadStream(file).pipe(res);
    });
  },
});

export default defineConfig({
  base: './',
  plugins: [dropOrtWasm(), freshMedia()],
  worker: { format: 'es', plugins: () => [dropOrtWasm()] },
  server: { host: true, port: 5197, strictPort: true, headers: { 'Cache-Control': 'no-store' },
    watch: { ignored: ['**/public/voice/**', '**/public/art/**', '**/public/bgm.mp3', '**/design/**', '**/tools/**'] } },
  preview: { port: 5198, strictPort: true },
  // pre-bundle up front: otherwise the first PLAY (which loads the speech worker) makes the dev server reload the page
  optimizeDeps: { include: ['@huggingface/transformers'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 3000, assetsInlineLimit: 0 },
});
