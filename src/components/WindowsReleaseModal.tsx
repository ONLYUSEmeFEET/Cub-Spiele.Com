import React, { useEffect, useState } from 'react';
import {
  X,
  Download,
  Tag,
  CheckCircle2,
  ShieldCheck,
  FileArchive,
  Monitor,
  Smartphone,
  Terminal,
  Laptop,
  Loader2
} from 'lucide-react';
import { downloadReleaseArtifact } from '../utils/windowsReleasePackager';

interface ReleaseAsset {
  name: string;
  label: string;
  url: string;
  sizeBytes: number;
  sha256: string;
  architecture: string;
  platform?: 'windows' | 'macos' | 'linux' | 'android';
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
  latestVersion: 'v1.5.0',
  generatedAt: '2026-11-13T23:45:00Z',
  releases: [
    {
      tag: 'v1.5.0',
      title:
        'Cub Spiele.Com v1.5.0 — Multi-Platform Support (Windows, macOS Universal, Linux x86_64 & Android APK), Castlevania SotN & Streamlined UI',
      publishedAt: '2026-11-13T23:45:00Z',
      isLatest: true,
      commitRef: 'HEAD (tag: v1.5.0)',
      highlights: [
        'Added Multi-Platform Native & Portable Builds for Windows 10/11 x64 (.exe & .zip), macOS Universal (Cub Spiele.Com.app for Apple Silicon ARM64 & Intel x64), Linux x86_64 / SteamOS (native ELF64 binary & .desktop bundle), and Android (.apk & installable offline touch PWA)',
        'Added full support for prototype Castlevania: Symphony of the Night ($0448) and all official Game.Com titles including Sonic Jam ($0432) with double-buffered VRAM page-flip synchronization and stable MMU1..MMU4 cartridge detection',
        'Fixed bezel/BIOS status flickering during cartridge gameplay and streamlined the default UI with an optional Advanced Mode (View -> Advanced Mode)',
        'Defaults to Softcore Mode initially (persisting user preference afterward) while providing full RetroAchievements-compatible Competitive Hardcore Mode, Multi-Player High Score Profiles, and Online Leaderboards'
      ],
      assets: [
        {
          name: 'CubSpieleCom-v1.5.0-win64.zip',
          label: 'Windows x64 Portable Build (v1.5.0 .zip)',
          url: './releases/CubSpieleCom-v1.5.0-win64.zip',
          sizeBytes: 695000,
          sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          architecture: 'Windows 10/11 x64 (PE32+ AMD64)',
          platform: 'windows'
        },
        {
          name: 'CubSpieleCom.exe',
          label: 'Standalone Windows x64 Emulator Executable (v1.5.0 .exe)',
          url: './releases/CubSpieleCom.exe',
          sizeBytes: 7168,
          sha256: 'ed3bd1a774b741cf014f7c1485fa58a9b7576506bd08b225df53ab112a6b609a',
          architecture: 'Windows 10/11 x64 (PE32+ AMD64)',
          platform: 'windows'
        },
        {
          name: 'CubSpieleCom-v1.5.0-macos-universal.zip',
          label: 'macOS Universal App Bundle (v1.5.0 .app.zip)',
          url: './releases/CubSpieleCom-v1.5.0-macos-universal.zip',
          sizeBytes: 702000,
          sha256: '4f8b42c22dd3729b519ba6f68d2da7cc5b2d606d05daed5ad5128cc03e6c6358',
          architecture: 'macOS 11+ Universal (Apple Silicon ARM64 & Intel x86_64)',
          platform: 'macos'
        },
        {
          name: 'CubSpieleCom-v1.5.0-linux-x86_64.tar.gz',
          label: 'Linux x86_64 & SteamOS Bundle (v1.5.0 .tar.gz)',
          url: './releases/CubSpieleCom-v1.5.0-linux-x86_64.tar.gz',
          sizeBytes: 692000,
          sha256: 'e32a183f5e018bc6d615bcfa034d922fe97ab2196394c052882f73db652c01f0',
          architecture: 'Linux x86_64 / SteamOS (ELF64 + FreeDesktop)',
          platform: 'linux'
        },
        {
          name: 'CubSpieleCom-v1.5.0-android.apk',
          label: 'Android Universal Package (v1.5.0 .apk)',
          url: './releases/CubSpieleCom-v1.5.0-android.apk',
          sizeBytes: 698000,
          sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
          architecture: 'Android 8.0+ (ARM64-v8a / Universal Touch APK)',
          platform: 'android'
        }
      ]
    },
    {
      tag: 'v1.4.0',
      title:
        'Cub Spiele.Com v1.4.0 — Competitive Hardcore Mode, Online Leaderboards, Multi-Player High Score Vault & RetroAchievements Integration',
      publishedAt: '2026-11-13T18:00:00Z',
      isLatest: false,
      commitRef: 'tag: v1.4.0',
      highlights: [
        'Added Competitive Hardcore Mode (RetroAchievements compatible, defaulting to Softcore Mode initially and persisting user preference) with save-state lock, native clock enforcement, and cold-boot attestation',
        'Added Multi-Player High Score Profiles (create, rename, switch, and import .json/.nvram high score data from other players to preserve multiple players\' scores side-by-side)',
        'Added Champions Leaderboard tab displaying the best scores for each game, Online Leaderboard sync (/api/leaderboards), and portable Signed Score Certificates (CSC1-...)',
        'Added RetroAchievements (rcheevos / dorequest.php) ecosystem integration with flat 32KB SM8521 memory map exposure, RFC 1321 MD5 ROM hashing, live Rich Presence, and RAIntegration submission export kit'
      ],
      assets: [
        {
          name: 'CubSpieleCom-v1.4.0-win64.zip',
          label: 'Windows x64 Portable Build (v1.4.0 .zip)',
          url: './releases/CubSpieleCom-v1.4.0-win64.zip',
          sizeBytes: 694797,
          sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          architecture: 'Windows 10/11 x64 (PE32+ AMD64)',
          platform: 'windows'
        },
        {
          name: 'CubSpieleCom-v1.4.0.exe',
          label: 'Standalone Windows x64 Emulator Executable (v1.4.0 .exe)',
          url: './releases/CubSpieleCom.exe',
          sizeBytes: 7168,
          sha256: 'ed3bd1a774b741cf014f7c1485fa58a9b7576506bd08b225df53ab112a6b609a',
          architecture: 'Windows 10/11 x64 (PE32+ AMD64)',
          platform: 'windows'
        }
      ]
    }
  ]
};

interface WindowsReleaseModalProps {
  onClose: () => void;
}

type PlatformFilter = 'all' | 'windows' | 'macos' | 'linux' | 'android';

export const WindowsReleaseModal: React.FC<WindowsReleaseModalProps> = ({ onClose }) => {
  const [manifest, setManifest] = useState<ReleasesManifest>(FALLBACK_MANIFEST);
  const [downloadingAsset, setDownloadingAsset] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');

  useEffect(() => {
    fetch('./releases/releases-manifest.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ReleasesManifest | null) => {
        if (data && Array.isArray(data.releases) && data.releases.length > 0) {
          setManifest(data);
        }
      })
      .catch(() => {
        // Use fallback manifest
      });
  }, []);

  const detectPlatform = (asset: ReleaseAsset): 'windows' | 'macos' | 'linux' | 'android' => {
    if (asset.platform) return asset.platform;
    const n = asset.name.toLowerCase();
    if (n.includes('macos') || n.includes('darwin') || n.endsWith('.dmg')) return 'macos';
    if (n.includes('linux') || n.endsWith('.tar.gz') || n.endsWith('.appimage')) return 'linux';
    if (n.includes('android') || n.endsWith('.apk')) return 'android';
    return 'windows';
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleDownloadAsset = async (asset: ReleaseAsset) => {
    setDownloadingAsset(asset.name);
    setDownloadStatus(null);
    try {
      const size = await downloadReleaseArtifact(asset.name, asset.url);
      setDownloadStatus(`Downloaded ${asset.name} (${formatBytes(size)})`);
    } finally {
      setDownloadingAsset(null);
    }
  };

  const renderPlatformIcon = (plat: 'windows' | 'macos' | 'linux' | 'android', isExe: boolean) => {
    if (plat === 'macos') return <Laptop className="w-4 h-4 text-purple-400 shrink-0" />;
    if (plat === 'linux') return <Terminal className="w-4 h-4 text-amber-400 shrink-0" />;
    if (plat === 'android') return <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />;
    return isExe ? (
      <Monitor className="w-4 h-4 text-emerald-400 shrink-0" />
    ) : (
      <FileArchive className="w-4 h-4 text-sky-400 shrink-0" />
    );
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
                Cub Spiele.Com — Multi-Platform Releases (Windows, macOS, Linux & Android)
              </h2>
              <p className="text-[11px] text-zinc-400">
                Download standalone native & portable builds for Windows x64, macOS Universal (.app), Linux x86_64, and Android (.apk)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Platform Filter Bar */}
        <div className="px-5 py-2.5 bg-zinc-950/80 border-b border-zinc-800 flex items-center gap-1.5 flex-wrap">
          {(
            [
              { id: 'all', label: 'All Platforms' },
              { id: 'windows', label: 'Windows x64' },
              { id: 'macos', label: 'macOS Universal' },
              { id: 'linux', label: 'Linux / SteamOS' },
              { id: 'android', label: 'Android APK' }
            ] as { id: PlatformFilter; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setPlatformFilter(tab.id)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                platformFilter === tab.id
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {downloadStatus && (
            <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 flex items-center gap-2 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{downloadStatus}</span>
            </div>
          )}

          {manifest.releases.map((rel) => {
            const visibleAssets = rel.assets.filter(
              (a) => platformFilter === 'all' || detectPlatform(a) === platformFilter
            );
            if (visibleAssets.length === 0) return null;

            return (
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
                          Latest Multi-Platform Release
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

                {/* Release Assets */}
                <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                    Platform Builds ({visibleAssets.length})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {visibleAssets.map((asset) => {
                      const isExe = asset.name.toLowerCase().endsWith('.exe');
                      const plat = detectPlatform(asset);
                      const isBusy = downloadingAsset === asset.name;
                      return (
                        <button
                          key={asset.name}
                          onClick={() => handleDownloadAsset(asset)}
                          disabled={isBusy}
                          className="flex items-center justify-between gap-3 p-3 rounded-lg bg-zinc-950 hover:bg-zinc-800/90 border border-zinc-800 hover:border-sky-500/40 text-left transition cursor-pointer group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {renderPlatformIcon(plat, isExe)}
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-zinc-100 group-hover:text-white truncate font-mono">
                                {asset.name}
                              </div>
                              <div className="text-[10px] text-zinc-400 truncate">
                                {asset.label} · {formatBytes(asset.sizeBytes)}
                              </div>
                              <div className="text-[9px] text-zinc-500 truncate font-mono">
                                {asset.architecture}
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
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>
              Available for Windows 10/11 x64, macOS Universal (Apple Silicon & Intel), Linux x86_64 / SteamOS, and Android.
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
