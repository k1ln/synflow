import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { SessionManager } from './SessionManager.js';
import { SessionStorage } from './storage.js';
import { listDevices } from './devices.js';

const PORT = Number(process.env.PORT ?? 8787);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storagePath = path.resolve(__dirname, '../data/sessions.json');

async function bootstrap() {
  const app = express();
  const storage = new SessionStorage(storagePath);
  const sessions = new SessionManager(storage);
  await sessions.init();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: any, res: any) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.get('/api/devices', (_req: any, res: any) => {
    try {
      const devices = listDevices();
      res.json(devices);
    } catch (err) {
      console.error('[api/devices] failed', err);
      res.status(500).json({ error: 'Failed to enumerate devices' });
    }
  });

  app.get('/api/sessions', (_req: any, res: any) => {
    res.json(sessions.list());
  });

  app.post('/api/sessions', async (req: any, res: any) => {
    try {
      const {
        name,
        direction,
        hostApiId,
        inputDeviceId,
        outputDeviceId,
        sampleRate,
        channelCount,
        blockSize,
        latencyMs,
        description,
      } = req.body ?? {};

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'name is required' });
      }

      const normalizedDirection = parseDirection(direction) ?? 'capture';

      const created = await sessions.create({
        name,
        direction: normalizedDirection,
        hostApiId: toOptionalNumber(hostApiId),
        inputDeviceId: toOptionalNumber(inputDeviceId),
        outputDeviceId: toOptionalNumber(outputDeviceId),
        sampleRate: toOptionalNumber(sampleRate) ?? undefined,
        channelCount: toOptionalNumber(channelCount) ?? undefined,
        blockSize: toOptionalNumber(blockSize) ?? undefined,
        latencyMs: toOptionalNumber(latencyMs) ?? undefined,
        description: typeof description === 'string' ? description : undefined,
      });
      res.status(201).json(created);
    } catch (err) {
      console.error('[api/sessions] create failed', err);
      res.status(500).json({ error: 'Failed to create session' });
    }
  });

  app.patch('/api/sessions/:id', async (req: any, res: any) => {
    const { id } = req.params;
    try {
      const patch = filterSessionPatch(req.body ?? {});
      const updated = await sessions.update(id, patch);
      res.json(updated);
    } catch (err) {
      console.error(`[api/sessions/${id}] update failed`, err);
      res.status(404).json({ error: 'Session not found' });
    }
  });

  app.delete('/api/sessions/:id', async (req: any, res: any) => {
    const { id } = req.params;
    try {
      await sessions.remove(id);
      res.status(204).send();
    } catch (err) {
      console.error(`[api/sessions/${id}] delete failed`, err);
      res.status(404).json({ error: 'Session not found' });
    }
  });

  app.post('/api/sessions/:id/offer', async (req: any, res: any) => {
    const { id } = req.params;
    const sdp = String(req.body?.sdp ?? '');
    if (!sdp) {
      return res.status(400).json({ error: 'sdp is required' });
    }
    try {
      const answer = await sessions.handleOffer(id, sdp);
      res.json(answer);
    } catch (err) {
      console.error(`[api/sessions/${id}/offer] failed`, err);
      res.status(404).json({ error: 'Session not found or failed to negotiate' });
    }
  });

  const adminDir = path.resolve(__dirname, '../public');
  app.use('/', express.static(adminDir));

  app.listen(PORT, () => {
    console.log(`FlowSynth WebRTC server listening on http://localhost:${PORT}`);
  });
}

function toOptionalNumber(value: unknown): number | undefined | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function filterSessionPatch(payload: any) {
  const patch: any = {};
  if (payload.name && typeof payload.name === 'string') patch.name = payload.name;
  if (payload.direction !== undefined) {
    const direction = parseDirection(payload.direction);
    if (direction) patch.direction = direction;
  }
  if ('hostApiId' in payload) patch.hostApiId = toOptionalNumber(payload.hostApiId);
  if ('inputDeviceId' in payload) patch.inputDeviceId = toOptionalNumber(payload.inputDeviceId);
  if ('outputDeviceId' in payload) patch.outputDeviceId = toOptionalNumber(payload.outputDeviceId);
  if ('sampleRate' in payload) patch.sampleRate = toOptionalNumber(payload.sampleRate) ?? undefined;
  if ('channelCount' in payload) patch.channelCount = toOptionalNumber(payload.channelCount) ?? undefined;
  if ('blockSize' in payload) patch.blockSize = toOptionalNumber(payload.blockSize) ?? undefined;
  if ('latencyMs' in payload) patch.latencyMs = toOptionalNumber(payload.latencyMs) ?? undefined;
  if (payload.description && typeof payload.description === 'string') patch.description = payload.description;
  return patch;
}

function parseDirection(value: unknown): 'capture' | 'playback' | undefined {
  if (value === 'capture' || value === 'playback') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'capture' || normalized === 'playback') {
      return normalized as 'capture' | 'playback';
    }
  }
  return undefined;
}
bootstrap().catch((err) => {
  console.error('Failed to start WebRTC server', err);
  process.exitCode = 1;
});
