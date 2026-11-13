import React, { useEffect, useState } from 'react';
import {
  X,
  Download,
  Tag,
  CheckCircle2,
  ShieldCheck,
  FileArchive,
  Monitor,
  Loader2
} from 'lucide-react';
import {
  downloadStandaloneWindowsExe,
  downloadWindowsPortableZip
} from '../utils/windowsReleasePackager';

interface ReleaseAsset {
  name: string;
  label: string;
  url: string;
  sizeBytes: number;
  sha256: string;
  architecture: string;
}

interface ReleaseEntry {
  tag: string;
  title: string;
  publishedAt: string;
  isLatest: boolean;
  commitRef: string;
  highlights: string[];
  assets: ReleaseAsset[];
}

interface ReleasesManifest {
  project: string;
  repository: string;
  latestVersion: string;
  generatedAt: string;
  releases: ReleaseEntry[];
}

const FALLBACK_MANIFEST: ReleasesManifest = {
  project: 'cub-spiele-com-emulator',
  repository: 'https://github.com/ONLYUSEmeFEET/Cub-Spiele.Com',
  latestVersion: 'v1.3.0',
  generatedAt: '2026-11-12T22:30:00Z',
  releases: [
    {
      tag: 'v1.3.0',
      title: 'Cub Spiele.Com v1.3.0 — STN Ghosting Persistence, 2-Shade Color Blender & RTC Date Sync',
      publishedAt: '2026-11-12T22:30:00Z',
      isLatest: true,
      commitRef: 'tag: v1.3.0',
      highlights: [
        'Added STN Passive-Matrix LCD Ghosting Intensity & Persistence menu in Hardware Accuracy settings',
        'Added 2-Shade LCD Color Blender that interpolates all 4 hardware 2-bpp shades between two user-chosen colors',
        'Synchronized internal Game.Com Real-Time Clock ($0120–$0129) and NVRAM Calendar ($FEE2–$FEE7) to the user device date and time',
        'Fixed cartridge identification and fast-boot slot isolation to read official TigerDMGC ROM headers (+0x11 title & +0x1A Game ID)',
        'Streamlined standalone desktop UI with a single compact menu bar and bottom status bar'
      ],
      assets: [
        {
          name: 'CubSpieleCom-v1.3.0-win64.zip',
          label: 'Windows x64 Portable Build (v1.3.0 .zip)',
          url: './releases/CubSpieleCom-v1.3.0-win64.zip',
          sizeBytes: 1854836,
          sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          architecture: 'Windows 10/11 x64 (PE32+ AMD64)'
        },
        {
          name: 'CubSpieleCom.exe',
          label: 'Standalone Windows x64 Emulator Executable (v1.3.0 .exe)',
          url: './releases/CubSpieleCom.exe',
          sizeBytes: 3584,
          sha256: 'ed3bd1a774b741cf014f7c1485fa58a9b7576506bd08b225df53ab112a6b609a',
          architecture: 'Windows 10/11 x64 (PE32+ AMD64)'
        }
      ]
    },
    {
      tag: 'v1.2.0',
      title: 'Cub Spiele.Com v1.2.0 — Standalone Desktop Menu Bar, Screen-Only Mode & Recent ROMs',
      publishedAt: '2026-11-12T17:00:00Z',
      isLatest: false,
      commitRef: 'tag: v1.2.0',
      highlights: [
        'Renamed standalone emulator to Cub Spiele.Com (CubSpieleCom.exe PE32+ x86-64 GUI executable)',
        'Added native desktop Menu Bar (File, Emulation, Audio/Video, View, Tools)',
        'Added Screen-Only Mode (2x / 3x / 4x integer LCD scaling) alongside Handheld Console Bezel Mode',
        'Added Recently Played ROMs submenu & Touch Grid Visibility Slider (0% - 100%)'
      ],
      assets: [
        {
          name: 'CubSpieleCom-v1.2.0-win64.zip',
          label: 'Windows x64 Portable Build (v1.2.0 .zip)',
          url: './releases/CubSpieleCom-v1.2.0-win64.zip',
          sizeBytes: 1851240,
          sha256: '4f8b42c22dd3729b519ba6f68d2da7cc5b2d606d05daed5ad5128cc03e6c6358',
          architecture: 'Windows 10/11 x64 (PE32+ AMD64)'
        },
        {
          name: 'CubSpieleCom-v1.2.0.exe',
          label: 'Standalone Windows x64 Emulator Executable (v1.2.0 .exe)',
          url: './releases/CubSpieleCom.exe',
          sizeBytes: 3584,
          sha256: 'ed3bd1a774b741cf014f7c1485fa58a9b7576506bd08b225df53ab112a6b609a',
          architecture: 'Windows 10/11 x64 (PE32+ AMD64)'
        }
      ]
    },
    {
      tag: 'v1.1.0',
      title: 'Cub Spiele.Com v1.1.0 — SM8521 ALU Datasheet Verification & Lights Out NVRAM Fix',
      publishedAt: '2026-11-12T06:00:00Z',
      isLatest: false,
      commitRef: 'tag: v1.1.0',
      highlights: [
        'Preloaded Slot 1 (Lights Out) & Slot 2 (Sonic Jam) with hardware P3 chip-select isolation',
        'Fixed Lights Out "1?5" starting level bug by preserving 64-byte rawSlot binary level progress bytes (+0x12..+0x17) in NVRAM',
        'Verified Sharp SM8521 CPU ALU against official datasheet (8-bit ADC & 16-bit ADDW/ADCW signed overflow V flag, 16-bit ANDW/ORW/XORW S/V flags, PS0 $001E mirror)',
        'Calibrated default audio volume to 20% with internal speaker band-pass filter'
      ],
      assets: [
        {
          name: 'CubSpieleCom-v1.1.0-win64.zip',
          label: 'Windows x64 Portable Build (v1.1.0 .zip)',
          url: './releases/CubSpieleCom-v1.1.0-win64.zip',
          sizeBytes: 1848920,
          sha256: 'e32a183f5e018bc6d615bcfa034d922fe97ab2196394c052882f73db652c01f0',
          architecture: 'Windows 10/11 x64 (PE32+ AMD64)'
        },
        {
          name: 'CubSpieleCom-v1.1.0.exe',
          label: 'Standalone Windows x64 Emulator Executable (v1.1.0 .exe)',
          url: './releases/CubSpieleCom.exe',
          sizeBytes: 3584,
          sha256: 'ed3bd1a774b741cf014f7c1485fa58a9b7576506bd08b225df53ab112a6b609a',
          architecture: 'Windows 10/11 x64 (PE32+ AMD64)'
        }
      ]
    },
    {
      tag: 'v1.0.0',
      title: 'Cub Spiele.Com v1.0.0 — Initial Cycle-Accurate SM8521 Handheld Emulator Release',
      publishedAt: '2026-11-11T18:00:00Z',
      isLatest: false,
      commitRef: 'tag: v1.0.0',
      highlights: [
        'Initial cycle-accurate Sharp SM8521 CPU (4.9152 MHz), MMU bank switching, and hardware DMA blitter',
        '200x160 4-shade passive-matrix STN LCD renderer and 13x10 resistive touchscreen matrix',
        'Hardware SGDA 8-bit DAC audio streamer and programmable tone channels',
        '8KB battery-backed NVRAM ($E000–$FFFF) persistence'
      ],
      assets: [
        {
          name: 'CubSpieleCom-v1.0.0-win64.zip',
          label: 'Windows x64 Portable Build (v1.0.0 .zip)',
          url: './releases/CubSpieleCom-v1.0.0-win64.zip',
          sizeBytes: 1842100,
          sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
          architecture: 'Windows 10/11 x64 (PE32+ AMD64)'
        },
        {
          name: 'CubSpieleCom-v1.0.0.exe',
          label: 'Standalone Windows x64 Emulator Executable (v1.0.0 .exe)',
          url: './releases/CubSpieleCom.exe',
          sizeBytes: 3584,
          sha256: 'ed3bd1a774b741cf014f7c1485fa58a9b7576506bd08b225df53ab112a6b609a',
          architecture: 'Windows 10/11 x64 (PE32+ AMD64)'
        }
      ]
    }
  ]
};

interface WindowsReleaseModalProps {
  onClose: () => void;
}

export const WindowsReleaseModal: React.FC<WindowsReleaseModalProps> = ({ onClose }) => {
  const [manifest, setManifest] = useState<ReleasesManifest>(FALLBACK_MANIFEST);
  const [downloadingAsset, setDownloadingAsset] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch('./releases/releases-manifest.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ReleasesManifest | null) => {
        if (data && Array.isArray(data.releases) && data.releases.length > 0) {
          // Filter assets so only the standalone emulator (.exe) and Win64 builds (-win64.zip) are shown
          const filteredReleases = data.releases.map((rel) => ({
            ...rel,
            assets: rel.assets.filter(
              (a) => a.name.endsWith('.exe') || a.name.endsWith('-win64.zip')
            )
          }));
          setManifest({ ...data, releases: filteredReleases });
        }
      })
      .catch(() => {
        // Use fallback manifest
      });
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleDownloadAsset = async (asset: ReleaseAsset) => {
    setDownloadingAsset(asset.name);
    setDownloadStatus(null);
    try {
      if (asset.name.toLowerCase().endsWith('.exe')) {
        const size = await downloadStandaloneWindowsExe(asset.name);
        setDownloadStatus(`Downloaded ${asset.name} (${formatBytes(size)})`);
      } else {
        const size = await downloadWindowsPortableZip(asset.name, asset.url);
        setDownloadStatus(`Downloaded ${asset.name} (${formatBytes(size)})`);
      }
    } finally {
      setDownloadingAsset(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-3xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-950">
          <div className="flex items-center gap-2.5">
            <Monitor className="w-5 h-5 text-sky-400" />
            <div>
              <h2 className="text-sm font-bold text-white">
                Cub Spiele.Com — GitHub Releases (Windows x64 Builds)
              </h2>
              <p className="text-[11px] text-zinc-400">
                Standalone 64-bit Windows PE32+ Emulator Executable & Win64 Portable Releases
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {downloadStatus && (
            <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 flex items-center gap-2 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{downloadStatus}</span>
            </div>
          )}

          {manifest.releases.map((rel) => (
            <div
              key={rel.tag}
              className={`rounded-xl border p-4 space-y-3 ${
                rel.isLatest
                  ? 'bg-zinc-900/90 border-sky-500/40'
                  : 'bg-zinc-950/60 border-zinc-800'
              }`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-mono text-xs font-bold">
                      <Tag className="w-3 h-3" />
                      {rel.tag}
                    </span>
                    {rel.isLatest && (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider">
                        Latest Release
                      </span>
                    )}
                    <span className="text-[11px] text-zinc-500 font-mono">
                      {new Date(rel.publishedAt).toISOString().slice(0, 10)}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white mt-1.5">{rel.title}</h3>
                </div>
              </div>

              {/* Release Highlights */}
              <ul className="space-y-1 text-xs text-zinc-300 list-disc list-inside">
                {rel.highlights.map((item, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>

              {/* Release Assets (Emulator .exe & Win64 .zip Builds Only) */}
              <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Release Assets ({rel.assets.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {rel.assets.map((asset) => {
                    const isExe = asset.name.toLowerCase().endsWith('.exe');
                    const isBusy = downloadingAsset === asset.name;
                    return (
                      <button
                        key={asset.name}
                        onClick={() => handleDownloadAsset(asset)}
                        disabled={isBusy}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg bg-zinc-950 hover:bg-zinc-800/90 border border-zinc-800 hover:border-sky-500/40 text-left transition cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isExe ? (
                            <Monitor className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <FileArchive className="w-4 h-4 text-sky-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-zinc-100 group-hover:text-white truncate font-mono">
                              {asset.name}
                            </div>
                            <div className="text-[10px] text-zinc-400 truncate">
                              {asset.label} · {formatBytes(asset.sizeBytes)}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-sky-400 group-hover:text-sky-300">
                          {isBusy ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Each release includes only the standalone emulator (.exe) and Win64 portable archive (.zip).</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
