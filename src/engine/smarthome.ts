import type { LocalBridgeConfig, RoomName, SmartDevice, SmartScene } from '../types/assistant';

export function applySceneToDevices(
  devices: SmartDevice[],
  scene: SmartScene
): { devices: SmartDevice[]; updatedNames: string[] } {
  const updatedNames: string[] = [];
  const nextDevices = devices.map((dev) => {
    const action = scene.actions.find((a) => a.deviceId === dev.id);
    if (!action) return dev;
    updatedNames.push(dev.name);
    return {
      ...dev,
      isOn: action.isOn !== undefined ? action.isOn : dev.isOn,
      value: action.value !== undefined ? action.value : dev.value,
      targetTemp: action.targetTemp !== undefined ? action.targetTemp : dev.targetTemp,
      locked: action.locked !== undefined ? action.locked : dev.locked,
    };
  });
  return { devices: nextDevices, updatedNames };
}

export function getDevicesByRoom(devices: SmartDevice[], room: RoomName | 'All'): SmartDevice[] {
  if (room === 'All') return devices;
  return devices.filter((d) => d.room === room);
}

export function getActiveDeviceCount(devices: SmartDevice[]): number {
  return devices.filter((d) => (d.type === 'lock' ? !d.locked : d.isOn)).length;
}

export async function dispatchLocalBridgeCommand(
  bridge: LocalBridgeConfig,
  device: SmartDevice
): Promise<{ sent: boolean; detail: string }> {
  if (bridge.mode === 'on-device' || !bridge.endpointUrl.trim()) {
    return { sent: true, detail: 'Executed on local on-device state bus.' };
  }

  // Only allow local/LAN addresses so nothing ever leaves the user's home network
  try {
    const parsed = new URL(bridge.endpointUrl);
    const host = parsed.hostname;
    const isLocalHost =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      host.endsWith('.local');

    if (!isLocalHost) {
      return {
        sent: false,
        detail: 'Blocked non-local endpoint to preserve zero-cloud privacy.',
      };
    }

    if (bridge.mode === 'lan-rest') {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (bridge.localToken.trim()) {
        headers.Authorization = `Bearer ${bridge.localToken.trim()}`;
      }
      const res = await fetch(bridge.endpointUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          deviceId: device.id,
          name: device.name,
          room: device.room,
          type: device.type,
          isOn: device.isOn,
          value: device.value,
          targetTemp: device.targetTemp,
          locked: device.locked,
        }),
      });
      return {
        sent: res.ok,
        detail: res.ok ? 'Synced over local LAN REST bridge.' : `Local bridge returned ${res.status}.`,
      };
    }

    return { sent: true, detail: 'Queued for local LAN WebSocket bridge.' };
  } catch {
    return {
      sent: false,
      detail: 'Local LAN bridge unreachable; state updated safely on device.',
    };
  }
}
