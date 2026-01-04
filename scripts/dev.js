#!/usr/bin/env node
/**
 * Frontend dev runner: starts Vite.
 * Usage: npm run dev
 * Optional env:
 *   FRONTEND_PORT=5173 (vite default) FRONTEND_DIR=.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const root = process.cwd();
const frontendDir = process.env.FRONTEND_DIR ? path.resolve(root, process.env.FRONTEND_DIR) : root;

if(!fs.existsSync(frontendDir)) { console.error('Frontend dir not found:', frontendDir); process.exit(1); }

const FRONTEND_PORT = process.env.FRONTEND_PORT || 5173; // Vite default

function run(name, cmd, args, opts){
  const p = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, shell: process.platform === 'win32' });
  const raw = process.env.RAW_LOGS === '1';
  if(raw){
    p.stdout.pipe(process.stdout);
    p.stderr.pipe(process.stderr);
  } else {
    p.stdout.on('data', d=> prefix(name, d.toString(), opts.color));
    p.stderr.on('data', d=> prefix(name, d.toString(), opts.color, true));
  }
  p.on('close', code => console.log(color(name, opts.color), 'exited with', code));
  return p;
}

const ANSI = {
  reset:'\x1b[0m',
  red:'\x1b[31m',
  yellow:'\x1b[33m',
  green:'\x1b[32m',
  cyan:'\x1b[36m',
  blue:'\x1b[34m',
  magenta:'\x1b[35m',
  gray:'\x1b[90m'
};
function color(label, c){
  const map = { cyan:ANSI.cyan, green:ANSI.green, magenta:ANSI.magenta, yellow:ANSI.yellow, red:ANSI.red, blue:ANSI.blue };
  return (map[c]||'')+label+ANSI.reset;
}
function colorSeverity(sev, text){
  switch(sev){
    case 'error': return ANSI.red + text + ANSI.reset;
    case 'warn': return ANSI.yellow + text + ANSI.reset;
    case 'success': return ANSI.green + text + ANSI.reset;
    case 'debug': return ANSI.gray + text + ANSI.reset;
    default: return ANSI.cyan + text + ANSI.reset; // info
  }
}
function timestamp(){
  const d = new Date();
  return d.toISOString().split('T')[1].replace('Z','');
}
function detectSeverity(line, isErr){
  const l = line.toLowerCase();
  if(isErr) return 'error';
  if(/\b(error|fail|failed|exception|traceback)\b/.test(l)) return 'error';
  if(/\b(warn|deprecated)\b/.test(l)) return 'warn';
  if(/\b(listening|ready|started|compiled successfully|success|connected)\b/.test(l)) return 'success';
  if(/\b(debug)\b/.test(l)) return 'debug';
  return 'info';
}
function prefix(name, text, c, isErr){
  const tag = '[FRONTEND]';
  text.split(/\r?\n/).filter(Boolean).forEach(line=>{
    const sev = detectSeverity(line, isErr);
    const coloredTag = color(tag, 'green');
    const coloredLine = colorSeverity(sev, line);
    console[isErr?'error':'log'](`${timestamp()} ${coloredTag} ${coloredLine}`);
  });
}

console.log('Starting dev environment... (set RAW_LOGS=1 for unprefixed streams)');
console.log(' Frontend:', frontendDir, 'port', FRONTEND_PORT);

// Frontend: vite
const frontend = run('frontend', 'npm', ['run','start','--','--port', FRONTEND_PORT, '--strictPort'], { cwd: frontendDir, env: {}, color:'green' });

// Auto-open browser (prefer Chrome) when frontend is ready
let browserOpened = false;
const preferChrome = process.env.PREFERRED_BROWSER ? /^chrome$/i.test(process.env.PREFERRED_BROWSER) : true; // prefer Chrome by default
const OPEN_BROWSER = process.env.OPEN_BROWSER !== '0';
const DEFAULT_URL = process.env.OPEN_URL || `http://localhost:${FRONTEND_PORT}/`;

function resolveChromePathWin(){
  const guesses = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe') : null
  ].filter(Boolean);
  for(const p of guesses){ try{ if(p && fs.existsSync(p)) return p; } catch(_){} }
  return null;
}
function openBrowser(url){
  if(!OPEN_BROWSER || browserOpened) return;
  browserOpened = true;
  const platform = process.platform;
  if(platform === 'win32'){
    // Try Chrome first
    if(preferChrome){
      const chrome = resolveChromePathWin();
      if(chrome){
        const p = spawn(chrome, [url], { detached:true, stdio:'ignore' });
        p.unref();
        return;
      }
      // Attempt to launch via App Paths with 'start chrome'
      try {
        spawn('cmd', ['/c','start','', 'chrome', url], { detached:true, stdio:'ignore' }).unref();
        return;
      } catch(_) { /* ignore and continue to default */ }
    }
    // Fallback: default browser
    // Use start to open default handler; need to invoke via cmd.exe
    spawn('cmd', ['/c','start','', url], { detached:true, stdio:'ignore' }).unref();
    return;
  }
  // macOS
  if(platform === 'darwin'){
    const opener = preferChrome ? 'open -a "Google Chrome"' : 'open';
    spawn('sh', ['-c', `${opener} "${url}"`], { detached:true, stdio:'ignore' }).unref();
    return;
  }
  // Linux
  const linuxTry = preferChrome ? 'google-chrome || chromium || xdg-open' : 'xdg-open';
  spawn('sh', ['-c', `${linuxTry} "${url}"`], { detached:true, stdio:'ignore' }).unref();
}

function tryOpenFromLine(line){
  // Look for Local URL lines (Vite) and extract the http URL
  // Examples:  Local:   http://localhost:5173/
  //            Local:   http://127.0.0.1:5173/
  const m = line.match(/Local:\s*(https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/?)/i) || line.match(/(https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/?)/i);
  if(m){ openBrowser(m[1]); }
}

if(frontend && frontend.stdout){
  frontend.stdout.on('data', buf => {
    if(!OPEN_BROWSER || browserOpened) return;
    const txt = buf.toString();
    tryOpenFromLine(txt);
  });
}

// Fallback: if no URL detected within a short window, open the default URL
setTimeout(() => {
  if(!OPEN_BROWSER || browserOpened) return;
  openBrowser(DEFAULT_URL);
}, 4000);

// Graceful shutdown
function shutdown(){
  console.log('Shutting down dev processes...');
  frontend && frontend.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
