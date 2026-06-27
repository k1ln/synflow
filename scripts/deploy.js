#!/usr/bin/env node
/**
 * Deployment script for FlowSynth (backend + frontend) to remote Linux via SSH.
 * Requires: node >=18, ssh/scp available on local system, and remote user with passwordless sudo for service mgmt.
 * Config file: deploy.config.json
 */
const { execSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function sh(cmd, opts={}){ console.log('[cmd]', cmd); return execSync(cmd, { stdio:'inherit', ...opts }); }
function shCapture(cmd, opts={}){ console.log('[cmd]', cmd); return execSync(cmd, { encoding:'utf8', ...opts }); }

const root = process.cwd();
const cfgPath = path.join(root, 'deploy.config.json');
const envPath = path.join(root, 'deploy.env.json');
if(!fs.existsSync(cfgPath)) { console.error('Missing deploy.config.json'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(cfgPath,'utf8'));
const envVars = fs.existsSync(envPath) ? JSON.parse(fs.readFileSync(envPath,'utf8')) : {};

// Validate env vars minimal set
if(!envVars.JWT_SECRET) console.warn('Warning: JWT_SECRET not set in deploy.env.json');

const backendDir = path.join(root, cfg.backendDir);
const frontendDir = path.join(root, cfg.frontendDir);

if(!fs.existsSync(backendDir)) throw new Error('Backend dir missing: '+backendDir);
if(!fs.existsSync(frontendDir)) throw new Error('Frontend dir missing: '+frontendDir);

// 1. Build backend
sh('npm run build', { cwd: backendDir });
// 2. Build frontend
sh('npm run build', { cwd: frontendDir });

// 3. Prepare artifact directories
const distRoot = path.join(root, '.deploy_dist');
fs.rmSync(distRoot, { recursive:true, force:true });
fs.mkdirSync(distRoot, { recursive:true });
// Copy backend dist
sh(`robocopy "${path.join(backendDir,'dist')}" "${path.join(distRoot,'backend')}" /E`);
// Copy backend package.json & production deps lockfile
fs.copyFileSync(path.join(backendDir,'package.json'), path.join(distRoot,'backend','package.json'));
if(fs.existsSync(path.join(backendDir,'package-lock.json'))) fs.copyFileSync(path.join(backendDir,'package-lock.json'), path.join(distRoot,'backend','package-lock.json'));
// Copy frontend dist (vite output default to dist)
sh(`robocopy "${path.join(frontendDir,'dist')}" "${path.join(distRoot,'frontend')}" /E`);

// 4. Tar artifacts for transfer (use bsdtar / tar if available)
const tarFile = path.join(root, 'deploy_artifacts.tar.gz');
if(fs.existsSync(tarFile)) fs.rmSync(tarFile);
try {
  sh(`tar -czf "${tarFile}" -C "${distRoot}" .`);
} catch(e){ console.error('Failed to create tar. Ensure tar is installed.'); process.exit(1); }

// --- Interactive remote config overrides ------------------------------------
// Support sshHost (private IP) distinct from domain (public URL) while keeping backward compatibility.
let { host, user, port, basePath, sshHost, domain } = cfg.remote;
if(!domain && host) domain = host; // fallback
let sshConnectHost = sshHost || host;
if(!sshConnectHost || !user){
  // Prompt interactively (Windows PowerShell, falls back to stdin)
  function prompt(q, secure=false){
    try {
      if(process.platform === 'win32'){
        const psCmd = secure
          ? `powershell -NoProfile -Command "$p=Read-Host -AsSecureString '${q}'; $B=[System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($p); [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($B)"`
          : `powershell -NoProfile -Command "Write-Host -NoNewline '${q}'; Read-Host"`;
        return execSync(psCmd, { encoding:'utf8' }).trim();
      }
    } catch {}
    process.stdout.write(q+': ');
    return fs.readFileSync(0,'utf8').trim();
  }
  if(!sshConnectHost) sshConnectHost = prompt('Server SSH IP/Hostname');
  if(!user) user = prompt('SSH Username');
  if(!domain) domain = prompt('Public domain (for HTTPS / cert)');
  cfg.remote.sshHost = sshConnectHost; cfg.remote.domain = domain; cfg.remote.user = user;
}
const sslCfg = cfg.ssl || {};

// --- Password / auth handling -------------------------------------------------
// Optional: supply SSH password via environment variable DEPLOY_SSH_PASSWORD.
// Strongly prefer key-based auth; password mode requires either:
//  - sshpass (Linux/macOS or installed on Windows), OR
//  - On Windows: plink.exe & pscp.exe (PuTTY tools) in PATH.
// --- Auth handling (prefer key, else interactive password) --------------------
// Order:
// 1. If cfg.remote.keyPath exists and file present -> use key (explicit)
// 2. Else if default id_ed25519 or id_rsa in %USERPROFILE%/.ssh -> use key
// 3. Else if DEPLOY_SSH_PASSWORD env var -> use that
// 4. Else on Windows prompt user for password (hidden) and use plink/pscp if available, else require sshpass
// NOTE: Still strongly recommend key-based auth.

function hasCmd(cmd){
  try { execSync(process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`, { stdio:'ignore' }); return true; } catch { return false; }
  }

function findKeyPath(){
  const explicit = cfg.remote.keyPath ? path.resolve(root, cfg.remote.keyPath) : null;
  if(explicit && fs.existsSync(explicit)) return explicit;
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if(!home) return null;
  const candidates = ['id_ed25519','id_rsa'].map(f=> path.join(home, '.ssh', f));
  for(const c of candidates){ if(fs.existsSync(c)) return c; }
  return null;
}

let keyPath = findKeyPath();
let sshPassword = process.env.DEPLOY_SSH_PASSWORD || '';
// If no key path & no password env, ask user now (later logic would also prompt, but we want to guarantee availability)
if(!findKeyPath() && !sshPassword){
  try {
    if(process.platform === 'win32'){
      sshPassword = execSync('powershell -NoProfile -Command "Write-Host -NoNewline \"SSH Password: \"; $pw = Read-Host -AsSecureString; $BSTR=[System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw); $PLAIN=[System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR); Write-Output $PLAIN"', { encoding:'utf8' }).trim();
    } else {
      process.stdout.write('SSH Password: ');
      sshPassword = fs.readFileSync(0,'utf8').trim();
    }
  } catch {}
}

// Interactive password prompt (Windows) if no key and no env var
if(!keyPath && !sshPassword){
  if(process.platform === 'win32'){
    try {
      // PowerShell secure prompt (avoid echoing password). Returns plaintext.
      sshPassword = execSync('powershell -NoProfile -Command "Write-Host -NoNewline \"SSH Password: \"; $pw = Read-Host -AsSecureString; $BSTR=[System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw); $PLAIN=[System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR); Write-Output $PLAIN"', { encoding:'utf8' }).trim();
      if(!sshPassword){
        console.error('No password entered. Aborting.');
        process.exit(1);
      }
    } catch(e){
      console.error('Failed to capture password interactively. Set DEPLOY_SSH_PASSWORD env var instead.');
      process.exit(1);
    }
  } else {
    console.error('No SSH key detected and interactive prompt only implemented for Windows. Set DEPLOY_SSH_PASSWORD or configure a key.');
    process.exit(1);
  }
}

let sshWrapper = (cmd) => `ssh -p ${port} ${keyPath ? (cfg.remote.keyPath ? `-i \"${keyPath}\" ` : '') : ''}${user}@${sshConnectHost} '${cmd}'`;
let scpCommand = (local, remote) => `scp -P ${port} ${keyPath ? (cfg.remote.keyPath ? `-i \"${keyPath}\" ` : '') : ''}${local} ${user}@${sshConnectHost}:${remote}`;

if(!keyPath){ // password path
  if(process.platform === 'win32' && hasCmd('pscp') && hasCmd('plink')){
  sshWrapper = (cmd) => `plink -pw \"${sshPassword}\" -P ${port} ${user}@${sshConnectHost} \"${cmd.replace(/\"/g,'\\\\\"')}\"`;
  scpCommand = (local, remote) => `pscp -pw \"${sshPassword}\" -P ${port} ${local} ${user}@${sshConnectHost}:${remote}`;
  } else if(hasCmd('sshpass')) {
  sshWrapper = (cmd) => `sshpass -p \"${sshPassword}\" ssh -p ${port} ${user}@${sshConnectHost} '${cmd}'`;
  scpCommand = (local, remote) => `sshpass -p \"${sshPassword}\" scp -P ${port} ${local} ${user}@${sshConnectHost}:${remote}`;
  } else {
    console.error('Password auth requested but neither (plink+pscp) nor sshpass available. Install PuTTY or sshpass, or configure an SSH key.');
    process.exit(1);
  }
}

if(keyPath){
  console.log('Using SSH key:', cfg.remote.keyPath ? keyPath : '(default key)');
} else {
  console.log('Using password authentication (not recommended for automation).');
}

// --- Remote preflight: ensure nginx installed early (supports apt, yum, dnf, pacman) -----------------
const preflightScript = `set -e\n\
echo '[flowsynth] Running remote preflight'\n\
if ! command -v nginx >/dev/null 2>&1; then\n\
  echo '[flowsynth] nginx not found - attempting install';\n\
  if command -v apt-get >/dev/null 2>&1; then sudo apt-get update && sudo apt-get install -y nginx; \
  elif command -v yum >/dev/null 2>&1; then sudo yum install -y nginx; \
  elif command -v dnf >/dev/null 2>&1; then sudo dnf install -y nginx; \
  elif command -v pacman >/dev/null 2>&1; then sudo pacman -Sy --noconfirm nginx; \
  else echo '[flowsynth] Unsupported package manager; please install nginx manually' >&2; fi;\n\
else\n\
  echo '[flowsynth] nginx already installed';\n\
fi`;
try { sh(sshWrapper(preflightScript)); } catch(e){ console.error('Preflight failed (continuing):', e.message); }

// 5. Copy tar to remote (password or key based)
sh(scpCommand(`"${tarFile}"`, '/tmp/flowsynth_deploy.tar.gz'));

// 6. Remote extract, install backend deps (prod), place frontend
const remoteScript = `set -e\n\
mkdir -p ${basePath}/{backend,frontend}\n\
cd ${basePath}\n\
rm -rf backend/* frontend/*\n\
tar -xzf /tmp/flowsynth_deploy.tar.gz -C ${basePath}\n\
cd backend && npm ci --omit=dev || npm install --omit=dev\n`;
sh(sshWrapper(remoteScript));

// 7. Create systemd service files if missing
const backendServiceName = cfg.services.backend;
const frontendServiceName = cfg.services.frontend;

// Compose Environment= lines
const envLines = Object.entries({ ...envVars, SERVE_FRONTEND_DIR: `${basePath}/frontend` })
  .map(([k,v])=> `Environment=${k}=${String(v).replace(/"/g,'\\"')}`)
  .join('\n');

const backendService = `[Unit]\nDescription=FlowSynth Backend\nAfter=network.target\n\n[Service]\nType=simple\n${envLines}\nWorkingDirectory=${basePath}/backend\nExecStart=/usr/bin/node start.js\nRestart=on-failure\nUser=${user}\nGroup=${user}\n\n[Install]\nWantedBy=multi-user.target\n`;

const frontendService = `[Unit]\nDescription=FlowSynth Frontend (static - served by backend)\nAfter=network.target\n\n[Service]\nType=oneshot\nRemainAfterExit=yes\nWorkingDirectory=${basePath}/frontend\nExecStart=/bin/true\nUser=${user}\nGroup=${user}\n\n[Install]\nWantedBy=multi-user.target\n`;

const serviceRemoteScript = `set -e\n\
be=/etc/systemd/system/${backendServiceName}\n\
fe=/etc/systemd/system/${frontendServiceName}\n\
[ -f $be ] || echo '${backendService.replace(/'/g,"'\\''")}'' | sudo tee $be >/dev/null\n\
[ -f $fe ] || echo '${frontendService.replace(/'/g,"'\\''")}'' | sudo tee $fe >/dev/null\n\
sudo systemctl daemon-reload\n\
sudo systemctl enable ${backendServiceName} || true\n\
sudo systemctl restart ${backendServiceName}\n\
\n\
# --- HTTPS / Nginx / Certbot provisioning ---\n\
domain=${domain}\n\
if ! command -v nginx >/dev/null; then sudo apt-get update && sudo apt-get install -y nginx; fi\n\
if ! command -v certbot >/dev/null; then sudo apt-get install -y certbot python3-certbot-nginx; fi\n\
# Obtain cert if not present\n\
if [ ! -d /etc/letsencrypt/live/$domain ]; then\n\
  sudo systemctl stop nginx || true\n\
  email=${sslCfg.email || ''}\n\
  staging=${sslCfg.staging ? '1' : '0'}\n\
  emailArg="--register-unsafely-without-email"\n\
  if [ -n "$email" ]; then emailArg="--email $email"; fi\n\
  stagingArg=""; if [ "$staging" = "1" ]; then stagingArg="--staging"; fi\n\
  sudo certbot certonly --standalone -d $domain $emailArg --agree-tos $stagingArg || echo 'Certbot attempt failed'\n\
fi\n\
# Configure nginx reverse proxy for backend (HTTP->HTTPS + static)\n\
ngconf=/etc/nginx/sites-available/flowsynth.conf\n\
if [ ! -f $ngconf ]; then\n\
  sudo tee $ngconf >/dev/null <<'NGINXEOF'\n\
server {\n\
  listen 80;\n\
  server_name $domain;\n\
  location /.well-known/acme-challenge/ { root /var/www/html; }\n\
  location / { return 301 https://$host$request_uri; }\n\
}\n\
server {\n\
  listen 443 ssl http2;\n\
  server_name $domain;\n\
  ssl_certificate /etc/letsencrypt/live/$domain/fullchain.pem;\n\
  ssl_certificate_key /etc/letsencrypt/live/$domain/privkey.pem;\n\
  ssl_session_cache shared:SSL:10m;\n\
  ssl_session_timeout 1d;\n\
  ssl_protocols TLSv1.2 TLSv1.3;\n\
  ssl_prefer_server_ciphers on;\n\
  # Static files (if served separately)\n\
  root ${basePath}/frontend;\n\
  index index.html;\n\
  location /api/ {\n\
    proxy_pass http://127.0.0.1:4000/api/;\n\
    proxy_http_version 1.1;\n\
    proxy_set_header Host $host;\n\
    proxy_set_header X-Real-IP $remote_addr;\n\
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
    proxy_set_header Upgrade $http_upgrade;\n\
    proxy_set_header Connection upgrade;\n\
  }\n\
  location / { try_files $uri /index.html; }\n\
  client_max_body_size 10M;\n\
}\n\
NGINXEOF\n\
  sudo ln -s $ngconf /etc/nginx/sites-enabled/flowsynth.conf || true\n\
  sudo nginx -t && sudo systemctl restart nginx\n\
else\n\
  sudo nginx -t && sudo systemctl reload nginx\n\
fi\n`;
sh(sshWrapper(serviceRemoteScript));

// 8. Health checks (backend /api/health and homepage)
function curlCheck(url){
  try {
    const out = shCapture(`curl -fsSL --max-time 10 ${url}`);
    console.log('OK', url, out.slice(0,120));
  } catch(e){
    console.error('FAILED', url);
    process.exitCode = 1;
  }
}

curlCheck(`https://${domain}/api/health`);
curlCheck(`https://${domain}/`);

// Print deployed environment summary
console.log('Deployed environment variables:', Object.keys(envVars));

console.log('Deployment script completed');
