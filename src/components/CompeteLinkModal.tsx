import React, { useEffect, useState } from 'react';
import {
  X,
  Cable,
  Wifi,
  Monitor,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  Radio,
  Cpu,
  Gamepad2,
  Copy,
  Check
} from 'lucide-react';
import { GameComSystem } from '../emulator/gamecomSystem';
import { COMPETE_COMPATIBLE_GAMES } from '../emulator/linkCable';

interface CompeteLinkModalProps {
  system: GameComSystem;
  onClose: () => void;
  onUpdate: () => void;
}

export const CompeteLinkModal: React.FC<CompeteLinkModalProps> = ({
  system,
  onClose,
  onUpdate
}) => {
  const link = system.linkCable;
  const [, setTick] = useState(0);
  const [lanUrl, setLanUrl] = useState(link.lanUrl);
  const [roomCode, setRoomCode] = useState(link.roomCode);
  const [lanIps, setLanIps] = useState<string[]>([]);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    const unsub = link.subscribe(() => {
      setTick((t) => t + 1);
      onUpdate();
    });

    const interval = window.setInterval(() => {
      setTick((t) => t + 1);
    }, 250);

    // Query LAN IPs if running in Electron desktop app
    const desktop = (window as any).gamecomDesktop;
    if (desktop && typeof desktop.getLanIps === 'function') {
      desktop
        .getLanIps()
        .then((res: { ips?: string[]; port?: number }) => {
          if (res && Array.isArray(res.ips)) {
            setLanIps(res.ips);
          }
        })
        .catch(() => {});
    }

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [link, onUpdate]);

  const handleCopyLanUrl = (urlToCopy: string) => {
    navigator.clipboard?.writeText(urlToCopy).catch(() => {});
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1800);
  };

  const p3LocalOut = system.cpu.m_p_ram[0x0017] & 0x03;
  const p3RemoteIn = system.cpu.remotePort3Bits & 0x03;
  const urts = system.cpu.m_p_ram[0x002d] ?? 0;
  const urtc = system.cpu.m_p_ram[0x002e] ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700/90 rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Cable className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Compete.Com™ Link Cable (2-Player Multiplayer)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-zinc-800 text-zinc-300 border border-zinc-700">
                  Instance #{link.instanceNumber}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                SM8521 Hardware UART ($002B–$002F) &amp; Port 3 ($0017) Crossover Link Emulation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {/* Active Link Status Banner */}
          <div
            className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 ${
              link.status === 'connected'
                ? 'bg-emerald-950/35 border-emerald-500/40'
                : link.status === 'waiting'
                ? 'bg-amber-950/35 border-amber-500/40'
                : 'bg-zinc-950/60 border-zinc-800'
            }`}
          >
            <div className="flex items-center gap-3">
              {link.status === 'connected' ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              ) : link.status === 'waiting' ? (
                <Radio className="w-6 h-6 text-amber-400 animate-pulse shrink-0" />
              ) : (
                <Cable className="w-6 h-6 text-zinc-500 shrink-0" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">
                    {link.status === 'connected'
                      ? 'Compete.Com Cable Linked & Ready'
                      : link.status === 'waiting'
                      ? 'Waiting for 2nd Game.Com Console...'
                      : 'Link Cable Disconnected'}
                  </span>
                  {link.mode !== 'off' && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-black/40 text-zinc-300 border border-zinc-700">
                      Mode: {link.mode === 'same-pc' ? 'Same-PC Dual Instance' : link.mode === 'lan' ? `LAN Room (${link.roomCode})` : 'Loopback Test'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {link.errorMessage ||
                    (link.status === 'connected'
                      ? `Peer connected (${link.peerUid ? link.peerUid.slice(0, 12) : 'Remote Game.Com'}) — Boot the same game on both consoles and select 2-Player / Compete mode.`
                      : link.status === 'waiting'
                      ? 'Open a 2nd instance window on this PC or connect another computer on the same LAN room.'
                      : 'Choose Same-PC Dual Instance or Local Network (LAN) below to link two consoles.')}
                </p>
              </div>
            </div>

            {link.mode !== 'off' && (
              <button
                onClick={() => link.disconnect()}
                className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-semibold transition-colors"
              >
                Unplug Cable
              </button>
            )}
          </div>

          {/* Connection Mode Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Option 1: Same-PC Dual Instance */}
            <div
              className={`p-4 rounded-xl border flex flex-col justify-between transition-colors ${
                link.mode === 'same-pc'
                  ? 'bg-emerald-950/20 border-emerald-500/50'
                  : 'bg-zinc-950/50 border-zinc-800/90'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <Monitor className="w-4 h-4" />
                    <span>1. Same-PC Multiplayer (2 Instances)</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                    Zero-Config
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                  Run two independent <strong>Cub Spiele.Com</strong> windows side-by-side on one computer.
                  Linked automatically via high-speed IPC / BroadcastChannel.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => link.connectSamePc()}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                      link.mode === 'same-pc'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
                    }`}
                  >
                    <Cable className="w-3.5 h-3.5" />
                    {link.mode === 'same-pc' ? 'Same-PC Link Active' : 'Enable Same-PC Link'}
                  </button>

                  <button
                    onClick={() => link.launchSecondInstanceWindow()}
                    className="flex-1 py-2 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                    title="Spawns a 2nd Cub Spiele.Com window pre-configured as Instance #2 with Compete.Com link active"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Launch 2nd Instance
                  </button>
                </div>
              </div>
            </div>

            {/* Option 2: Local Network (LAN) WebSocket Relay */}
            <div
              className={`p-4 rounded-xl border flex flex-col justify-between transition-colors ${
                link.mode === 'lan'
                  ? 'bg-sky-950/20 border-sky-500/50'
                  : 'bg-zinc-950/50 border-zinc-800/90'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
                    <Wifi className="w-4 h-4" />
                    <span>2. Local Network (LAN) Multiplayer</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/30">
                    WebSocket Relay
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed mb-3">
                  Connect two computers over Wi-Fi / Ethernet, or two windows via the built-in LAN room relay server.
                </p>

                <div className="space-y-2 mb-3">
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                      Host WebSocket Relay URL
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={lanUrl}
                        onChange={(e) => setLanUrl(e.target.value)}
                        placeholder="ws://192.168.1.x:3000/compete-link"
                        className="flex-1 px-2.5 py-1.5 rounded bg-zinc-900 border border-zinc-700 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                      />
                      <button
                        onClick={() => handleCopyLanUrl(lanUrl)}
                        className="px-2 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs flex items-center gap-1"
                        title="Copy Relay URL"
                      >
                        {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {lanIps.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-zinc-500 font-mono">This PC LAN IP:</span>
                      {lanIps.map((ip) => {
                        const port = window.location.port || '3197';
                        const suggested = `ws://${ip}:${port}/compete-link`;
                        return (
                          <button
                            key={ip}
                            onClick={() => setLanUrl(suggested)}
                            className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono text-sky-300 border border-zinc-700"
                          >
                            {ip}:{port}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                        Room Code (Both players must match)
                      </label>
                      <input
                        type="text"
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                        maxLength={16}
                        placeholder="ROOM1"
                        className="w-full px-2.5 py-1.5 rounded bg-zinc-900 border border-zinc-700 text-xs font-mono text-white uppercase focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => link.connectLan(lanUrl, roomCode)}
                className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                  link.mode === 'lan'
                    ? 'bg-sky-600 text-white'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
                }`}
              >
                <Wifi className="w-3.5 h-3.5" />
                {link.mode === 'lan' ? `Reconnect LAN Room (${roomCode})` : `Connect to LAN Room (${roomCode || 'ROOM1'})`}
              </button>
            </div>
          </div>

          {/* Background Input & Multi-Instance Controller Assignment Bar */}
          <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Gamepad2 className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-white">
                  Background Input &amp; Unfocused 60Hz Execution
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5 max-w-md">
                  Keeps emulation running at full 60fps and accepts Gamepad / Controller input even when this window is unfocused—essential when playing 2-player on one PC.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={system.settings.gamepadIndex}
                onChange={(e) => {
                  system.settings.gamepadIndex = Number(e.target.value);
                  system.saveInputSettingsToStorage();
                  setTick((t) => t + 1);
                  onUpdate();
                }}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 font-mono"
                title="Assign specific controller to this emulator instance"
              >
                <option value={-1}>Controller: Auto (Instance #{link.instanceNumber})</option>
                <option value={0}>Controller #1 (Pad 0)</option>
                <option value={1}>Controller #2 (Pad 1)</option>
                <option value={2}>Controller #3 (Pad 2)</option>
                <option value={3}>Controller #4 (Pad 3)</option>
              </select>

              <button
                onClick={() => {
                  system.settings.backgroundInput = !system.settings.backgroundInput;
                  system.saveInputSettingsToStorage();
                  setTick((t) => t + 1);
                  onUpdate();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  system.settings.backgroundInput
                    ? 'bg-emerald-600/25 border-emerald-500/50 text-emerald-300'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                }`}
              >
                Background Input: {system.settings.backgroundInput ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* Live SM8521 Hardware Link Telemetry */}
          <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <span>SM8521 Serial UART &amp; Port 3 Crossover Telemetry</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (link.mode === 'loopback') {
                      link.disconnect();
                    } else {
                      link.connectLoopback();
                    }
                  }}
                  className={`px-2 py-1 rounded text-[10px] font-mono border transition-colors ${
                    link.mode === 'loopback'
                      ? 'bg-purple-600/30 border-purple-400 text-purple-200'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {link.mode === 'loopback' ? 'Loopback Active' : 'Self-Test Loopback'}
                </button>
                <button
                  onClick={() => {
                    link.resetCounters();
                    setTick((t) => t + 1);
                  }}
                  className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white"
                  title="Reset Counters"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800">
                <div className="text-[10px] text-zinc-500">P3 ($0017) HANDSHAKE</div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-zinc-300">OUT[1:0]:</span>
                  <span className="text-emerald-400 font-bold">
                    {p3LocalOut.toString(2).padStart(2, '0')}b
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">IN [3:2]:</span>
                  <span className="text-sky-400 font-bold">
                    {p3RemoteIn.toString(2).padStart(2, '0')}b
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800">
                <div className="text-[10px] text-zinc-500">UART REGS ($002D-$002E)</div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-zinc-300">URTS:</span>
                  <span className="text-amber-300 font-bold">
                    ${urts.toString(16).toUpperCase().padStart(2, '0')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">URTC:</span>
                  <span className="text-amber-300 font-bold">
                    ${urtc.toString(16).toUpperCase().padStart(2, '0')}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800">
                <div className="text-[10px] text-zinc-500">TX BYTES ($002B URTT)</div>
                <div className="mt-1 text-base font-bold text-emerald-400">
                  {link.txBytes}
                </div>
                <div className="text-[10px] text-zinc-400">
                  Last:{' '}
                  {link.lastTxByte !== null
                    ? `$${link.lastTxByte.toString(16).toUpperCase().padStart(2, '0')}`
                    : '--'}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800">
                <div className="text-[10px] text-zinc-500">RX BYTES ($002C URTR)</div>
                <div className="mt-1 text-base font-bold text-sky-400">
                  {link.rxBytes}
                </div>
                <div className="text-[10px] text-zinc-400">
                  Last:{' '}
                  {link.lastRxByte !== null
                    ? `$${link.lastRxByte.toString(16).toUpperCase().padStart(2, '0')}`
                    : '--'}
                </div>
              </div>
            </div>
          </div>

          {/* Compatible Compete.Com Games Reference */}
          <div className="p-4 rounded-xl bg-zinc-950/50 border border-zinc-800/80">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-xs font-bold text-zinc-300">
                Compatible Compete.Com™ Two-Player Games &amp; Instructions
              </div>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('roms/compete_test.bin');
                    if (res.ok) {
                      const blob = await res.blob();
                      const file = new File([blob], 'compete_test.bin', {
                        type: 'application/octet-stream'
                      });
                      await system.loadRomFromFile(file, 1);
                      onUpdate();
                      onClose();
                    }
                  } catch {
                    // Ignore fetch error
                  }
                }}
                className="px-2.5 py-1 rounded-md bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold transition-colors cursor-pointer"
                title="Boot built-in Compete.Com Link Diagnostic Cartridge (compete_test.bin) in Slot 1"
              >
                Boot Link Test ROM (compete_test.bin)
              </button>
            </div>
            <p className="text-xs text-zinc-400 mb-2">
              1. Connect both emulator instances above until status shows <strong>Compete.Com Cable Linked</strong>.{' '}
              2. Load the same game ROM into both instances. 3. Select <strong>2 Players / Compete</strong> on both screens.
            </p>
            <p className="text-[11px] text-amber-300/90 mb-2.5">
              Note: Compete.Com Link Multiplayer runs in <strong>Softcore (Casual) Mode</strong> only, and Instance #2 uses its own isolated NVRAM file so Player 1 &amp; Player 2 saves and scores never overwrite each other.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {COMPETE_COMPATIBLE_GAMES.map((game) => (
                <span
                  key={game.title}
                  className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300"
                  title={`${game.mode} — ${game.notes}`}
                >
                  {game.title} <span className="text-zinc-500 font-mono text-[10px]">({game.gameId})</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between">
          <span className="text-[11px] text-zinc-500 font-mono">
            BIOS UART ISR: $3D0E (Bank 2) • Syscalls $3C–$40 (Bank 5)
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
