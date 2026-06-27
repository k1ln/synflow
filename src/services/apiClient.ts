export interface AuthUser { id: string; email: string }

// Resolve backend base URL dynamically so it can be configured at runtime.
// Priority:
// 1. localStorage.FLOWSYNTH_API_BASE (user-configurable at runtime)
// 2. process.env.FLOWSYNTH_API_BASE (Node/test builds)
// 3. window.FLOWSYNTH_API_BASE (injected before bundle load)
// 4. default localhost
const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

function getApiBase(){
  const ls = (typeof localStorage !== 'undefined') ? localStorage.getItem('FLOWSYNTH_API_BASE') : null;
  if(ls && typeof ls === 'string' && ls.trim()) return trimTrailingSlash(ls.trim());

  const env = (typeof process !== 'undefined' && (process as any).env && (process as any).env.FLOWSYNTH_API_BASE) || undefined;
  if(env) return trimTrailingSlash(env as string);

  if(typeof window !== 'undefined'){
    const winOverride = (window as any).FLOWSYNTH_API_BASE;
    if(winOverride && typeof winOverride === 'string' && winOverride.trim()){
      return trimTrailingSlash(winOverride.trim());
    }
    return trimTrailingSlash(`${window.location.origin}/api`);
  }

  return 'http://localhost:4000/api';
}

function getToken(){ return localStorage.getItem('authToken'); }
function setToken(t:string){ localStorage.setItem('authToken', t); }

async function request(path:string, options:RequestInit = {}){
  const headers: Record<string,string> = { 'Content-Type':'application/json', ...(options.headers as any || {}) };
  const token = getToken();
  if(token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
  const base = getApiBase();
  res = await fetch(`${base}${path}`, { ...options, headers });
  } catch (e:any) {
    const err: any = new Error('network_error');
    err.status = 0; err.detail = { error:'network_error', cause: e?.message };
    err.path = path;
    throw err;
  }
  if(!res.ok){
    let detail: any = null;
    try { detail = await res.json(); } catch {}
    const msg = detail?.error ? `API ${res.status} (${detail.error})` : `API ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status; err.detail = detail; err.path = path;
    throw err;
  }
  return res.json();
}

export async function register(email:string,password:string){
  const data = await request('/auth/register',{ method:'POST', body: JSON.stringify({ email,password }) });
  setToken(data.token); return data.user as AuthUser;
}
export async function login(email:string,password:string){
  const data = await request('/auth/login',{ method:'POST', body: JSON.stringify({ email,password }) });
  setToken(data.token); return data.user as AuthUser;
}
export async function listMyFlows(){ return request('/flows/my'); }
export async function listPublicFlows(){ return request('/flows/public'); }
export async function listMyFolders(){ return request('/flows/folders/my'); }
export async function createFolder(path:string){ return request('/flows/folders',{ method:'POST', body: JSON.stringify({ path }) }); }
export async function renameFolder(old_path:string,new_path:string){ return request('/flows/folders/rename',{ method:'PUT', body: JSON.stringify({ old_path, new_path }) }); }
export async function moveFlow(name:string, folder_path:string){ return request('/flows/move',{ method:'PUT', body: JSON.stringify({ name, folder_path }) }); }
export async function renameFlow(old_name:string,new_name:string){ return request('/flows/rename',{ method:'PUT', body: JSON.stringify({ old_name, new_name }) }); }
export async function getPublicFlow(id:string){ return request(`/flows/public/${id}`); }
export async function getFlow(id:string){ return request(`/flows/${id}`); }
export function validateFlowName(name:string){ return typeof name === 'string' && name.trim().length >= 2; }
export async function saveFlow(flow:{ id?:string; name:string; data:any; is_public?:boolean; folder_path?: string; }){
  if(!validateFlowName(flow.name)){
    const err: any = new Error('client_invalid_name');
    err.detail = { error:'invalid_name', stage:'client' };
    throw err;
  }
  const payload = { ...flow, name: flow.name.trim(), folder_path: (flow.folder_path || '').trim() };
  if(!payload.data){
    const err: any = new Error('client_missing_data');
    err.detail = { error:'missing_data', stage:'client' };
    throw err;
  }
  try {
    console.debug('[apiClient] POST /flows payload', { name: payload.name, hasData: !!payload.data, keys: Object.keys(payload.data||{}), id: payload.id });
    return await request('/flows',{ method:'POST', body: JSON.stringify(payload) });
  } catch(e:any){
    if(e?.detail?.error === 'invalid_name'){
      console.error('[apiClient] Server rejected name', { name: payload.name, length: payload.name.length });
    }
    throw e;
  }
}
export async function deleteFlow(id:string){ return request(`/flows/${id}`, { method:'DELETE' }); }
export async function listMyComponents(){ return request('/components/my'); }
export async function listPublicComponents(){ return request('/components/public'); }
export async function getComponent(id:string){ return request(`/components/${id}`); }
export async function saveComponent(c:{ id?:string; name:string; code:string; is_public?:boolean; }){ 
  let req = await request('/components',{ method:'POST', body: JSON.stringify(c) })
  return req
}
export async function deleteComponent(id:string){ return request(`/components/${id}`, { method:'DELETE' }); }
export async function currentUser(){ try { return (await request('/auth/me')).user; } catch { return null; } }

export function logout(){ localStorage.removeItem('authToken'); }

// Scripts API helpers
export async function listMyScripts(){ return request('/scripts/my'); }
export async function listPublicScripts(){ return request('/scripts/public'); }
export async function saveScript(s:{ id?:string; name:string; code:string; is_public?:boolean; }){
  if(!s.name || typeof s.name !== 'string') throw new Error('client_invalid_name');
  if(typeof s.code !== 'string') throw new Error('client_missing_code');
  const payload = { ...s, name: s.name.trim() };
  return request('/scripts',{ method:'POST', body: JSON.stringify(payload) });
}
export async function deleteScript(id:string){ return request(`/scripts/${id}`, { method:'DELETE' }); }

// Upload an audio blob (wav) to backend. Returns metadata with url.
export async function uploadAudio(blob: Blob, filename: string){
  const token = (typeof localStorage !== 'undefined') ? localStorage.getItem('authToken') : null;
  const base = getApiBase();
  const fd = new FormData();
  fd.append('file', blob, filename);
  const headers: Record<string,string> = {};
  if(token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}/audio`, { method:'POST', body: fd, headers });
  if(!res.ok){
    let detail: any = null; try { detail = await res.json(); } catch {}
    const err: any = new Error(`audio_upload_failed_${res.status}`);
    err.detail = detail; err.status = res.status; throw err;
  }
  return res.json();
}
