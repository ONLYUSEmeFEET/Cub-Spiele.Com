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
  Laptop,
  Loader2
} from 'lucide-react';
import { downloadReleaseArtifact } from '../utils/windowsReleasePackager';
import { APP_VERSION_TAG } from '../version';

interface ReleaseAsset {
  name: string;
  label: string;
  url: string;
  sizeBytes: number;
  sha256: string;
  architecture: string;
  platform?: 'windows' | 'macos' | 'android';
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
  latestVersion: APP_VERSION_TAG,
  generatedAt: '2026-11-15T04:12:00Z',
  releases: [
    {
      tag: APP_VERSION_TAG,
      title: `Cub Spiele.Com ${APP_VERSION_TAG} — Dedicated Display Menu, Compact View Submenus, LCD Sliders & Tools Reorganization`,
      publishedAt: '2026-11-15T04:12:00Z',
      isLatest: true,
      commitRef: `HEAD (tag: ${APP_VERSION_TAG})`,
      highlights: [
        'Added dedicated Display menu in TopBar consolidating Screen Color Presets, Custom Screen Colors, LCD Contrast (0%–100%), LCD Ghosting (0%–100%), and LCD Pixel Grid',
        'Compacted View menu into flyout submenus (Screen Size, Touch Layout Size, Overlays) and removed redundant display controls from Settings',
        'Moved Advanced Mode toggle into Tools above Advanced Tools, with self-contained 810 KB Windows EXE, .zip ROM loading, Touch scaling, and About dialog'
      ],
      assets: [
        {
          name: `CubSpieleCom-${APP_VERSION_TAG}-win64.zip`,
          label: `Windows x64 Portable Build (${APP_VERSION_TAG} .zip)`,
          url: `./releases/CubSpieleCom-${APP_VERSION_TAG}-win64.zip`,
          sizeBytes: 790000,
          sha256: '',
          architecture: 'Windows 10/11 x64 (PE32+ AMD64)',
          platform: 'windows'
        },
        {
          name: 'CubSpieleCom.exe',
          label: `Self-Contained Windows x64 Executable (${APP_VERSION_TAG} .exe)`,
          url: './releases/CubSpieleCom.exe',
          sizeBytes: 805000,
          sha256: '',
          architecture: 'Windows 10/11 x64 (PE32+ Self-Contained)',
          platform: 'windows'
        },
        {
          name: `CubSpieleCom-${APP_VERSION_TAG}-macos-universal.zip`,
          label: `macOS Universal App Bundle (${APP_VERSION_TAG} .app.zip)`,
          url: `./releases/CubSpieleCom-${APP_VERSION_TAG}-macos-universal.zip`,
          sizeBytes: 790000,
          sha256: '',
          architecture: 'macOS 11+ Universal (Apple Silicon ARM64 & Intel x86_64)',
          platform: 'macos'
        },
        {
          name: `CubSpieleCom-${APP_VERSION_TAG}-android.apk`,
          label: `Android Universal Package (${APP_VERSION_TAG} .apk)`,
          url: `./releases/CubSpieleCom-${APP_VERSION_TAG}-android.apk`,
          sizeBytes: 785000,
          sha256: '',
          architecture: 'Android 8.0+ (ARM64-v8a / Universal Touch APK)',
          platform: 'android'
        },
        {
          name: 'compete_test.bin',
          label: 'Compete.Com 2-Player Link Diagnostic Cartridge ROM (compete_test.bin)',
          url: './releases/compete_test.bin',
          sizeBytes: 32768,
          sha256: '',
          architecture: 'Game.Com SM8521 Cartridge ROM (32 KB — All Platforms)',
          platform: 'windows'
        }
      ]
    },
    {
      tag: 'v0.0.7',
      title:
        'Cub Spiele.Com v0.0.7 — Screen-Only Default, Touch View, Tiger Game.Com Palette & Light/Dark Mode',
      publishedAt: '2026-11-14T18:55:00Z',
      isLatest: false,
      commitRef: 'tag: v0.0.7',
      highlights: [
        'Defaulted View to Screen-Only Mode, simplified secondary controls into a mobile-inspired Touch View, styled with Tiger Game.Com colors, and added Light/Dark Mode',
        'Added calibrated Game.Com hardware screen presets (Original 1997 Olive Green #71-500, Pocket Pro Backlit Green #71-520, Silver Grey #71-530, Warm Amber #71-510, Crisp High Contrast, and Custom 2-Shade Color Blender)',
        'Fixed BIOS Calendar month and year header disappearing when switching months and restricted RTC host clock sync strictly to initial boot',
        'Added MIT License (LICENSE) across the repository and release packages'
      ],
      assets: [
        {
          name: 'CubSpieleCom-v0.0.7-win64.zip',
          label: 'Windows x64 Portable Build (v0.0.7 .zip)',
          url: './releases/CubSpieleCom-v0.0.7-win64.zip',
          sizeBytes: 790000,
          sha256: '',
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

type PlatformFilter = 'all' | 'windows' | 'macos' | 'android';

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

  const detectPlatform = (asset: ReleaseAsset): 'windows' | 'macos' | 'android' => {
    if (asset.platform) return asset.platform;
    const n = asset.name.toLowerCase();
    if (n.includes('macos') || n.includes('darwin') || n.endsWith('.dmg')) return 'macos';
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

  const renderPlatformIcon = (plat: 'windows' | 'macos' | 'android', isExe: boolean) => {
    if (plat === 'macos') return <Laptop className="w-4 h-4 text-purple-400 shrink-0" />;
    if (plat === 'android') return <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />;
    return isExe ? (
      <Monitor className="w-4 h-4 text-emerald-400 shrink-0" />
    ) : (
      <FileArchive className="w-4 h-4 text-sky-400 shrink-0" />
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-xl max-w-3xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-[#f6f7f3] dark:bg-zinc-950">
          <div className="flex items-center gap-2.5">
            <Monitor className="w-5 h-5 text-[#4e3d73] dark:text-[#b39ddb]" />
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <span>Cub Spiele.Com — Multi-Platform Releases</span>
                <span className="px-1.5 py-0.5 rounded bg-[#7a1f5c]/15 dark:bg-[#7a1f5c]/30 border border-[#7a1f5c]/40 text-[#7a1f5c] dark:text-[#e68ac7] font-mono text-[10px]">
                  {manifest.latestVersion || APP_VERSION_TAG}
                </span>
              </h2>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                Download standalone native &amp; portable builds for Windows x64, macOS Universal (.app), and Android (.apk)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Platform Filter Bar */}
        <div className="px-5 py-2.5 bg-[#f6f7f3]/70 dark:bg-zinc-950/80 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-1.5 flex-wrap">
          {(
            [
              { id: 'all', label: 'All Platforms' },
              { id: 'windows', label: 'Windows x64' },
              { id: 'macos', label: 'macOS Universal' },
              { id: 'android', label: 'Android APK' }
            ] as { id: PlatformFilter; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setPlatformFilter(tab.id)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                platformFilter === tab.id
                  ? 'bg-[#7a1f5c] text-white border border-[#7a1f5c]'
                  : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-200 border border-zinc-300 dark:border-zinc-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {downloadStatus && (
            <div className="p-3 rounded-lg bg-[#4c5931]/15 dark:bg-[#4c5931]/30 border border-[#4c5931]/40 flex items-center gap-2 text-xs text-[#4c5931] dark:text-[#b9c48a]">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
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
                    ? 'bg-[#f6f7f3] dark:bg-zinc-900/90 border-[#7a1f5c]/50'
                    : 'bg-white dark:bg-zinc-950/60 border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#4e3d73]/15 dark:bg-[#4e3d73]/30 text-[#4e3d73] dark:text-[#c4b5e6] border border-[#4e3d73]/30 font-mono text-xs font-bold">
                        <Tag className="w-3 h-3" />
                        {rel.tag}
                      </span>
                      {rel.isLatest && (
                        <span className="px-2 py-0.5 rounded bg-[#4c5931]/15 dark:bg-[#4c5931]/30 text-[#4c5931] dark:text-[#b9c48a] border border-[#4c5931]/35 text-[10px] font-bold uppercase tracking-wider">
                          Latest Multi-Platform Release
                        </span>
                      )}
                      <span className="text-[11px] text-zinc-500 font-mono">
                        {new Date(rel.publishedAt).toISOString().slice(0, 10)}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white mt-1.5">{rel.title}</h3>
                  </div>
                </div>

                {/* Release Highlights */}
                <ul className="space-y-1 text-xs text-zinc-700 dark:text-zinc-300 list-disc list-inside">
                  {rel.highlights.map((item, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>

                {/* Release Assets */}
                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800/80 space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
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
                          className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800/90 border border-zinc-300 dark:border-zinc-800 hover:border-[#7a1f5c]/60 text-left transition cursor-pointer group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {renderPlatformIcon(plat, isExe)}
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-[#7a1f5c] dark:group-hover:text-white truncate font-mono">
                                {asset.name}
                              </div>
                              <div className="text-[10px] text-zinc-600 dark:text-zinc-400 truncate">
                                {asset.label} · {formatBytes(asset.sizeBytes)}
                              </div>
                              <div className="text-[9px] text-zinc-500 truncate font-mono">
                                {asset.architecture}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 text-[#7a1f5c] dark:text-[#d974b8]">
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
        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-[#f6f7f3] dark:bg-zinc-950 flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#4c5931] dark:text-[#b9c48a]" />
            <span>
              Available for Windows 10/11 x64, macOS Universal (Apple Silicon &amp; Intel), and Android.
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#7a1f5c] hover:bg-[#8e256b] text-white font-semibold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
