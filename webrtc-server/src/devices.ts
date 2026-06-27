import portAudio from 'naudiodon';
import {
  DeviceSummary,
  HostApiSummary,
  ListDevicesResponse,
} from './types.js';

function safeGetHostApis(): HostApiSummary[] {
  try {
    const result = portAudio.getHostAPIs() as any;
    const apis: any[] = Array.isArray(result?.HostAPIs)
      ? result.HostAPIs
      : Array.isArray(result)
      ? result
      : [];

    return apis.map((api) => ({
      id: api.id,
      name: api.name,
      type: api.type,
      defaultInput: api.defaultInputDevice,
      defaultOutput: api.defaultOutputDevice,
    }));
  } catch (err) {
    console.error('[devices] failed to enumerate host APIs', err);
    return [];
  }
}

export function listDevices(): ListDevicesResponse {
  const hostApis = safeGetHostApis();
  const hostApiMap = new Map<number, HostApiSummary>();
  for (const api of hostApis) {
    if (typeof api.id === 'number') {
      hostApiMap.set(api.id, api);
    }
  }

  const devicesRaw = portAudio.getDevices() as any[];
  const devices: DeviceSummary[] = devicesRaw.map((device) => {
    const maxInputChannels = Number(device.maxInputChannels ?? 0) || 0;
    const maxOutputChannels = Number(device.maxOutputChannels ?? 0) || 0;
    const kind: DeviceSummary['kind'] = maxInputChannels > 0 && maxOutputChannels > 0
      ? 'both'
      : maxInputChannels > 0
      ? 'input'
      : 'output';

    const hostApiId = typeof device.hostAPI === 'number' ? device.hostAPI : undefined;
    const hostApi = hostApiId !== undefined ? hostApiMap.get(hostApiId) : undefined;

    const channelText: string[] = [];
    if (maxInputChannels > 0) channelText.push(`${maxInputChannels} in`);
    if (maxOutputChannels > 0) channelText.push(`${maxOutputChannels} out`);

    const descriptionParts = [
      `ID ${device.id}`,
      channelText.join(' / ') || null,
      device.defaultSampleRate ? `${device.defaultSampleRate} Hz` : null,
      hostApi?.name ?? device.hostAPIName ?? null,
    ].filter(Boolean);

    return {
      id: device.id,
      name: device.name || `Device ${device.id}`,
      hostApiId,
      hostApiName: hostApi?.name ?? device.hostAPIName,
      maxInputChannels,
      maxOutputChannels,
      defaultSampleRate: device.defaultSampleRate,
      kind,
      description: descriptionParts.join(' · '),
    } satisfies DeviceSummary;
  });

  return { hostApis, devices };
}
