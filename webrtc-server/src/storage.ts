import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PersistedState, SessionState } from './types.js';

const DEFAULT_STATE: PersistedState = { sessions: [] };

export class SessionStorage {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = resolve(filePath);
  }

  async load(): Promise<PersistedState> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as PersistedState;
      if (!parsed.sessions) {
        return DEFAULT_STATE;
      }
      return parsed;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        await this.ensureDirectory();
        await this.save(DEFAULT_STATE);
        return DEFAULT_STATE;
      }
      throw err;
    }
  }

  async save(state: PersistedState): Promise<void> {
    await this.ensureDirectory();
    const payload = JSON.stringify(state, null, 2);
    await fs.writeFile(this.filePath, payload, 'utf8');
  }

  private async ensureDirectory(): Promise<void> {
    const dir = dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
  }

  static touchSession(state: SessionState): SessionState {
    const stamp = Date.now();
    return { ...state, updatedAt: stamp };
  }
}
