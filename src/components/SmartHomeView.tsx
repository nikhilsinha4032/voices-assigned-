import React, { useState } from 'react';
import {
  Blinds,
  Coffee,
  Lightbulb,
  Lock,
  Minus,
  Plus,
  Router,
  Speaker,
  Thermometer,
  Unlock,
  Wind,
} from 'lucide-react';
import { getActiveDeviceCount, getDevicesByRoom } from '../engine/smarthome';
import type {
  LocalBridgeConfig,
  RoomName,
  SmartDevice,
  SmartScene,
} from '../types/assistant';

interface SmartHomeViewProps {
  devices: SmartDevice[];
  scenes: SmartScene[];
  bridge: LocalBridgeConfig;
  bridgeStatus: string | null;
  onUpdateDevice: (deviceId: string, patch: Partial<SmartDevice>) => void;
  onActivateScene: (scene: SmartScene) => void;
  onUpdateBridge: (patch: Partial<LocalBridgeConfig>) => void;
}

const ROOMS: Array<RoomName | 'All'> = [
  'All',
  'Living Room',
  'Bedroom',
  'Kitchen',
  'Entryway',
  'Office',
];

function renderDeviceIcon(device: SmartDevice) {
  switch (device.type) {
    case 'light':
      return <Lightbulb className="h-5 w-5" aria-hidden="true" />;
    case 'thermostat':
      return <Thermometer className="h-5 w-5" aria-hidden="true" />;
    case 'lock':
      return device.locked ? (
        <Lock className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Unlock className="h-5 w-5" aria-hidden="true" />
      );
    case 'blinds':
      return <Blinds className="h-5 w-5" aria-hidden="true" />;
    case 'purifier':
      return <Wind className="h-5 w-5" aria-hidden="true" />;
    case 'coffee':
      return <Coffee className="h-5 w-5" aria-hidden="true" />;
    case 'speaker':
      return <Speaker className="h-5 w-5" aria-hidden="true" />;
  }
}

export const SmartHomeView: React.FC<SmartHomeViewProps> = ({
  devices,
  scenes,
  bridge,
  bridgeStatus,
  onUpdateDevice,
  onActivateScene,
  onUpdateBridge,
}) => {
  const [selectedRoom, setSelectedRoom] = useState<RoomName | 'All'>('All');
  const [showBridgePanel, setShowBridgePanel] = useState(false);

  const visibleDevices = getDevicesByRoom(devices, selectedRoom);
  const activeCount = getActiveDeviceCount(devices);

  return (
    <div className="space-y-6">
      {/* Scenes Row */}
      <section
        aria-label="Smart home scenes"
        className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-[#131922]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Home Scenes
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {activeCount} of {devices.length} devices active · Local execution only
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowBridgePanel((v) => !v)}
            aria-expanded={showBridgePanel}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Router className="h-4 w-4" aria-hidden="true" />
            <span>Local LAN Bridge</span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {scenes.map((scene) => (
            <button
              key={scene.id}
              type="button"
              onClick={() => onActivateScene(scene)}
              className="flex min-h-[44px] flex-col items-start rounded-xl bg-slate-100/90 p-3.5 text-left transition-colors hover:bg-blue-50 dark:bg-slate-800/70 dark:hover:bg-blue-950/50"
            >
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {scene.name}
              </span>
              <span className="mt-1 text-xs leading-snug text-slate-600 dark:text-slate-400">
                {scene.description}
              </span>
            </button>
          ))}
        </div>

        {showBridgePanel && (
          <div className="mt-5 border-t border-slate-200 pt-5 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Private LAN Hub Configuration (Zero Cloud)
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Connect directly to a local Home Assistant or Matter/MQTT bridge on your home Wi-Fi (`192.168.x.x`, `.local`, or `localhost`). External cloud URLs are blocked automatically.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="bridge-mode-select"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Transport Mode
                </label>
                <select
                  id="bridge-mode-select"
                  value={bridge.mode}
                  onChange={(e) =>
                    onUpdateBridge({ mode: e.target.value as LocalBridgeConfig['mode'] })
                  }
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="on-device">On-Device Local Hub</option>
                  <option value="lan-rest">Local LAN REST Webhook</option>
                  <option value="lan-websocket">Local LAN WebSocket</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="bridge-url-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Local Endpoint URL
                </label>
                <input
                  id="bridge-url-input"
                  type="text"
                  value={bridge.endpointUrl}
                  onChange={(e) => onUpdateBridge({ endpointUrl: e.target.value })}
                  placeholder="http://192.168.1.50:8123/api/..."
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label
                  htmlFor="bridge-token-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Local Access Token (Stored Locally)
                </label>
                <input
                  id="bridge-token-input"
                  type="password"
                  value={bridge.localToken}
                  onChange={(e) => onUpdateBridge({ localToken: e.target.value })}
                  placeholder="Optional local LAN token"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            {bridgeStatus && (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{bridgeStatus}</p>
            )}
          </div>
        )}
      </section>

      {/* Room Filter Tabs & Device Grid */}
      <section aria-label="Smart home devices by room" className="space-y-4">
        <div
          role="tablist"
          aria-label="Filter devices by room"
          className="flex items-center gap-1.5 overflow-x-auto pb-1"
        >
          {ROOMS.map((room) => (
            <button
              key={room}
              type="button"
              role="tab"
              aria-selected={selectedRoom === room}
              onClick={() => setSelectedRoom(room)}
              className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                selectedRoom === room
                  ? 'bg-slate-900 text-white dark:bg-blue-600 dark:text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#131922] dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {room}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleDevices.map((device) => {
            const isActive = device.type === 'lock' ? !device.locked : device.isOn;
            return (
              <div
                key={device.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#131922]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                        isActive
                          ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-400'
                          : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                      }`}
                    >
                      {renderDeviceIcon(device)}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {device.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {device.room} ·{' '}
                        {device.type === 'lock'
                          ? device.locked
                            ? 'Locked'
                            : 'Unlocked'
                          : device.type === 'coffee'
                          ? device.isOn
                            ? 'Brewing'
                            : 'Standby'
                          : device.isOn
                          ? 'Active'
                          : 'Off'}
                      </p>
                    </div>
                  </div>

                  {device.type === 'lock' ? (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateDevice(device.id, { locked: !device.locked, isOn: true })
                      }
                      aria-label={device.locked ? `Unlock ${device.name}` : `Lock ${device.name}`}
                      className={`min-h-[44px] rounded-xl px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        device.locked
                          ? 'bg-teal-50 text-teal-800 hover:bg-teal-100 dark:bg-teal-950/50 dark:text-teal-300'
                          : 'bg-amber-50 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300'
                      }`}
                    >
                      {device.locked ? 'Locked' : 'Unlocked'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={device.isOn}
                      aria-label={`Toggle ${device.name}`}
                      onClick={() => onUpdateDevice(device.id, { isOn: !device.isOn })}
                      className={`min-h-[44px] rounded-xl px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        device.isOn
                          ? 'bg-blue-700 text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500'
                          : 'border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {device.isOn ? 'On' : 'Off'}
                    </button>
                  )}
                </div>

                {/* Specialized Device Controls */}
                {device.type === 'thermostat' && (
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Target Temp
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Decrease ${device.name} temperature`}
                        onClick={() => {
                          const next = Math.max(16, Number(((device.targetTemp ?? 21) - 0.5).toFixed(1)));
                          onUpdateDevice(device.id, { isOn: true, targetTemp: next, value: next });
                        }}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        <Minus className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <span className="font-mono-tabular w-16 text-center text-base font-semibold text-slate-900 dark:text-slate-100">
                        {(device.targetTemp ?? 21).toFixed(1)}°C
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase ${device.name} temperature`}
                        onClick={() => {
                          const next = Math.min(28, Number(((device.targetTemp ?? 21) + 0.5).toFixed(1)));
                          onUpdateDevice(device.id, { isOn: true, targetTemp: next, value: next });
                        }}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}

                {device.type !== 'thermostat' &&
                  device.type !== 'lock' &&
                  device.type !== 'coffee' &&
                  device.value !== undefined && (
                    <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                      <div className="flex items-center justify-between text-xs">
                        <label
                          htmlFor={`slider-${device.id}`}
                          className="font-medium text-slate-500 dark:text-slate-400"
                        >
                          {device.type === 'light'
                            ? 'Brightness'
                            : device.type === 'blinds'
                            ? 'Open Level'
                            : device.type === 'purifier'
                            ? 'Fan Speed'
                            : 'Volume'}
                        </label>
                        <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                          {device.value}%
                        </span>
                      </div>
                      <input
                        id={`slider-${device.id}`}
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={device.value}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          onUpdateDevice(device.id, { value: val, isOn: val > 0 });
                        }}
                        className="mt-2 h-2 w-full cursor-pointer accent-blue-700 dark:accent-blue-500"
                      />
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
