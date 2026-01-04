// Fallback primary token key; we will probe multiple keys for JWT.
const authTokenStorageKey = 'flowsynth_token';
const candidateTokenKeys = [
  authTokenStorageKey,
  'authToken',
  'token',
  'access_token',
  'jwt',
  'user_token'
];
let loggedMissingToken = false;

export interface UploadedAudioMeta {
  id: string;
  name: string;
  size: number;
  mime: string;
  created_at: string;
  url: string; // /uploads/audio/<id>.<ext>
}

function getAuthHeader(): Record<string,string>{
  try {
    for(const key of candidateTokenKeys){
      const v = localStorage.getItem(key);
      if(v){
        return { Authorization: `Bearer ${v}` };
      }
    }
    if(!loggedMissingToken){
      // Log only once to avoid spam.
      console.warn('[AUTH] No token found in keys', candidateTokenKeys);
      loggedMissingToken = true;
    }
  } catch{}
  return {};
}

export class AudioFileService {
  base = '/api/audio';

  async uploadFile(file: File): Promise<UploadedAudioMeta>{
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await fetch(this.base, { method:'POST', headers:{ ...(getAuthHeader()) }, body: form });
  if(!res.ok) throw new Error('Upload failed');
  return res.json();
  }

  async getMeta(id: string): Promise<UploadedAudioMeta>{
    const res = await fetch(`${this.base}/${id}`, { headers: { ...(getAuthHeader()) } });
    if(!res.ok) throw new Error('Not found');
    return res.json();
  }

  async delete(id: string){
    const res = await fetch(`${this.base}/${id}`, { method:'DELETE', headers: { ...(getAuthHeader()) } });
    if(!res.ok) throw new Error('Delete failed');
  }
}

// (Legacy base64 helper removed)

export default new AudioFileService();
