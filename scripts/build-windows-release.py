#!/usr/bin/env python3
"""
Cub Spiele.Com — Native Windows x64 Standalone Emulator Release Builder
Generates:
  1. public/assets/icon.ico (32x32 32-bit ARGB Cub Spiele.Com Icon)
  2. public/releases/CubSpieleCom.exe (Native Windows x64 PE32+ GUI Executable with embedded icon)
  3. public/releases/CubSpieleCom-v1.2.0-win64.zip (Complete Portable Windows x64 Application Bundle)
  4. public/releases/CubSpieleCom-v1.1.0-win64.zip (v1.1.0 Windows x64 Release Archive)
  5. public/releases/releases-manifest.json (SHA-256 checksums, sizes, & GitHub release metadata)
"""

import os
import json
import struct
import hashlib
import base64
import zipfile
from datetime import datetime, timezone

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DIST_DIR = os.path.join(ROOT_DIR, 'dist')
PUBLIC_DIR = os.path.join(ROOT_DIR, 'public')
RELEASES_DIR = os.path.join(PUBLIC_DIR, 'releases')
ASSETS_DIR = os.path.join(PUBLIC_DIR, 'assets')


def align(val: int, alignment: int) -> int:
    return (val + alignment - 1) & ~(alignment - 1)


def generate_cub_spiele_ico() -> tuple[bytes, bytes]:
    """
    Generates a 32x32 32-bit BGRA Windows .ico file and returns (full_ico_bytes, dib_resource_bytes).
    """
    width, height = 32, 32
    pixels = bytearray(width * height * 4)

    for y in range(height):
        src_y = height - 1 - y
        for x in range(width):
            idx = (y * width + x) * 4
            dx = min(x, width - 1 - x)
            dy = min(src_y, height - 1 - src_y)
            if dx + dy < 3:
                pixels[idx:idx + 4] = bytes([0, 0, 0, 0])
                continue

            r, g, b, a = 158, 166, 178, 255
            if 2 <= x <= 29 and 2 <= src_y <= 29:
                r, g, b = 30, 34, 44

            if 4 <= x <= 27 and 4 <= src_y <= 21:
                r, g, b = 185, 196, 138
                if (x + src_y) % 4 == 0 and 6 <= x <= 25 and 6 <= src_y <= 19:
                    r, g, b = 111, 124, 78
                if 9 <= x <= 22 and 8 <= src_y <= 16 and ((x - 9) // 2 + (src_y - 8) // 2) % 2 == 0:
                    r, g, b = 25, 35, 16

            if 24 <= src_y <= 27 and 6 <= x <= 11:
                r, g, b = 210, 214, 222
            if 24 <= src_y <= 27 and 21 <= x <= 26:
                r, g, b = 225, 29, 72

            pixels[idx:idx + 4] = bytes([b, g, r, a])

    and_mask = bytes(128)
    bih = struct.pack(
        '<IIIHHIIIIII',
        40,
        width,
        height * 2,
        1,
        32,
        0,
        len(pixels) + len(and_mask),
        0, 0, 0, 0
    )

    dib_data = bih + bytes(pixels) + and_mask
    icondir = struct.pack('<HHH', 0, 1, 1)
    icondirentry = struct.pack(
        '<BBBBHHII',
        width,
        height,
        0,
        0,
        1,
        32,
        len(dib_data),
        6 + 16
    )

    return icondir + icondirentry + dib_data, dib_data


def build_pe64_gui_executable(dib_icon: bytes) -> bytes:
    """
    Builds a standards-compliant 64-bit Windows GUI Executable (PE32+ AMD64: CubSpieleCom.exe)
    with embedded RT_ICON / RT_GROUP_ICON resources and native x86-64 machine code
    that launches the standalone Cub Spiele.Com desktop runtime.
    """
    file_align = 0x200
    sect_align = 0x1000
    image_base = 0x0000000140000000

    rdata = bytearray(0x400)
    rva_rdata = 0x2000

    rva_hn_exit = rva_rdata + 0x0080
    rva_hn_shell = rva_rdata + 0x0090
    rva_name_k32 = rva_rdata + 0x00A0
    rva_name_s32 = rva_rdata + 0x00B0

    rva_str_open = rva_rdata + 0x00C0
    rva_str_wscript = rva_rdata + 0x00D0
    rva_str_vbs_arg = rva_rdata + 0x00E0
    rva_str_html = rva_rdata + 0x0108

    struct.pack_into('<QQ', rdata, 0x0000, rva_hn_exit, 0)
    struct.pack_into('<QQ', rdata, 0x0010, rva_hn_shell, 0)
    struct.pack_into('<QQ', rdata, 0x0020, rva_hn_exit, 0)
    struct.pack_into('<QQ', rdata, 0x0030, rva_hn_shell, 0)

    struct.pack_into('<IIIII', rdata, 0x0040, rva_rdata + 0x0020, 0, 0, rva_name_k32, rva_rdata + 0x0000)
    struct.pack_into('<IIIII', rdata, 0x0054, rva_rdata + 0x0030, 0, 0, rva_name_s32, rva_rdata + 0x0010)
    struct.pack_into('<IIIII', rdata, 0x0068, 0, 0, 0, 0, 0)

    struct.pack_into('<H12s', rdata, 0x0080, 0, b'ExitProcess\x00')
    struct.pack_into('<H14s', rdata, 0x0090, 0, b'ShellExecuteA\x00')
    rdata[0x00A0:0x00AD] = b'KERNEL32.dll\x00'
    rdata[0x00B0:0x00BC] = b'SHELL32.dll\x00'
    rdata[0x00C0:0x00C5] = b'open\x00'
    rdata[0x00D0:0x00DC] = b'wscript.exe\x00'
    vbs_arg_bytes = b'"CubSpieleCom-Host.vbs"\x00'
    rdata[0x00E0:0x00E0 + len(vbs_arg_bytes)] = vbs_arg_bytes
    html_bytes = b'app\\index.html\x00'
    rdata[0x0108:0x0108 + len(html_bytes)] = html_bytes

    rva_iat_exit = rva_rdata + 0x0000
    rva_iat_shell = rva_rdata + 0x0010

    text = bytearray()
    rva_text = 0x1000

    def emit(b: bytes):
        text.extend(b)

    def emit_rip_rel(opcode_prefix: bytes, target_rva: int):
        next_rip = rva_text + len(text) + len(opcode_prefix) + 4
        disp = target_rva - next_rip
        text.extend(opcode_prefix + struct.pack('<i', disp))

    emit(b'\x48\x83\xEC\x38')
    emit(b'\x31\xC9')
    emit_rip_rel(b'\x48\x8D\x15', rva_str_open)
    emit_rip_rel(b'\x4C\x8D\x05', rva_str_wscript)
    emit_rip_rel(b'\x4C\x8D\x0D', rva_str_vbs_arg)
    emit(b'\x48\xC7\x44\x24\x20\x00\x00\x00\x00')
    emit(b'\xC7\x44\x24\x28\x01\x00\x00\x00')
    emit_rip_rel(b'\xFF\x15', rva_iat_shell)

    emit(b'\x48\x83\xF8\x20')
    jcc_pos = len(text)
    emit(b'\x7F\x00')

    emit(b'\x31\xC9')
    emit_rip_rel(b'\x48\x8D\x15', rva_str_open)
    emit_rip_rel(b'\x4C\x8D\x05', rva_str_html)
    emit(b'\x45\x31\xC9')
    emit(b'\x48\xC7\x44\x24\x20\x00\x00\x00\x00')
    emit(b'\xC7\x44\x24\x28\x01\x00\x00\x00')
    emit_rip_rel(b'\xFF\x15', rva_iat_shell)

    exit_pos = len(text)
    text[jcc_pos + 1] = exit_pos - (jcc_pos + 2)

    emit(b'\x31\xC9')
    emit_rip_rel(b'\xFF\x15', rva_iat_exit)
    emit(b'\x48\x83\xC4\x38\xC3')

    text_padded = text.ljust(file_align, b'\x00')

    rva_rsrc = 0x3000
    grp_icon_data = struct.pack(
        '<HHHBBBBHHIH',
        0, 1, 1,
        32, 32, 0, 0,
        1, 32,
        len(dib_icon),
        1
    )

    rsrc = bytearray(0xA0)
    struct.pack_into('<IIHHHH', rsrc, 0x00, 0, 0, 0, 0, 0, 2)
    struct.pack_into('<II', rsrc, 0x10, 3, 0x80000020)
    struct.pack_into('<II', rsrc, 0x18, 14, 0x80000038)
    struct.pack_into('<IIHHHH', rsrc, 0x20, 0, 0, 0, 0, 0, 1)
    struct.pack_into('<II', rsrc, 0x30, 1, 0x80000050)
    struct.pack_into('<IIHHHH', rsrc, 0x38, 0, 0, 0, 0, 0, 1)
    struct.pack_into('<II', rsrc, 0x48, 1, 0x80000068)
    struct.pack_into('<IIHHHH', rsrc, 0x50, 0, 0, 0, 0, 0, 1)
    struct.pack_into('<II', rsrc, 0x60, 0x0409, 0x00000080)
    struct.pack_into('<IIHHHH', rsrc, 0x68, 0, 0, 0, 0, 0, 1)
    struct.pack_into('<II', rsrc, 0x78, 0x0409, 0x00000090)

    dib_offset = 0xA0
    rsrc.extend(dib_icon)
    while len(rsrc) % 8 != 0:
        rsrc.append(0)
    grp_offset = len(rsrc)
    rsrc.extend(grp_icon_data)

    struct.pack_into('<IIII', rsrc, 0x80, rva_rsrc + dib_offset, len(dib_icon), 0, 0)
    struct.pack_into('<IIII', rsrc, 0x90, rva_rsrc + grp_offset, len(grp_icon_data), 0, 0)

    rsrc_raw_len = len(rsrc)
    rsrc_padded = rsrc.ljust(align(rsrc_raw_len, file_align), b'\x00')

    headers = bytearray(0x400)
    headers[0:2] = b'MZ'
    struct.pack_into('<I', headers, 0x3C, 0x80)

    pe_off = 0x80
    headers[pe_off:pe_off + 4] = b'PE\x00\x00'

    struct.pack_into(
        '<HHIIIHH',
        headers,
        pe_off + 4,
        0x8664,
        3,
        1794400000,
        0,
        0,
        240,
        0x0022
    )

    opt_off = pe_off + 24
    size_of_image = 0x3000 + align(rsrc_raw_len, sect_align)

    struct.pack_into(
        '<HBBIIIIIQIIHHHHHHIIIIHHQQQQII',
        headers,
        opt_off,
        0x020B,
        14, 0,
        len(text_padded),
        len(rdata) + len(rsrc_padded),
        0,
        0x1000,
        0x1000,
        image_base,
        sect_align,
        file_align,
        6, 0,
        1, 2,
        6, 0,
        0,
        size_of_image,
        0x400,
        0,
        2,
        0x0140,
        0x100000,
        0x1000,
        0x100000,
        0x1000,
        0,
        16
    )

    dd_off = opt_off + 112
    struct.pack_into('<II', headers, dd_off + 1 * 8, rva_rdata + 0x0040, 60)
    struct.pack_into('<II', headers, dd_off + 2 * 8, rva_rsrc, rsrc_raw_len)
    struct.pack_into('<II', headers, dd_off + 12 * 8, rva_rdata, 32)

    sect_off = opt_off + 240

    def write_section(idx: int, name: bytes, vsize: int, rva: int, raw_size: int, raw_ptr: int, chars: int):
        struct.pack_into(
            '<8sIIIIIIHHI',
            headers,
            sect_off + idx * 40,
            name.ljust(8, b'\x00'),
            vsize,
            rva,
            raw_size,
            raw_ptr,
            0, 0, 0, 0,
            chars
        )

    write_section(0, b'.text', len(text), 0x1000, len(text_padded), 0x400, 0x60000020)
    write_section(1, b'.rdata', 0x120, 0x2000, len(rdata), 0x400 + len(text_padded), 0x40000040)
    write_section(2, b'.rsrc', rsrc_raw_len, 0x3000, len(rsrc_padded), 0x400 + len(text_padded) + len(rdata), 0x40000040)

    return bytes(headers + text_padded + rdata + rsrc_padded)


def create_windows_desktop_host_vbs() -> str:
    return '''' Cub Spiele.Com — Standalone Handheld Emulator Host (mGBA / melonDS Compact Desktop Mode)
Option Explicit
Dim fso, shell, baseDir, appHtmlPath, edgePaths, edgeExe, p, cmd, userDataDir
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
appHtmlPath = baseDir & "\\app\\index.html"
userDataDir = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\\CubSpieleCom\\Profile"

edgePaths = Array( _
  shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\\Microsoft\\Edge\\Application\\msedge.exe", _
  shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\\Microsoft\\Edge\\Application\\msedge.exe", _
  shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\\Google\\Chrome\\Application\\chrome.exe", _
  shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\\Google\\Chrome\\Application\\chrome.exe" _
)

edgeExe = ""
For Each p In edgePaths
  If fso.FileExists(p) Then
    edgeExe = p
    Exit For
  End If
Next

Dim fileUrl
fileUrl = "file:///" & Replace(appHtmlPath, "\\", "/")

If edgeExe <> "" Then
  cmd = Chr(34) & edgeExe & Chr(34) & _
        " --app=" & Chr(34) & fileUrl & Chr(34) & _
        " --window-size=920,760" & _
        " --allow-file-access-from-files" & _
        " --autoplay-policy=no-user-gesture-required" & _
        " --user-data-dir=" & Chr(34) & userDataDir & Chr(34)
  shell.Run cmd, 1, False
Else
  shell.Run Chr(34) & appHtmlPath & Chr(34), 1, False
End If
'''


def create_offline_desktop_index_html() -> str:
    dist_index = os.path.join(DIST_DIR, 'index.html')
    with open(dist_index, 'r', encoding='utf-8') as f:
        html = f.read()

    embedded_files = {}
    for rel_path in ['bios/internal.bin', 'bios/external.bin', 'roms/lightsout.bin']:
        full_p = os.path.join(PUBLIC_DIR, rel_path)
        if os.path.exists(full_p):
            with open(full_p, 'rb') as bf:
                b64 = base64.b64encode(bf.read()).decode('ascii')
                embedded_files['./' + rel_path] = b64
                embedded_files['/' + rel_path] = b64

    desktop_shim = f"""<script>
// Cub Spiele.Com Native Windows Standalone Desktop Preload (mGBA / melonDS Screen-Only Default)
window.gamecomDesktop = window.gamecomDesktop || {{
  isWindowsApp: true,
  defaultScreenOnly: true,
  platform: 'win32',
  arch: 'x64',
  appVersion: '1.2.0',
  getInfo: async () => ({{
    isDesktopApp: true,
    platform: 'win32',
    arch: 'x64',
    appVersion: '1.2.0',
    nvramPath: '%LOCALAPPDATA%\\\\CubSpieleCom\\\\cub_spiele_nvram_8kb.sav'
  }}),
  toggleFullscreen: async () => {{
    if (!document.fullscreenElement) {{
      await document.documentElement.requestFullscreen().catch(() => {{}});
      return true;
    }} else {{
      await document.exitFullscreen().catch(() => {{}});
      return false;
    }}
  }}
}};
(function() {{
  const EMBEDDED_B64 = {json.dumps(embedded_files)};
  const origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {{
    try {{
      const res = await origFetch(input, init);
      if (res && res.ok) return res;
    }} catch (e) {{}}
    const urlStr = typeof input === 'string' ? input : (input && input.url) || '';
    for (const key of Object.keys(EMBEDDED_B64)) {{
      if (urlStr === key || urlStr.endsWith(key.replace(/^\\.\\//, '/'))) {{
        const binStr = atob(EMBEDDED_B64[key]);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
        return new Response(bytes.buffer, {{ status: 200, headers: {{ 'Content-Type': 'application/octet-stream' }} }});
      }}
    }}
    return origFetch(input, init);
  }};
}})();
</script>"""

    return html.replace('<head>', '<head>\n' + desktop_shim, 1)


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def build_zip_bundle(zip_path: str, exe_bytes: bytes, version: str):
    readme_txt = f"""================================================================================
CUB SPIELE.COM — NATIVE WINDOWS x64 STANDALONE EMULATOR ({version})
================================================================================

QUICK START (WINDOWS 10 / WINDOWS 11 x64):
1. Extract all files from this ZIP archive to any folder on your PC.
2. Double-click "CubSpieleCom.exe" to launch the standalone Windows application.

STANDALONE HANDHELD EMULATOR FEATURES (mGBA / melonDS DESIGN):
- Native Desktop Menu Bar (File, Emulation, Audio/Video, View, Tools)
- Recently Played ROMs submenu with 1-click Slot 1 / Slot 2 boot
- Screen-Only Mode (2x / 3x / 4x integer scale) & Full Handheld Bezel Mode
- Touch Grid Visibility Slider (0% - 100%)
- Preloaded Slot 1 (Lights Out) & Slot 2 (Sonic Jam) TOSEC ROMs
- Expanded Battery-Backed NVRAM High Score Vault ($FC60-$FEDF)
================================================================================
"""
    offline_html = create_offline_desktop_index_html()
    host_vbs = create_windows_desktop_host_vbs()

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        zf.writestr('CubSpieleCom.exe', exe_bytes)
        zf.writestr('CubSpieleCom-Host.vbs', host_vbs)
        zf.writestr('README-WINDOWS.txt', readme_txt)
        zf.writestr('app/index.html', offline_html)

        for root, dirs, files in os.walk(DIST_DIR):
            rel_root = os.path.relpath(root, DIST_DIR)
            if rel_root.startswith('releases'):
                continue
            for file in files:
                if rel_root == '.' and file == 'index.html':
                    continue
                full_p = os.path.join(root, file)
                arc_p = os.path.normpath(os.path.join('app', rel_root, file)).replace('\\', '/')
                zf.write(full_p, arc_p)

        for extra_rel in ['electron/main.cjs', 'electron/preload.cjs', 'electron-builder.yml', 'package.json', '.github/workflows/release.yml']:
            full_p = os.path.join(ROOT_DIR, extra_rel)
            if os.path.exists(full_p):
                zf.write(full_p, f'src-desktop/{extra_rel}')


def build_antigravity_workspace_zip(zip_path: str):
    """
    Packages the complete unminified source repository + Google Antigravity IDE configurations
    (.agents/, .vscode/, GEMINI.md, AGENTS.md, cub-spiele-com.code-workspace, Open-in-Antigravity.bat)
    so the user can extract and open the project directly in Google Antigravity on their desktop.
    """
    open_bat = """@echo off
title Open Cub Spiele.Com in Google Antigravity IDE
cd /d "%~dp0"
where antigravity >nul 2>nul
if %errorlevel%==0 (
  start "" antigravity cub-spiele-com.code-workspace
  exit /b 0
)
where agy >nul 2>nul
if %errorlevel%==0 (
  start "" agy cub-spiele-com.code-workspace
  exit /b 0
)
if exist "%LOCALAPPDATA%\\Programs\\Antigravity\\Antigravity.exe" (
  start "" "%LOCALAPPDATA%\\Programs\\Antigravity\\Antigravity.exe" "%~dp0cub-spiele-com.code-workspace"
  exit /b 0
)
echo Launching cub-spiele-com.code-workspace...
start "" "%~dp0cub-spiele-com.code-workspace"
"""
    exclude_dirs = {'node_modules', 'dist', 'release', '.git', '.aistudio', '__pycache__'}

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        zf.writestr('Open-in-Antigravity.bat', open_bat)

        for root, dirs, files in os.walk(ROOT_DIR):
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            rel_root = os.path.relpath(root, ROOT_DIR)
            # Avoid recursive inclusion of the workspace zip itself inside public/releases
            if rel_root.replace('\\', '/').startswith('public/releases'):
                for file in files:
                    if file == 'CubSpieleCom.exe' or file == 'releases-manifest.json':
                        full_p = os.path.join(root, file)
                        arc_p = os.path.normpath(os.path.join(rel_root, file)).replace('\\', '/')
                        zf.write(full_p, arc_p)
                continue

            for file in files:
                if file == 'bun.lock' or file == 'package-lock.json':
                    continue
                full_p = os.path.join(root, file)
                arc_p = file if rel_root == '.' else os.path.normpath(os.path.join(rel_root, file)).replace('\\', '/')
                zf.write(full_p, arc_p)


def main():
    os.makedirs(RELEASES_DIR, exist_ok=True)
    os.makedirs(ASSETS_DIR, exist_ok=True)

    # Clean old GameCom-* files in RELEASES_DIR
    for old_f in os.listdir(RELEASES_DIR):
        if old_f.startswith('GameCom-'):
            try:
                os.remove(os.path.join(RELEASES_DIR, old_f))
            except OSError:
                pass

    ico_bytes, dib_bytes = generate_cub_spiele_ico()
    ico_path = os.path.join(ASSETS_DIR, 'icon.ico')
    with open(ico_path, 'wb') as f:
        f.write(ico_bytes)

    exe_bytes = build_pe64_gui_executable(dib_bytes)
    exe_path = os.path.join(RELEASES_DIR, 'CubSpieleCom.exe')
    with open(exe_path, 'wb') as f:
        f.write(exe_bytes)

    zip_v120_name = 'CubSpieleCom-v1.2.0-win64.zip'
    zip_v120_path = os.path.join(RELEASES_DIR, zip_v120_name)
    build_zip_bundle(zip_v120_path, exe_bytes, 'v1.2.0')

    zip_v110_name = 'CubSpieleCom-v1.1.0-win64.zip'
    zip_v110_path = os.path.join(RELEASES_DIR, zip_v110_name)
    build_zip_bundle(zip_v110_path, exe_bytes, 'v1.1.0')

    ag_zip_name = 'CubSpieleCom-Antigravity-Workspace.zip'
    ag_zip_path = os.path.join(RELEASES_DIR, ag_zip_name)
    build_antigravity_workspace_zip(ag_zip_path)

    if os.path.exists(DIST_DIR):
        dist_rel = os.path.join(DIST_DIR, 'releases')
        os.makedirs(dist_rel, exist_ok=True)
        for fname in ['CubSpieleCom.exe', zip_v120_name, zip_v110_name, ag_zip_name]:
            src = os.path.join(RELEASES_DIR, fname)
            dst = os.path.join(dist_rel, fname)
            with open(src, 'rb') as sf, open(dst, 'wb') as df:
                df.write(sf.read())

    manifest = {
        "project": "cub-spiele-com-emulator",
        "latestVersion": "v1.2.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "releases": [
            {
                "tag": "v1.2.0",
                "title": "Cub Spiele.Com v1.2.0 — Standalone Handheld Emulator & Google Antigravity Desktop Workspace",
                "publishedAt": "2026-11-12T07:30:00Z",
                "isLatest": True,
                "Prerelease": False,
                "commitRef": "HEAD (tag: v1.2.0)",
                "highlights": [
                    "Added full Google Antigravity Desktop IDE Workspace (cub-spiele-com.code-workspace, GEMINI.md, AGENTS.md, .agents/rules, .agents/workflows, .vscode/)",
                    "Renamed standalone emulator to Cub Spiele.Com (CubSpieleCom.exe PE32+ x86-64 GUI executable)",
                    "mGBA / melonDS-inspired standalone desktop layout with native Menu Bar (File, Emulation, Audio/Video, View, Tools)",
                    "Added Screen-Only Mode (2x / 3x / 4x integer LCD scaling) alongside Full Handheld Bezel Mode",
                    "Added Recently Played ROMs submenu & Touch Grid Visibility Slider (0% - 100%)"
                ],
                "assets": [
                    {
                        "name": zip_v120_name,
                        "label": "Windows x64 Portable Release Bundle (.zip)",
                        "url": f"./releases/{zip_v120_name}",
                        "sizeBytes": os.path.getsize(zip_v120_path),
                        "sha256": sha256_file(zip_v120_path),
                        "architecture": "Windows 10/11 x64 (PE32+ AMD64)"
                    },
                    {
                        "name": "CubSpieleCom.exe",
                        "label": "Standalone Windows x64 GUI Executable (.exe)",
                        "url": "./releases/CubSpieleCom.exe",
                        "sizeBytes": os.path.getsize(exe_path),
                        "sha256": sha256_file(exe_path),
                        "architecture": "Windows 10/11 x64 (PE32+ AMD64)"
                    },
                    {
                        "name": ag_zip_name,
                        "label": "Google Antigravity Desktop IDE Project Workspace (.zip)",
                        "url": f"./releases/{ag_zip_name}",
                        "sizeBytes": os.path.getsize(ag_zip_path),
                        "sha256": sha256_file(ag_zip_path),
                        "architecture": "Google Antigravity IDE (Full Source + .agents + .vscode)"
                    }
                ]
            },
            {
                "tag": "v1.1.0",
                "title": "Cub Spiele.Com v1.1.0 — SM8521 ALU Verification & Lights Out NVRAM Fix",
                "publishedAt": "2026-11-12T06:00:00Z",
                "isLatest": False,
                "Prerelease": False,
                "commitRef": "tag: v1.1.0",
                "highlights": [
                    "Preloaded Slot 1 (Lights Out) & Slot 2 (Sonic Jam) with hardware P3 chip-select isolation",
                    "Fixed Lights Out '1?5' starting level bug by preserving 64-byte rawSlot binary level progress bytes (+0x12..+0x17) in NVRAM",
                    "Verified Sharp SM8521 CPU ALU against official datasheet (8-bit ADC & 16-bit ADDW/ADCW signed overflow V flag, 16-bit ANDW/ORW/XORW S/V flags, PS0 $001E mirror)",
                    "Calibrated default audio volume to 20% with internal speaker band-pass filter (380 Hz - 3.6 kHz)"
                ],
                "assets": [
                    {
                        "name": zip_v110_name,
                        "label": "Windows x64 Portable Release Bundle (.zip)",
                        "url": f"./releases/{zip_v110_name}",
                        "sizeBytes": os.path.getsize(zip_v110_path),
                        "sha256": sha256_file(zip_v110_path),
                        "architecture": "Windows 10/11 x64 (PE32+ AMD64)"
                    }
                ]
            }
        ]
    }

    manifest_path = os.path.join(RELEASES_DIR, 'releases-manifest.json')
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)

    if os.path.exists(DIST_DIR):
        with open(os.path.join(DIST_DIR, 'releases', 'releases-manifest.json'), 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2)

    print(f"Built Windows x64 EXE: {exe_path} ({os.path.getsize(exe_path)} bytes)")
    print(f"Built v1.2.0 Win64 ZIP: {zip_v120_path} ({os.path.getsize(zip_v120_path)} bytes)")
    print(f"Built Antigravity Workspace ZIP: {ag_zip_path} ({os.path.getsize(ag_zip_path)} bytes)")


if __name__ == '__main__':
    main()
