import React, { useEffect, useState } from 'react';
import { X, Radio, PhoneOff, Send, RefreshCw } from 'lucide-react';
import { GameComSystem } from '../emulator/gamecomSystem';

interface VirtualModemModalProps {
  system: GameComSystem;
  onClose: () => void;
  onUpdate: () => void;
}

export const VirtualModemModal: React.FC<VirtualModemModalProps> = ({
  system,
  onClose,
  onUpdate
}) => {
  const modem = system.virtualModem;
  const [, setTick] = useState(0);
  const [wsUrlInput, setWsUrlInput] = useState(modem.customWsUrl);
  const [sendInput, setSendInput] = useState('');

  useEffect(() => {
    modem.setOnStateChange(() => setTick((t) => t + 1));
    const timer = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => {
      window.clearInterval(timer);
    };
  }, [modem]);

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendInput) return;
    modem.queueRxString(`${sendInput}\r\n`, 1);
    setSendInput('');
    onUpdate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold">Virtual Hayes AT Modem (Internet Cart)</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs">
          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5">
            <div>
              <div className="font-medium text-zinc-200">
                Status:{' '}
                <span
                  className={
                    !modem.enabled
                      ? 'text-zinc-400'
                      : modem.state === 'connected'
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                  }
                >
                  {!modem.enabled
                    ? 'Disabled'
                    : modem.state === 'connected'
                      ? `Connected 9600/ARQ (${modem.dialedNumber || 'Virtual BBS'})`
                      : 'Ready (Hayes AT Command Mode)'}
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                TX: {modem.txBytes} B &middot; RX: {modem.rxBytes} B
              </div>
            </div>
            <div className="flex items-center gap-2">
              {modem.state === 'connected' && (
                <button
                  type="button"
                  onClick={() => {
                    modem.hangUp();
                    onUpdate();
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-rose-600/90 px-2.5 py-1.5 font-medium text-white hover:bg-rose-500"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                  Hang Up
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  modem.enabled = !modem.enabled;
                  setTick((t) => t + 1);
                  onUpdate();
                }}
                className={`rounded-md px-2.5 py-1.5 font-medium ${
                  modem.enabled
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
                }`}
              >
                {modem.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-zinc-400">
              Optional WebSocket-to-Telnet/BBS Bridge URL (leave blank for built-in Cub Spiele.Com BBS)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={wsUrlInput}
                onChange={(e) => setWsUrlInput(e.target.value)}
                placeholder="ws://localhost:8080"
                className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  modem.customWsUrl = wsUrlInput.trim();
                  setTick((t) => t + 1);
                  onUpdate();
                }}
                className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 font-medium text-zinc-200 hover:bg-zinc-700"
              >
                Apply
              </button>
            </div>
          </div>

          <form onSubmit={handleSendText} className="space-y-1.5">
            <label className="block text-[11px] font-medium text-zinc-400">
              Send Text to Game.Com Terminal (UART RX)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={sendInput}
                onChange={(e) => setSendInput(e.target.value)}
                placeholder="Type text to display on Game.Com screen..."
                className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-md bg-zinc-800 border border-zinc-700 px-3 py-1.5 font-medium text-zinc-200 hover:bg-zinc-700"
              >
                <Send className="w-3.5 h-3.5" />
                Send
              </button>
            </div>
          </form>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-zinc-400">AT / Serial Activity Log</span>
              <button
                type="button"
                onClick={() => {
                  modem.reset();
                  setTick((t) => t + 1);
                }}
                className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200"
              >
                <RefreshCw className="w-3 h-3" />
                Reset Modem
              </button>
            </div>
            <div className="h-36 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2 font-mono text-[11px] space-y-1">
              {modem.log.length === 0 ? (
                <div className="text-zinc-600">
                  Waiting for AT commands from Internet (USA) cartridge (e.g. ATZ, ATDT)...
                </div>
              ) : (
                modem.log.map((entry) => (
                  <div key={entry.id} className="break-all">
                    <span
                      className={
                        entry.dir === 'tx'
                          ? 'text-sky-400'
                          : entry.dir === 'rx'
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                      }
                    >
                      [{entry.dir.toUpperCase()}]
                    </span>{' '}
                    <span className="text-zinc-300">{entry.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
