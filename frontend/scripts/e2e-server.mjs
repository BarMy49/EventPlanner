import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const tempDir = mkdtempSync(join(tmpdir(), 'event-planner-e2e-'));
const common = { stdio: 'inherit' };
const backend = spawn(process.env.PYTHON || 'python', ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8001'], { ...common, cwd: '../backend', env: { ...process.env, DATA_FILE: join(tempDir, 'data.json'), CORS_ORIGINS: 'http://127.0.0.1:4173' } });
const frontend = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { ...common, env: { ...process.env, VITE_API_URL: 'http://127.0.0.1:8001' } });
function cleanup() { backend.kill(); frontend.kill(); rmSync(tempDir, { recursive: true, force: true }); }
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
backend.on('exit', (code) => { if (code) { cleanup(); process.exit(code); } });
frontend.on('exit', (code) => { if (code) { cleanup(); process.exit(code); } });
