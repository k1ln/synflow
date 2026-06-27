const apiBase = window.location.origin.replace(/\/$/, '');
const statusTag = document.querySelector('#health-indicator');
const refreshSessionsBtn = document.querySelector('#refresh-sessions');
const refreshDevicesBtn = document.querySelector('#refresh-devices');
const sessionTableBody = document.querySelector('#session-rows');
const sessionForm = document.querySelector('#create-session');
const resetFormBtn = document.querySelector('#reset-form');
const hostApiSelect = document.querySelector('#session-host-api');
const inputSelect = document.querySelector('#session-input');
const outputSelect = document.querySelector('#session-output');
const directionField = document.querySelector('#session-direction');
const sessionIdField = document.querySelector('#session-id');
const nameField = document.querySelector('#session-name');
const sampleRateField = document.querySelector('#session-sample-rate');
const channelsField = document.querySelector('#session-channels');
const blockField = document.querySelector('#session-block');
const latencyField = document.querySelector('#session-latency');
const descriptionField = document.querySelector('#session-description');

const state = {
  devices: [],
  hostApis: [],
  sessions: [],
};

async function fetchHealth() {
  setStatus('checking…', 'neutral');
  try {
    const res = await fetch(`${apiBase}/api/health`);
    if (res.ok) {
      const json = await res.json();
      setStatus(`online (${json.status})`, 'success');
    } else {
      setStatus('offline', 'error');
    }
  } catch (err) {
    console.error('Health check failed', err);
    setStatus('offline', 'error');
  }
}

function setStatus(text, variant) {
  statusTag.textContent = text;
  statusTag.className = `tag tag-${variant}`;
}

async function loadDevices() {
  try {
    const res = await fetch(`${apiBase}/api/devices`);
    if (!res.ok) throw new Error('failed to load devices');
    const json = await res.json();
    state.devices = json.devices || [];
    state.hostApis = json.hostApis || [];
    populateHostApis();
    populateDeviceSelects();
    syncDeviceFieldStates();
  } catch (err) {
    console.error('Device enumeration failed', err);
  }
}

async function loadSessions() {
  try {
    const res = await fetch(`${apiBase}/api/sessions`);
    if (!res.ok) throw new Error('failed to load sessions');
    state.sessions = await res.json();
    renderSessions();
  } catch (err) {
    console.error('Session fetch failed', err);
  }
}

function populateHostApis() {
  hostApiSelect.innerHTML = '<option value="">(any host API)</option>';
  for (const api of state.hostApis) {
    const option = document.createElement('option');
    option.value = String(api.id);
    option.textContent = `${api.name} (#${api.id})`;
    hostApiSelect.appendChild(option);
  }
}

function populateDeviceSelects() {
  const selectedHostApi = hostApiSelect.value;
  const hostApiFilter = selectedHostApi === '' ? null : selectedHostApi;
  const matchesHostApi = (device) => {
    if (hostApiFilter === null) return true;
    const id = device.hostApiId;
    if (id !== null && id !== undefined && String(id) === hostApiFilter) {
      return true;
    }
    const apiMeta = state.hostApis.find((api) => String(api.id) === hostApiFilter);
    if (apiMeta && device.hostApiName && device.hostApiName === apiMeta.name) {
      return true;
    }
    return false;
  };

  const previousInput = inputSelect.value;
  const previousOutput = outputSelect.value;

  const inputDevices = state.devices.filter((device) => {
    if (device.kind === 'output') return false;
    return matchesHostApi(device);
  });

  const outputDevices = state.devices.filter((device) => {
    if (device.kind === 'input') return false;
    return matchesHostApi(device);
  });

  inputSelect.innerHTML = '';
  const defaultInputOption = document.createElement('option');
  defaultInputOption.value = '';
  defaultInputOption.textContent = '(default input)';
  inputSelect.appendChild(defaultInputOption);
  for (const device of inputDevices) {
    const option = document.createElement('option');
    option.value = String(device.id);
    option.textContent = `${device.name} — ${device.description}`;
    inputSelect.appendChild(option);
  }

  if (inputDevices.length === 0) {
    defaultInputOption.disabled = true;
    defaultInputOption.selected = true;
    defaultInputOption.textContent = hostApiFilter === null ? '(no input devices detected)' : '(no input devices for host API)';
  } else {
    defaultInputOption.disabled = false;
    defaultInputOption.textContent = '(default input)';
  }

  outputSelect.innerHTML = '';
  const defaultOutputOption = document.createElement('option');
  defaultOutputOption.value = '';
  defaultOutputOption.textContent = '(default output)';
  outputSelect.appendChild(defaultOutputOption);
  for (const device of outputDevices) {
    const option = document.createElement('option');
    option.value = String(device.id);
    option.textContent = `${device.name} — ${device.description}`;
    outputSelect.appendChild(option);
  }

  if (outputDevices.length === 0) {
    defaultOutputOption.disabled = true;
    defaultOutputOption.selected = true;
    defaultOutputOption.textContent = hostApiFilter === null ? '(no output devices detected)' : '(no output devices for host API)';
  } else {
    defaultOutputOption.disabled = false;
    defaultOutputOption.textContent = '(default output)';
  }

  if (previousInput && inputDevices.some((device) => String(device.id) === previousInput)) {
    inputSelect.value = previousInput;
  }

  if (previousOutput && outputDevices.some((device) => String(device.id) === previousOutput)) {
    outputSelect.value = previousOutput;
  }
}

function renderSessions() {
  sessionTableBody.innerHTML = '';
  if (!state.sessions.length) {
    const emptyRow = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
    td.textContent = 'No sessions configured yet.';
    td.style.opacity = '0.6';
    emptyRow.appendChild(td);
    sessionTableBody.appendChild(emptyRow);
    return;
  }

  for (const session of state.sessions) {
    const tr = document.createElement('tr');
    const direction = session.config.direction || 'capture';
    const inputLabel = direction === 'playback' ? '—' : formatDevice(session.config.inputDeviceId, '(default input)');
    const outputLabel = direction === 'capture' ? '—' : formatDevice(session.config.outputDeviceId, '(default output)');
    tr.innerHTML = `
      <td>${session.config.name}</td>
      <td>${formatDirection(direction)}</td>
      <td>${formatHostApi(session.config.hostApiId)}</td>
      <td>${inputLabel}</td>
      <td>${outputLabel}</td>
      <td>${session.config.sampleRate}</td>
      <td>${session.config.channelCount}</td>
      <td class="actions"></td>
    `;

    const actionsTd = tr.querySelector('.actions');

    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Edit';
    loadBtn.addEventListener('click', () => populateFormFromSession(session));
    actionsTd.appendChild(loadBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.marginLeft = '6px';
    deleteBtn.addEventListener('click', () => deleteSession(session.config.id));
    actionsTd.appendChild(deleteBtn);

    sessionTableBody.appendChild(tr);
  }
}

function formatHostApi(hostApiId) {
  if (hostApiId === null || hostApiId === undefined) return '(system default)';
  const api = state.hostApis.find((item) => item.id === hostApiId);
  return api ? `${api.name} (#${api.id})` : `Host API ${hostApiId}`;
}

function formatDevice(deviceId, emptyLabel = '(default input)') {
  if (deviceId === null || deviceId === undefined) return emptyLabel;
  const device = state.devices.find((item) => item.id === deviceId);
  return device ? device.name : `Device ${deviceId}`;
}

function formatDirection(direction) {
  switch (direction) {
    case 'playback':
      return 'WebRTC → PortAudio';
    case 'capture':
    default:
      return 'PortAudio → WebRTC';
  }
}

async function deleteSession(id) {
  if (!confirm('Remove this session?')) return;
  try {
    const res = await fetch(`${apiBase}/api/sessions/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete');
    await loadSessions();
  } catch (err) {
    console.error('Delete failed', err);
    alert('Failed to delete session. See console.');
  }
}

function populateFormFromSession(session) {
  const cfg = session.config;
  sessionIdField.value = cfg.id;
  nameField.value = cfg.name;
  directionField.value = cfg.direction || 'capture';
  hostApiSelect.value = cfg.hostApiId ?? '';
  populateDeviceSelects();
  inputSelect.value = cfg.inputDeviceId ?? '';
  outputSelect.value = cfg.outputDeviceId ?? '';
  syncDeviceFieldStates();
  sampleRateField.value = cfg.sampleRate;
  channelsField.value = cfg.channelCount;
  blockField.value = cfg.blockSize;
  latencyField.value = cfg.latencyMs;
  descriptionField.value = cfg.description ?? '';
}

function resetForm() {
  sessionIdField.value = '';
  nameField.value = '';
  hostApiSelect.value = '';
  directionField.value = 'capture';
  populateDeviceSelects();
  inputSelect.value = '';
  outputSelect.value = '';
  syncDeviceFieldStates();
  sampleRateField.value = 48000;
  channelsField.value = 2;
  blockField.value = 480;
  latencyField.value = 10;
  descriptionField.value = '';
}

function syncDeviceFieldStates() {
  const direction = directionField.value === 'playback' ? 'playback' : 'capture';
  if (direction === 'capture') {
    inputSelect.disabled = false;
    outputSelect.disabled = true;
    outputSelect.value = '';
  } else {
    inputSelect.disabled = true;
    inputSelect.value = '';
    outputSelect.disabled = false;
  }
}

hostApiSelect.addEventListener('change', () => {
  populateDeviceSelects();
  syncDeviceFieldStates();
});

directionField.addEventListener('change', () => {
  populateDeviceSelects();
  syncDeviceFieldStates();
});

sessionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const direction = directionField.value === 'playback' ? 'playback' : 'capture';
  const payload = {
    name: nameField.value.trim(),
    direction,
    hostApiId: toOptionalNumber(hostApiSelect.value),
    inputDeviceId: direction === 'capture' ? toOptionalNumber(inputSelect.value) : null,
    outputDeviceId: direction === 'playback' ? toOptionalNumber(outputSelect.value) : null,
    sampleRate: Number(sampleRateField.value),
    channelCount: Number(channelsField.value),
    blockSize: Number(blockField.value),
    latencyMs: Number(latencyField.value),
    description: descriptionField.value.trim() || undefined,
  };

  const id = sessionIdField.value;
  const method = id ? 'PATCH' : 'POST';
  const url = id ? `${apiBase}/api/sessions/${id}` : `${apiBase}/api/sessions`;

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Save failed');
    await loadSessions();
    resetForm();
  } catch (err) {
    console.error('Save failed', err);
    alert('Failed to save session. See console.');
  }
});

refreshSessionsBtn.addEventListener('click', loadSessions);
refreshDevicesBtn.addEventListener('click', loadDevices);
resetFormBtn.addEventListener('click', resetForm);

function toOptionalNumber(value) {
  if (value === '' || value === undefined || value === null) {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

(async function init() {
  await fetchHealth();
  await loadDevices();
  await loadSessions();
  syncDeviceFieldStates();
})();
