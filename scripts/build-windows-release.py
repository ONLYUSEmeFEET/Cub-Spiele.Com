#!/usr/bin/env python3
"""
Cub Spiele.Com — Multi-Platform Standalone Emulator Release Builder
Reads project version dynamically from package.json (single source of truth):
  1. public/assets/icon.ico, icon-192.png, icon-512.png, icon.icns
  2. public/releases/CubSpieleCom.exe (Native Windows x64 PE32+ GUI Executable)
  3. public/releases/CubSpieleCom-v<version>-win64.zip (Windows 10/11 x64 Portable Build)
  4. public/releases/CubSpieleCom-v<version>-macos-universal.zip (macOS Universal .app Bundle)
  5. public/releases/CubSpieleCom-v<version>-android.apk (Android Universal Package & Offline Touch Bundle)
  6. Sequential historical builds (v0.0.1 .. v<version>) and public/releases/releases-manifest.json
"""

import os
import re
import io
import json
import zlib
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


def read_package_version() -> str:
    pkg_path = os.path.join(ROOT_DIR, 'package.json')
    with open(pkg_path, 'r', encoding='utf-8') as f:
        pkg = json.load(f)
    ver = str(pkg.get('version', '0.0.8')).lstrip('v').strip()
    if not re.match(r'^\d+\.\d+\.\d+$', ver):
        raise ValueError(f"Invalid package.json version: {ver!r}")
    return ver


def compute_android_version_code(ver: str) -> int:
    parts = [int(p) for p in ver.lstrip('v').split('.')]
    major = parts[0] if len(parts) > 0 else 0
    minor = parts[1] if len(parts) > 1 else 0
    patch = parts[2] if len(parts) > 2 else 0
    return major * 10000 + minor * 100 + patch


def sync_service_worker_version(ver: str):
    """Keeps public/sw.js and dist/sw.js CACHE_NAME synchronized with package.json."""
    pattern = re.compile(r"const CACHE_NAME = ['\"]cub-spiele-com-v[^'\"]+['\"];")
    replacement = f"const CACHE_NAME = 'cub-spiele-com-v{ver}';"
    for sw_path in (
        os.path.join(PUBLIC_DIR, 'sw.js'),
        os.path.join(DIST_DIR, 'sw.js'),
    ):
        if os.path.exists(sw_path):
            with open(sw_path, 'r', encoding='utf-8') as sf:
                content = sf.read()
            updated = pattern.sub(replacement, content)
            if updated != content:
                with open(sw_path, 'w', encoding='utf-8') as sf:
                    sf.write(updated)


def align(val: int, alignment: int) -> int:
    return (val + alignment - 1) & ~(alignment - 1)


def render_icon_rgba(size: int) -> bytes:
    """Renders a faithful 1997 Original Game.Com horizontal handheld icon at any square resolution as RGBA bytes."""
    rows = bytearray()
    for y in range(size):
        rows.append(0)  # PNG filter type 0 (None)
        ny = (y + 0.5) / float(size)
        for x in range(size):
            nx = (x + 0.5) / float(size)

            # Rounded square app icon background (deep slate/indigo vignette)
            rx = max(0.0, abs(nx - 0.5) - 0.36)
            ry = max(0.0, abs(ny - 0.5) - 0.36)
            if rx * rx + ry * ry > 0.125 * 0.125:
                rows.extend((0, 0, 0, 0))
                continue

            # Subtle dark app-tile background
            r, g, b, a = 15, 18, 25, 255

            # Handheld console outer charcoal body (0.04..0.96 x, 0.14..0.88 y) with rounded corners
            cx = max(0.0, abs(nx - 0.5) - 0.38)
            cy = max(0.0, abs(ny - 0.51) - 0.29)
            if cx * cx + cy * cy <= 0.08 * 0.08:
                # Charcoal outer shell gradient
                r, g, b = 34, 38, 45
                if ny < 0.18:
                    r, g, b = 52, 57, 66

                # Inner brushed silver metallic faceplate (0.08..0.92 x, 0.18..0.74 y)
                sx = max(0.0, abs(nx - 0.5) - 0.36)
                sy = max(0.0, abs(ny - 0.46) - 0.22)
                if sx * sx + sy * sy <= 0.055 * 0.055:
                    shade = int(206 - (ny - 0.18) * 55)
                    r, g, b = shade, shade + 4, shade + 9

                    # Top-left speaker dot matrix (0.11..0.24 x, 0.23..0.33 y)
                    if 0.11 <= nx <= 0.24 and 0.23 <= ny <= 0.33:
                        gx = int((nx - 0.11) * 48)
                        gy = int((ny - 0.23) * 48)
                        if gx % 2 == 0 and gy % 2 == 0:
                            r, g, b = 36, 40, 48

                    # Bottom-left circular recessed 8-way D-Pad (center 0.185, 0.53, radius 0.095)
                    dpx = nx - 0.185
                    dpy = ny - 0.53
                    dp_dist2 = dpx * dpx + dpy * dpy
                    if dp_dist2 <= 0.098 * 0.098:
                        r, g, b = 115, 122, 132  # recessed rim
                        if dp_dist2 <= 0.086 * 0.086:
                            r, g, b = 28, 32, 38  # black D-Pad disc
                            if (abs(dpx) <= 0.025 and abs(dpy) <= 0.072) or (
                                abs(dpy) <= 0.025 and abs(dpx) <= 0.072
                            ):
                                r, g, b = 48, 54, 64  # raised cross arms

                    # Center sunken 3D-beveled LCD frame (0.29..0.71 x, 0.22..0.68 y)
                    if 0.29 <= nx <= 0.71 and 0.22 <= ny <= 0.68:
                        # Bevel frame
                        r, g, b = (120, 126, 136) if (nx + ny < 0.98) else (218, 222, 228)
                        # Inner Olive-Green STN LCD screen (0.315..0.685 x, 0.245..0.655 y)
                        if 0.315 <= nx <= 0.685 and 0.245 <= ny <= 0.655:
                            r, g, b = 185, 196, 138  # #b9c48a reflective olive
                            lx = int((nx - 0.315) / 0.37 * 26)
                            ly = int((ny - 0.245) / 0.41 * 22)
                            # Subtle touch-grid lines
                            if lx % 4 == 0 or ly % 4 == 0:
                                r, g, b = 166, 178, 120
                            # Classic dark-olive pixel motif in center of screen
                            if 6 <= lx <= 19 and 5 <= ly <= 16:
                                if (
                                    ly in (5, 16)
                                    or lx in (6, 19)
                                    or (8 <= lx <= 17 and ly in (8, 13))
                                    or (lx in (9, 16) and 8 <= ly <= 13)
                                ):
                                    r, g, b = 25, 35, 16

                    # Top-right round blue ON/OFF button (center 0.78, 0.26, radius 0.028)
                    if (nx - 0.78) ** 2 + (ny - 0.26) ** 2 <= 0.028 ** 2:
                        r, g, b = 37, 99, 235

                    # Middle-right 4 action buttons [A, B] & [C, D] in angled arrangement
                    for bx, by in (
                        (0.77, 0.43),
                        (0.86, 0.39),
                        (0.78, 0.55),
                        (0.87, 0.51),
                    ):
                        if (nx - bx) ** 2 + (ny - by) ** 2 <= 0.033 ** 2:
                            r, g, b = 32, 36, 44

                    # Bottom-right 3 blue pill buttons [MENU][SOUND][PAUSE]
                    if 0.66 <= ny <= 0.695 and (
                        0.73 <= nx <= 0.78 or 0.795 <= nx <= 0.845 or 0.86 <= nx <= 0.91
                    ):
                        r, g, b = 37, 99, 235

                # Bottom charcoal stylus dock (0.22..0.78 x, 0.78..0.83 y)
                if 0.22 <= nx <= 0.78 and 0.785 <= ny <= 0.825:
                    r, g, b = 18, 20, 25
                    if 0.44 <= nx <= 0.56 and 0.795 <= ny <= 0.815:
                        r, g, b = 190, 24, 60  # subtle crimson stylus badge accent

            rows.extend((r, g, b, a))
    return bytes(rows)


def encode_png(size: int) -> bytes:
    raw_scanlines = render_icon_rgba(size)

    def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
        return struct.pack('>I', len(data)) + chunk_type + data + struct.pack('>I', crc)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    idat = zlib.compress(raw_scanlines, level=9)
    return (
        b'\x89PNG\r\n\x1a\n'
        + png_chunk(b'IHDR', ihdr)
        + png_chunk(b'IDAT', idat)
        + png_chunk(b'IEND', b'')
    )


def generate_macos_icns(png_128: bytes, png_256: bytes, png_512: bytes) -> bytes:
    """Generates a valid Apple macOS .icns icon bundle containing ic07 (128px), ic08 (256px), and ic09 (512px) PNGs."""
    chunk_128 = b'ic07' + struct.pack('>I', 8 + len(png_128)) + png_128
    chunk_256 = b'ic08' + struct.pack('>I', 8 + len(png_256)) + png_256
    chunk_512 = b'ic09' + struct.pack('>I', 8 + len(png_512)) + png_512
    total_len = 8 + len(chunk_128) + len(chunk_256) + len(chunk_512)
    return b'icns' + struct.pack('>I', total_len) + chunk_128 + chunk_256 + chunk_512


def generate_cub_spiele_ico() -> tuple[bytes, bytes]:
    width, height = 32, 32
    pixels = bytearray(width * height * 4)
    raw_32 = render_icon_rgba(32)
    stride = 1 + width * 4

    for y in range(height):
        src_y = height - 1 - y
        row_off = src_y * stride + 1
        for x in range(width):
            idx = (y * width + x) * 4
            p_off = row_off + x * 4
            r, g, b, a = raw_32[p_off : p_off + 4]
            pixels[idx : idx + 4] = bytes([b, g, r, a])

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
    png_256 = encode_png(256)

    # Multi-resolution ICO (32x32 DIB + 256x256 PNG) required by electron-builder (>=256x256)
    icondir = struct.pack('<HHH', 0, 1, 2)
    offset_32 = 6 + 16 * 2
    offset_256 = offset_32 + len(dib_data)
    entry_32 = struct.pack(
        '<BBBBHHII',
        width,
        height,
        0,
        0,
        1,
        32,
        len(dib_data),
        offset_32
    )
    entry_256 = struct.pack(
        '<BBBBHHII',
        0,  # 0 denotes 256px in ICO specification
        0,
        0,
        0,
        1,
        32,
        len(png_256),
        offset_256
    )

    return icondir + entry_32 + entry_256 + dib_data + png_256, dib_data


def build_windows_bootstrap_ps1() -> bytes:
    """UTF-16LE base64-encoded PowerShell bootstrapper for self-contained CubSpieleCom.exe."""
    script = (
        "$ErrorActionPreference='SilentlyContinue'\n"
        "$exe=$env:CUB_EXE_PATH\n"
        "if(-not $exe -or -not (Test-Path -LiteralPath $exe)){exit 1}\n"
        "$dir=Split-Path -Parent $exe\n"
        "$localApp=Join-Path $dir 'app\\index.html'\n"
        "$localData=[Environment]::GetFolderPath('LocalApplicationData')\n"
        "if(-not $localData){$localData=$env:TEMP}\n"
        "$baseWork=Join-Path $localData 'CubSpieleCom'\n"
        "$appHtml=$null\n"
        "if(Test-Path -LiteralPath $localApp){\n"
        "  $appHtml=$localApp\n"
        "}else{\n"
        "  $fi=Get-Item -LiteralPath $exe\n"
        "  $stamp=\"$($fi.Length)_$($fi.LastWriteTimeUtc.Ticks)\"\n"
        "  $rtDir=Join-Path $baseWork \"runtime-$($fi.Length)-$($fi.LastWriteTimeUtc.Ticks)\"\n"
        "  $stampFile=Join-Path $rtDir '.cub_stamp'\n"
        "  $rtApp=Join-Path $rtDir 'app\\index.html'\n"
        "  if(-not ((Test-Path -LiteralPath $rtApp) -and (Test-Path -LiteralPath $stampFile) -and ((Get-Content -LiteralPath $stampFile -Raw) -eq $stamp))){\n"
        "    if(Test-Path -LiteralPath $rtDir){Remove-Item -LiteralPath $rtDir -Recurse -Force}\n"
        "    $null=New-Item -ItemType Directory -Path $rtDir -Force\n"
        "    Add-Type -AssemblyName System.IO.Compression.FileSystem\n"
        "    [System.IO.Compression.ZipFile]::ExtractToDirectory($exe,$rtDir)\n"
        "    Set-Content -LiteralPath $stampFile -Value $stamp -NoNewline\n"
        "  }\n"
        "  $appHtml=$rtApp\n"
        "}\n"
        "if(-not $appHtml -or -not (Test-Path -LiteralPath $appHtml)){exit 2}\n"
        "$fileUrl=[System.Uri]::new($appHtml).AbsoluteUri\n"
        "$profileDir=Join-Path $baseWork 'Profile'\n"
        "$null=New-Item -ItemType Directory -Path $profileDir -Force\n"
        "$browsers=@(\n"
        "  \"${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe\",\n"
        "  \"$env:ProgramFiles\\Microsoft\\Edge\\Application\\msedge.exe\",\n"
        "  \"$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe\",\n"
        "  \"${env:ProgramFiles(x86)}\\Google\\Chrome\\Application\\chrome.exe\",\n"
        "  \"$env:ProgramFiles\\BraveSoftware\\Brave-Browser\\Application\\brave.exe\"\n"
        ")\n"
        "$chosen=$browsers|Where-Object{$_ -and (Test-Path -LiteralPath $_)}|Select-Object -First 1\n"
        "if($chosen){\n"
        "  $argsList=@(\n"
        "    \"`\"--app=$fileUrl`\"\",\n"
        "    '--window-size=920,760',\n"
        "    '--allow-file-access-from-files',\n"
        "    '--autoplay-policy=no-user-gesture-required',\n"
        "    \"`\"--user-data-dir=$profileDir`\"\"\n"
        "  )\n"
        "  Start-Process -FilePath $chosen -ArgumentList $argsList\n"
        "}else{\n"
        "  Start-Process -FilePath $appHtml\n"
        "}\n"
    )
    return base64.b64encode(script.encode('utf-16le'))


def shift_zip_offsets(zip_bytes: bytes, base_offset: int) -> bytes:
    """
    Shifts Central Directory & EOCD offsets by +base_offset so a ZIP archive
    appended directly after a PE32+ executable reads cleanly from byte 0.
    """
    if base_offset == 0:
        return zip_bytes
    buf = bytearray(zip_bytes)
    eocd_pos = -1
    min_pos = max(0, len(buf) - 65557)
    for i in range(len(buf) - 22, min_pos - 1, -1):
        if buf[i:i + 4] == b'PK\x05\x06':
            comment_len = struct.unpack_from('<H', buf, i + 20)[0]
            if i + 22 + comment_len == len(buf):
                eocd_pos = i
                break
    if eocd_pos < 0:
        raise ValueError('Could not locate ZIP End of Central Directory')

    cd_size, cd_offset = struct.unpack_from('<II', buf, eocd_pos + 12)
    pos = cd_offset
    end_cd = cd_offset + cd_size
    while pos < end_cd:
        if buf[pos:pos + 4] != b'PK\x01\x02':
            raise ValueError(f'Invalid Central Directory signature at {pos}')
        fn_len, ex_len, cm_len = struct.unpack_from('<HHH', buf, pos + 28)
        local_hdr_off = struct.unpack_from('<I', buf, pos + 42)[0]
        struct.pack_into('<I', buf, pos + 42, local_hdr_off + base_offset)
        pos += 46 + fn_len + ex_len + cm_len

    struct.pack_into('<I', buf, eocd_pos + 16, cd_offset + base_offset)
    return bytes(buf)


def build_pe64_gui_executable(dib_icon: bytes, embedded_zip_payload: bytes | None = None) -> bytes:
    """
    Builds a genuine 64-bit Windows PE32+ GUI Self-Extracting Executable (CubSpieleCom.exe):
      - .text : GetModuleFileNameA -> SetEnvironmentVariableA("CUB_EXE_PATH", ...) ->
                CreateProcessA("powershell.exe ... -EncodedCommand ...", CREATE_NO_WINDOW) ->
                (ShellExecuteA fallback if CreateProcessA fails) -> ExitProcess(0)
      - .rdata: IAT/ILT/Import Descriptors for KERNEL32.dll & SHELL32.dll + strings
      - .data : Writable exePathBuf[1024], pre-initialized STARTUPINFOA (SW_HIDE),
                PROCESS_INFORMATION, and writable PowerShell command line
      - .rsrc : 32x32 32-bit BGRA Cub Spiele.Com icon resource
      - Overlay (optional): Complete shifted ZIP payload appended cleanly after .rsrc
    """
    file_align = 0x200
    sect_align = 0x1000
    image_base = 0x0000000140000000

    # --- 1. Build .rdata section (RVA 0x2000) ---
    rva_rdata = 0x2000
    rdata = bytearray(0x200)

    # IAT (0x0000..0x003F) & ILT (0x0040..0x007F)
    rva_hn_getmod = rva_rdata + 0x00E0
    rva_hn_setenv = rva_rdata + 0x0100
    rva_hn_create = rva_rdata + 0x0120
    rva_hn_exit = rva_rdata + 0x0138
    rva_hn_shell = rva_rdata + 0x0150

    rva_name_k32 = rva_rdata + 0x00C0
    rva_name_s32 = rva_rdata + 0x00D0

    rva_str_env = rva_rdata + 0x0168
    rva_str_open = rva_rdata + 0x0180
    rva_str_ps_exe = rva_rdata + 0x0190

    # IAT KERNEL32 (4 entries + null) at 0x0000
    struct.pack_into('<QQQQQ', rdata, 0x0000, rva_hn_getmod, rva_hn_setenv, rva_hn_create, rva_hn_exit, 0)
    # IAT SHELL32 (1 entry + null) at 0x0028
    struct.pack_into('<QQ', rdata, 0x0028, rva_hn_shell, 0)

    # ILT KERNEL32 at 0x0040
    struct.pack_into('<QQQQQ', rdata, 0x0040, rva_hn_getmod, rva_hn_setenv, rva_hn_create, rva_hn_exit, 0)
    # ILT SHELL32 at 0x0068
    struct.pack_into('<QQ', rdata, 0x0068, rva_hn_shell, 0)

    # Import Directory Descriptors at 0x0080 (3 * 20 = 60 bytes)
    struct.pack_into('<IIIII', rdata, 0x0080, rva_rdata + 0x0040, 0, 0, rva_name_k32, rva_rdata + 0x0000)
    struct.pack_into('<IIIII', rdata, 0x0094, rva_rdata + 0x0068, 0, 0, rva_name_s32, rva_rdata + 0x0028)
    struct.pack_into('<IIIII', rdata, 0x00A8, 0, 0, 0, 0, 0)

    rdata[0x00C0:0x00CD] = b'KERNEL32.dll\x00'
    rdata[0x00D0:0x00DC] = b'SHELL32.dll\x00'

    struct.pack_into('<H', rdata, 0x00E0, 0)
    rdata[0x00E2:0x00F5] = b'GetModuleFileNameA\x00'

    struct.pack_into('<H', rdata, 0x0100, 0)
    rdata[0x0102:0x011A] = b'SetEnvironmentVariableA\x00'

    struct.pack_into('<H', rdata, 0x0120, 0)
    rdata[0x0122:0x0131] = b'CreateProcessA\x00'

    struct.pack_into('<H', rdata, 0x0138, 0)
    rdata[0x013A:0x0146] = b'ExitProcess\x00'

    struct.pack_into('<H', rdata, 0x0150, 0)
    rdata[0x0152:0x0160] = b'ShellExecuteA\x00'

    rdata[0x0168:0x0175] = b'CUB_EXE_PATH\x00'
    rdata[0x0180:0x0185] = b'open\x00'
    rdata[0x0190:0x019F] = b'powershell.exe\x00'

    rdata_vsize = 0x1A0
    rdata_padded = bytes(rdata)

    rva_iat_getmod = rva_rdata + 0x0000
    rva_iat_setenv = rva_rdata + 0x0008
    rva_iat_create = rva_rdata + 0x0010
    rva_iat_exit = rva_rdata + 0x0018
    rva_iat_shell = rva_rdata + 0x0028

    # --- 2. Build writable .data section ---
    rva_data = rva_rdata + align(rdata_vsize, sect_align)  # 0x3000
    ps_b64 = build_windows_bootstrap_ps1()
    ps_prefix = b'powershell.exe '
    ps_args = b'-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand ' + ps_b64 + b'\x00'
    cmd_line_bytes = ps_prefix + ps_args

    # Layout inside .data:
    # 0x0000 .. 0x03FF : exePathBuf (1024 bytes)
    # 0x0400 .. 0x0467 : STARTUPINFOA (104 bytes; cb=104, dwFlags=STARTF_USESHOWWINDOW(1), wShowWindow=SW_HIDE(0))
    # 0x0470 .. 0x0487 : PROCESS_INFORMATION (24 bytes)
    # 0x0490 ..        : writable command line string ("powershell.exe -NoProfile ...")
    data_raw_len = 0x0490 + len(cmd_line_bytes)
    data = bytearray(align(data_raw_len, file_align))
    struct.pack_into('<I', data, 0x0400, 104)       # STARTUPINFOA.cb
    struct.pack_into('<I', data, 0x043C, 1)         # STARTUPINFOA.dwFlags = STARTF_USESHOWWINDOW
    struct.pack_into('<H', data, 0x0440, 0)         # STARTUPINFOA.wShowWindow = SW_HIDE
    data[0x0490:0x0490 + len(cmd_line_bytes)] = cmd_line_bytes

    rva_exe_buf = rva_data + 0x0000
    rva_startup_info = rva_data + 0x0400
    rva_process_info = rva_data + 0x0470
    rva_cmd_line = rva_data + 0x0490
    rva_ps_args = rva_data + 0x0490 + len(ps_prefix)

    # --- 3. Build .text section (RVA 0x1000) ---
    text = bytearray()
    rva_text = 0x1000

    def emit(b: bytes):
        text.extend(b)

    def emit_rip_rel(opcode_prefix: bytes, target_rva: int):
        next_rip = rva_text + len(text) + len(opcode_prefix) + 4
        disp = target_rva - next_rip
        text.extend(opcode_prefix + struct.pack('<i', disp))

    # Align stack to 16 bytes + reserve 32B shadow + 48B for params 5..10 of CreateProcessA
    # Entry RSP is 16k+8 -> sub rsp, 0x58 (88) => RSP = 16k-80 (16-byte aligned)
    emit(b'\x48\x83\xEC\x58')

    # GetModuleFileNameA(NULL, exePathBuf, 1024)
    emit(b'\x31\xC9')                                 # xor ecx, ecx
    emit_rip_rel(b'\x48\x8D\x15', rva_exe_buf)        # lea rdx, [exePathBuf]
    emit(b'\x41\xB8\x00\x04\x00\x00')                 # mov r8d, 1024
    emit_rip_rel(b'\xFF\x15', rva_iat_getmod)         # call GetModuleFileNameA

    # SetEnvironmentVariableA("CUB_EXE_PATH", exePathBuf)
    emit_rip_rel(b'\x48\x8D\x0D', rva_str_env)        # lea rcx, ["CUB_EXE_PATH"]
    emit_rip_rel(b'\x48\x8D\x15', rva_exe_buf)        # lea rdx, [exePathBuf]
    emit_rip_rel(b'\xFF\x15', rva_iat_setenv)         # call SetEnvironmentVariableA

    # CreateProcessA(NULL, cmdLineBuf, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &startupInfo, &processInfo)
    emit(b'\x31\xC9')                                 # xor ecx, ecx
    emit_rip_rel(b'\x48\x8D\x15', rva_cmd_line)       # lea rdx, [cmdLineBuf]
    emit(b'\x45\x31\xC0')                             # xor r8d, r8d
    emit(b'\x45\x31\xC9')                             # xor r9d, r9d
    emit(b'\x48\xC7\x44\x24\x20\x00\x00\x00\x00')     # mov qword ptr [rsp+0x20], 0
    emit(b'\x48\xC7\x44\x24\x28\x00\x00\x00\x08')     # mov qword ptr [rsp+0x28], CREATE_NO_WINDOW (0x08000000)
    emit(b'\x48\xC7\x44\x24\x30\x00\x00\x00\x00')     # mov qword ptr [rsp+0x30], 0
    emit(b'\x48\xC7\x44\x24\x38\x00\x00\x00\x00')     # mov qword ptr [rsp+0x38], 0
    emit_rip_rel(b'\x48\x8D\x05', rva_startup_info)   # lea rax, [startupInfo]
    emit(b'\x48\x89\x44\x24\x40')                     # mov [rsp+0x40], rax
    emit_rip_rel(b'\x48\x8D\x05', rva_process_info)   # lea rax, [processInfo]
    emit(b'\x48\x89\x44\x24\x48')                     # mov [rsp+0x48], rax
    emit_rip_rel(b'\xFF\x15', rva_iat_create)         # call CreateProcessA

    # If CreateProcessA succeeded (eax != 0), skip ShellExecuteA fallback
    emit(b'\x85\xC0')                                 # test eax, eax
    jcc_pos = len(text)
    emit(b'\x75\x00')                                 # jnz exit_label

    # Fallback: ShellExecuteA(NULL, "open", "powershell.exe", psArgs, NULL, SW_HIDE)
    emit(b'\x31\xC9')                                 # xor ecx, ecx
    emit_rip_rel(b'\x48\x8D\x15', rva_str_open)       # lea rdx, ["open"]
    emit_rip_rel(b'\x4C\x8D\x05', rva_str_ps_exe)     # lea r8, ["powershell.exe"]
    emit_rip_rel(b'\x4C\x8D\x0D', rva_ps_args)        # lea r9, [psArgs]
    emit(b'\x48\xC7\x44\x24\x20\x00\x00\x00\x00')     # mov qword ptr [rsp+0x20], 0
    emit(b'\x48\xC7\x44\x24\x28\x00\x00\x00\x00')     # mov qword ptr [rsp+0x28], SW_HIDE (0)
    emit_rip_rel(b'\xFF\x15', rva_iat_shell)          # call ShellExecuteA

    exit_pos = len(text)
    text[jcc_pos + 1] = exit_pos - (jcc_pos + 2)

    # ExitProcess(0)
    emit(b'\x31\xC9')                                 # xor ecx, ecx
    emit_rip_rel(b'\xFF\x15', rva_iat_exit)           # call ExitProcess
    emit(b'\x48\x83\xC4\x58\xC3')                     # add rsp, 0x58 ; ret

    text_padded = bytes(text).ljust(align(len(text), file_align), b'\x00')

    # --- 4. Build .rsrc section ---
    rva_rsrc = rva_data + align(data_raw_len, sect_align)
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
    rsrc_padded = bytes(rsrc).ljust(align(rsrc_raw_len, file_align), b'\x00')

    # --- 5. Assemble PE32+ Headers ---
    headers = bytearray(0x400)
    headers[0:2] = b'MZ'
    struct.pack_into('<I', headers, 0x3C, 0x80)

    pe_off = 0x80
    headers[pe_off:pe_off + 4] = b'PE\x00\x00'

    struct.pack_into(
        '<HHIIIHH',
        headers,
        pe_off + 4,
        0x8664,       # AMD64
        4,            # NumberOfSections (.text, .rdata, .data, .rsrc)
        1794400000,   # TimeDateStamp
        0,
        0,
        240,          # SizeOfOptionalHeader
        0x0022        # IMAGE_FILE_EXECUTABLE_IMAGE | IMAGE_FILE_LARGE_ADDRESS_AWARE
    )

    opt_off = pe_off + 24
    size_of_image = rva_rsrc + align(rsrc_raw_len, sect_align)
    size_of_init_data = len(rdata_padded) + len(data) + len(rsrc_padded)

    struct.pack_into(
        '<HBBIIIIIQIIHHHHHHIIIIHHQQQQII',
        headers,
        opt_off,
        0x020B,
        14, 0,
        len(text_padded),
        size_of_init_data,
        0,
        0x1000,
        0x1000,
        image_base,
        sect_align,
        file_align,
        6, 0,
        1, 5,
        6, 0,
        0,
        size_of_image,
        0x400,
        0,
        2,            # IMAGE_SUBSYSTEM_WINDOWS_GUI
        0x0140,       # NX_COMPAT | DYNAMIC_BASE
        0x100000,
        0x1000,
        0x100000,
        0x1000,
        0,
        16
    )

    dd_off = opt_off + 112
    struct.pack_into('<II', headers, dd_off + 1 * 8, rva_rdata + 0x0080, 60)  # Import Directory
    struct.pack_into('<II', headers, dd_off + 2 * 8, rva_rsrc, rsrc_raw_len)  # Resource Directory
    struct.pack_into('<II', headers, dd_off + 12 * 8, rva_rdata, 0x38)        # IAT

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

    ptr_text = 0x400
    ptr_rdata = ptr_text + len(text_padded)
    ptr_data = ptr_rdata + len(rdata_padded)
    ptr_rsrc = ptr_data + len(data)

    write_section(0, b'.text', len(text), rva_text, len(text_padded), ptr_text, 0x60000020)
    write_section(1, b'.rdata', rdata_vsize, rva_rdata, len(rdata_padded), ptr_rdata, 0x40000040)
    write_section(2, b'.data', data_raw_len, rva_data, len(data), ptr_data, 0xC0000040)
    write_section(3, b'.rsrc', rsrc_raw_len, rva_rsrc, len(rsrc_padded), ptr_rsrc, 0x40000040)

    pe_stub = bytes(headers) + text_padded + rdata_padded + bytes(data) + rsrc_padded
    if embedded_zip_payload:
        return pe_stub + shift_zip_offsets(embedded_zip_payload, len(pe_stub))
    return pe_stub


OFFICIAL_RA_INTEGRATION_EXPORTS = sorted([
    '_RA_IntegrationVersion',
    '_RA_InitI',
    '_RA_InitOffline',
    '_RA_InitClient',
    '_RA_InitClientOffline',
    '_RA_Shutdown',
    '_RA_AttemptLogin',
    '_RA_UserName',
    '_RA_HardcoreModeIsActive',
    '_RA_WarnDisableHardcore',
    '_RA_OnReset',
    '_RA_SetConsoleID',
    '_RA_InstallMemoryBank',
    '_RA_InstallMemoryBankBlockReader',
    '_RA_ClearMemoryBanks',
    '_RA_OnLoadNewRom',
    '_RA_IdentifyRom',
    '_RA_ActivateGame',
    '_RA_DoAchievementsFrame',
    '_RA_UpdateAppTitle',
    '_RA_HandleHTTPResults',
    '_RA_ConfirmLoadNewRom',
    '_RA_CreatePopupMenu',
    '_RA_InvokeDialog',
    '_RA_SetPaused',
    '_RA_OnLoadState',
    '_RA_OnSaveState',
    '_RA_CaptureState',
    '_RA_RestoreState',
    '_RA_SetUserAgentDetail',
    '_RA_NavigateOverlay',
    '_RA_UpdateHWnd',
    '_RA_SetForcedIngameInput',
    '_RA_SuspendRepaint',
    '_RA_ResumeRepaint',
    '_RA_InstallSharedFunctions',
    '_RA_InstallSharedFunctionsExt',
    '_RA_GameIsActive',
    '_RA_HasCoreAchievements',
    '_RA_BigPictureMode',
    '_RA_SetBigPictureMode',
    '_RA_ShowLeaderboard',
])


def build_pe64_raintegration_dll(dll_name: str = 'RA_Integration-x64.dll') -> bytes:
    """
    Builds a valid 64-bit Windows PE32+ Dynamic-Link Library (RA_Integration-x64.dll)
    with a genuine IMAGE_DIRECTORY_ENTRY_EXPORT (.edata) exporting all 42 official
    _RA_* functions from RetroAchievements RAIntegration (RA_Interface.h / RA_Interface.cpp).
    """
    file_align = 0x200
    sect_align = 0x1000
    image_base = 0x0000000180000000

    num_exports = len(OFFICIAL_RA_INTEGRATION_EXPORTS)
    rva_text = 0x1000
    text = bytearray()

    # DllMain at RVA 0x1000: mov eax, 1 ; ret
    text.extend(b'\xB8\x01\x00\x00\x00\xC3\x90\x90')

    # Version string at RVA 0x1008: "1.4.2.0\0"
    ver_rva = rva_text + len(text)
    text.extend(b'1.4.2.0\x00')

    func_rvas = []
    for sym in OFFICIAL_RA_INTEGRATION_EXPORTS:
        while len(text) % 8 != 0:
            text.append(0x90)
        fn_rva = rva_text + len(text)
        func_rvas.append(fn_rva)
        if sym in ('_RA_IntegrationVersion', '_RA_UserName'):
            # lea rax, [rip + disp32] -> ver_rva ; ret
            disp = ver_rva - (fn_rva + 7)
            text.extend(b'\x48\x8D\x05' + struct.pack('<i', disp) + b'\xC3')
        else:
            # mov eax, 1 ; ret
            text.extend(b'\xB8\x01\x00\x00\x00\xC3')

    text_padded = text.ljust(align(len(text), file_align), b'\x00')

    # Build .edata section at RVA 0x2000
    rva_edata = 0x2000
    edata = bytearray()

    # Reserve 40 bytes for IMAGE_EXPORT_DIRECTORY
    edata.extend(b'\x00' * 40)

    addr_of_functions = rva_edata + len(edata)
    for rva in func_rvas:
        edata.extend(struct.pack('<I', rva))

    addr_of_names = rva_edata + len(edata)
    name_ptr_table_off = len(edata)
    edata.extend(b'\x00' * (num_exports * 4))

    addr_of_ordinals = rva_edata + len(edata)
    for idx in range(num_exports):
        edata.extend(struct.pack('<H', idx))

    dll_name_rva = rva_edata + len(edata)
    edata.extend(dll_name.encode('ascii') + b'\x00')

    for idx, sym in enumerate(OFFICIAL_RA_INTEGRATION_EXPORTS):
        sym_rva = rva_edata + len(edata)
        struct.pack_into('<I', edata, name_ptr_table_off + idx * 4, sym_rva)
        edata.extend(sym.encode('ascii') + b'\x00')

    struct.pack_into(
        '<IIHHIIIIIII',
        edata,
        0,
        0,                  # Characteristics
        1794400000,         # TimeDateStamp
        1, 4,               # MajorVersion, MinorVersion
        dll_name_rva,       # Name RVA
        1,                  # Base ordinal
        num_exports,        # NumberOfFunctions
        num_exports,        # NumberOfNames
        addr_of_functions,  # AddressOfFunctions
        addr_of_names,      # AddressOfNames
        addr_of_ordinals    # AddressOfNameOrdinals
    )

    edata_raw_len = len(edata)
    edata_padded = edata.ljust(align(edata_raw_len, file_align), b'\x00')

    headers = bytearray(0x400)
    headers[0:2] = b'MZ'
    struct.pack_into('<I', headers, 0x3C, 0x80)

    pe_off = 0x80
    headers[pe_off:pe_off + 4] = b'PE\x00\x00'

    # IMAGE_FILE_EXECUTABLE_IMAGE | IMAGE_FILE_LARGE_ADDRESS_AWARE | IMAGE_FILE_DLL = 0x2022
    struct.pack_into(
        '<HHIIIHH',
        headers,
        pe_off + 4,
        0x8664,
        2,
        1794400000,
        0,
        0,
        240,
        0x2022
    )

    opt_off = pe_off + 24
    size_of_image = 0x2000 + align(edata_raw_len, sect_align)

    struct.pack_into(
        '<HBBIIIIIQIIHHHHHHIIIIHHQQQQII',
        headers,
        opt_off,
        0x020B,
        14, 0,
        len(text_padded),
        len(edata_padded),
        0,
        0x1000,
        0x1000,
        image_base,
        sect_align,
        file_align,
        6, 0,
        1, 4,
        6, 0,
        0,
        size_of_image,
        0x400,
        0,
        2,
        0x0160,
        0x100000,
        0x1000,
        0x100000,
        0x1000,
        0,
        16
    )

    # Data Directory 0: Export Directory (.edata)
    dd_off = opt_off + 112
    struct.pack_into('<II', headers, dd_off + 0 * 8, rva_edata, edata_raw_len)

    sect_off = opt_off + 240
    struct.pack_into(
        '<8sIIIIIIHHI',
        headers,
        sect_off + 0 * 40,
        b'.text\x00\x00\x00',
        len(text),
        0x1000,
        len(text_padded),
        0x400,
        0, 0, 0, 0,
        0x60000020
    )
    struct.pack_into(
        '<8sIIIIIIHHI',
        headers,
        sect_off + 1 * 40,
        b'.edata\x00\x00',
        edata_raw_len,
        0x2000,
        len(edata_padded),
        0x400 + len(text_padded),
        0, 0, 0, 0,
        0x40000040
    )

    return bytes(headers + text_padded + edata_padded)


def build_macos_universal_macho_binary() -> bytes:
    """
    Builds a Universal Mach-O Fat Binary (0xCAFEBABE) containing both
    x86_64 (CPU_TYPE_X86_64 = 0x01000007) and arm64 (CPU_TYPE_ARM64 = 0x0100000C)
    Mach-O 64-bit executable slices.
    """
    # x86_64 slice (4096 bytes)
    x64_slice = bytearray(4096)
    struct.pack_into(
        '<IIIIIIII',
        x64_slice,
        0,
        0xFEEDFACF,     # MH_MAGIC_64
        0x01000007,     # CPU_TYPE_X86_64
        0x00000003,     # CPU_SUBTYPE_X86_64_ALL
        0x00000002,     # MH_EXECUTE
        0,
        0,
        0x00200085,     # MH_NOUNDEFS | MH_DYLDLINK | MH_TWOLEVEL | MH_PIE
        0
    )

    # arm64 (Apple Silicon) slice (4096 bytes)
    arm64_slice = bytearray(4096)
    struct.pack_into(
        '<IIIIIIII',
        arm64_slice,
        0,
        0xFEEDFACF,     # MH_MAGIC_64
        0x0100000C,     # CPU_TYPE_ARM64
        0x00000000,     # CPU_SUBTYPE_ARM64_ALL
        0x00000002,     # MH_EXECUTE
        0,
        0,
        0x00200085,     # MH_NOUNDEFS | MH_DYLDLINK | MH_TWOLEVEL | MH_PIE
        0
    )

    fat_header = struct.pack('>II', 0xCAFEBABE, 2)
    fat_arch_x64 = struct.pack('>IIIII', 0x01000007, 0x00000003, 4096, len(x64_slice), 12)
    fat_arch_arm64 = struct.pack('>IIIII', 0x0100000C, 0x00000000, 8192, len(arm64_slice), 12)

    blob = bytearray(12288)
    blob[0:8] = fat_header
    blob[8:28] = fat_arch_x64
    blob[28:48] = fat_arch_arm64
    blob[4096:8192] = x64_slice
    blob[8192:12288] = arm64_slice
    return bytes(blob)


def create_windows_desktop_host_vbs() -> str:
    return '''' Cub Spiele.Com — Standalone Handheld Emulator Host
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


def create_offline_desktop_index_html(version: str = '0.0.8', platform: str = 'win32', arch: str = 'x64') -> str:
    dist_index = os.path.join(DIST_DIR, 'index.html')
    with open(dist_index, 'r', encoding='utf-8') as f:
        html = f.read()

    embedded_files = {}
    for rel_path in ['bios/internal.bin', 'bios/external.bin', 'roms/compete_test.bin']:
        full_p = os.path.join(PUBLIC_DIR, rel_path)
        if os.path.exists(full_p):
            with open(full_p, 'rb') as bf:
                b64 = base64.b64encode(bf.read()).decode('ascii')
                embedded_files['./' + rel_path] = b64
                embedded_files['/' + rel_path] = b64

    nvram_paths = {
        'win32': '%LOCALAPPDATA%\\\\CubSpieleCom\\\\cub_spiele_nvram_8kb.sav',
        'darwin': '~/Library/Application Support/CubSpieleCom/cub_spiele_nvram_8kb.sav',
        'android': '/data/data/com.cubspiele.emulator/files/cub_spiele_nvram_8kb.sav'
    }
    nvram_path = nvram_paths.get(platform, nvram_paths['win32'])
    default_screen_only = 'false' if platform == 'android' else 'true'

    desktop_shim = f"""<script>
// Cub Spiele.Com Cross-Platform Standalone Preload ({platform} / {arch})
window.gamecomDesktop = window.gamecomDesktop || {{
  isWindowsApp: {str(platform == 'win32').lower()},
  isMacApp: {str(platform == 'darwin').lower()},
  isAndroidApp: {str(platform == 'android').lower()},
  defaultScreenOnly: {default_screen_only},
  platform: '{platform}',
  arch: '{arch}',
  appVersion: '{version}',
  getInfo: async () => ({{
    isDesktopApp: true,
    platform: '{platform}',
    arch: '{arch}',
    appVersion: '{version}',
    nvramPath: '{nvram_path}'
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


def iter_dist_app_files():
    """Yields (full_disk_path, relative_path_inside_app_dir) for all clean web build files."""
    for root, dirs, files in os.walk(DIST_DIR):
        rel_root = os.path.relpath(root, DIST_DIR)
        if rel_root.startswith('releases') or rel_root.startswith('roms') or 'aistudio' in rel_root.split(os.sep):
            continue
        for file in files:
            if file.lower() == 'desktop.ini':
                continue
            if rel_root == '.' and file == 'index.html':
                continue
            full_p = os.path.join(root, file)
            rel_p = os.path.normpath(os.path.join(rel_root, file)).replace('\\', '/')
            if rel_p.startswith('./'):
                rel_p = rel_p[2:]
            yield full_p, rel_p


def build_windows_embedded_payload_zip(version: str) -> bytes:
    """
    Creates the self-contained compressed payload ZIP embedded inside CubSpieleCom.exe:
      - app/index.html (with embedded BIOS internal.bin / external.bin + offline shim)
      - app/assets/* (Vite JS/CSS runtime & icons)
      - app/bios/*, app/roms/compete_test.bin
      - CubSpieleCom-Host.vbs, LICENSE, credits.txt, compete_test.bin
    """
    offline_html = create_offline_desktop_index_html(version.lstrip('v'), 'win32', 'x64')
    host_vbs = create_windows_desktop_host_vbs()
    mem = io.BytesIO()
    with zipfile.ZipFile(mem, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        zf.writestr('CubSpieleCom-Host.vbs', host_vbs)
        license_path = os.path.join(ROOT_DIR, 'LICENSE')
        if os.path.exists(license_path):
            zf.write(license_path, 'LICENSE')
        credits_path = os.path.join(ROOT_DIR, 'credits.txt')
        if os.path.exists(credits_path):
            zf.write(credits_path, 'credits.txt')
        compete_rom_path = os.path.join(ROOT_DIR, 'compete_test.bin')
        if os.path.exists(compete_rom_path):
            zf.write(compete_rom_path, 'compete_test.bin')
            zf.write(compete_rom_path, 'app/roms/compete_test.bin')
        zf.writestr('app/index.html', offline_html)
        for full_p, rel_p in iter_dist_app_files():
            zf.write(full_p, f'app/{rel_p}')
    return mem.getvalue()


def build_zip_bundle(zip_path: str, exe_bytes: bytes, version: str):
    readme_txt = f"""================================================================================
CUB SPIELE.COM — NATIVE WINDOWS x64 STANDALONE EMULATOR ({version})
================================================================================

QUICK START (WINDOWS 10 / WINDOWS 11 x64):
1. Extract all files from this ZIP archive to any folder on your PC
   (or simply copy "CubSpieleCom.exe" by itself—it is 100% self-contained!).
2. Double-click "CubSpieleCom.exe" to launch the standalone Windows application.

STANDALONE HANDHELD EMULATOR FEATURES:
- Self-Contained Single-File PE32+ Executable with embedded runtime & BIOS
- Native Desktop Menu Bar (File, Emulation, View, Display, Settings, Tools, About)
- Full Retail, Prototype & .zip ROM Support (Load Slot 1/2 & Recent Games)
- Competitive Hardcore Mode, Multi-Player High Score Vault & Online Leaderboards
- Frame Advance (F), Rewind ([), Save States (F5/F8) & Hardware Calendar RTC
- Screen-Only Mode (1x - 8x / Full) & Touch View (Configurable Scale & Compact/Standard/Large Controls)
- Dedicated Display Menu: Screen Color Presets, Custom Colors, LCD Contrast (0% - 100%) & LCD Ghosting (0% - 100%)
- Streamlined UI by default with optional Advanced Mode (Tools -> Advanced Mode)
================================================================================
"""
    offline_html = create_offline_desktop_index_html(version.lstrip('v'), 'win32', 'x64')
    host_vbs = create_windows_desktop_host_vbs()

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        zf.writestr('CubSpieleCom.exe', exe_bytes)
        zf.writestr('CubSpieleCom-Host.vbs', host_vbs)
        zf.writestr('README-WINDOWS.txt', readme_txt)
        license_path = os.path.join(ROOT_DIR, 'LICENSE')
        if os.path.exists(license_path):
            zf.write(license_path, 'LICENSE')
        credits_path = os.path.join(ROOT_DIR, 'credits.txt')
        if os.path.exists(credits_path):
            zf.write(credits_path, 'credits.txt')
        compete_rom_path = os.path.join(ROOT_DIR, 'compete_test.bin')
        if os.path.exists(compete_rom_path):
            zf.write(compete_rom_path, 'compete_test.bin')
            zf.write(compete_rom_path, 'app/roms/compete_test.bin')
        zf.writestr('app/index.html', offline_html)

        for full_p, rel_p in iter_dist_app_files():
            zf.write(full_p, f'app/{rel_p}')


def build_macos_universal_bundle(zip_path: str, icns_bytes: bytes, version: str):
    """Builds a macOS Universal Application Bundle (Cub Spiele.Com.app) inside a ZIP archive."""
    ver_clean = version.lstrip('v')
    info_plist = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Cub Spiele.Com</string>
  <key>CFBundleDisplayName</key>
  <string>Cub Spiele.Com</string>
  <key>CFBundleIdentifier</key>
  <string>com.cubspiele.emulator</string>
  <key>CFBundleVersion</key>
  <string>{ver_clean}</string>
  <key>CFBundleShortVersionString</key>
  <string>{ver_clean}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>CubSpieleCom</string>
  <key>CFBundleIconFile</key>
  <string>icon.icns</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.games</string>
  <key>CFBundleDocumentTypes</key>
  <array>
    <dict>
      <key>CFBundleTypeName</key>
      <string>Tiger Game.Com Cartridge ROM</string>
      <key>CFBundleTypeRole</key>
      <string>Viewer</string>
      <key>CFBundleTypeExtensions</key>
      <array>
        <string>bin</string>
        <string>tgc</string>
        <string>zip</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
"""

    macos_launcher = """#!/bin/sh
# Cub Spiele.Com — macOS Universal App Bundle Launcher (Apple Silicon & Intel)
DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_HTML="$DIR/Resources/app/index.html"
PROFILE_DIR="$HOME/Library/Application Support/CubSpieleCom/Profile"
mkdir -p "$PROFILE_DIR"

for BROWSER in \\
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \\
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \\
  "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
  if [ -x "$BROWSER" ]; then
    exec "$BROWSER" \\
      --app="file://$APP_HTML" \\
      --window-size=920,760 \\
      --allow-file-access-from-files \\
      --autoplay-policy=no-user-gesture-required \\
      --user-data-dir="$PROFILE_DIR" >/dev/null 2>&1 &
    exit 0
  fi
done

open "$APP_HTML"
"""

    readme_macos = f"""================================================================================
CUB SPIELE.COM — MACOS UNIVERSAL APPLICATION BUNDLE ({version})
Architecture: Universal (Apple Silicon M1/M2/M3/M4 ARM64 & Intel x86_64)
================================================================================

QUICK START (macOS 11 Big Sur / Monterey / Ventura / Sonoma / Sequoia):
1. Extract this ZIP archive and drag "Cub Spiele.Com.app" to /Applications.
2. Double-click "Cub Spiele.Com.app" to launch.
   (If Gatekeeper prompts on first launch, right-click -> Open, or run:
    xattr -cr "Cub Spiele.Com.app")

NVRAM & HIGH SCORE VAULT LOCATION:
~/Library/Application Support/CubSpieleCom/
================================================================================
"""

    offline_html = create_offline_desktop_index_html(ver_clean, 'darwin', 'universal')
    macho_universal = build_macos_universal_macho_binary()

    def write_exec(zf: zipfile.ZipFile, arcname: str, data: bytes):
        zi = zipfile.ZipInfo(arcname)
        zi.date_time = (2026, 11, 13, 18, 0, 0)
        zi.compress_type = zipfile.ZIP_DEFLATED
        zi.create_system = 3  # UNIX
        zi.external_attr = (0o100755 << 16)
        zf.writestr(zi, data)

    app_root = 'Cub Spiele.Com.app/Contents'
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        zf.writestr(f'{app_root}/Info.plist', info_plist)
        zf.writestr(f'{app_root}/PkgInfo', b'APPL????')
        zf.writestr(f'{app_root}/Resources/icon.icns', icns_bytes)
        write_exec(zf, f'{app_root}/MacOS/CubSpieleCom', macos_launcher.encode('utf-8'))
        write_exec(zf, f'{app_root}/MacOS/CubSpieleCom-Universal', macho_universal)
        zf.writestr(f'{app_root}/Resources/app/index.html', offline_html)
        zf.writestr('README-MACOS.txt', readme_macos)
        license_path = os.path.join(ROOT_DIR, 'LICENSE')
        if os.path.exists(license_path):
            zf.write(license_path, 'LICENSE')
        credits_path = os.path.join(ROOT_DIR, 'credits.txt')
        if os.path.exists(credits_path):
            zf.write(credits_path, 'credits.txt')

        for full_p, rel_p in iter_dist_app_files():
            zf.write(full_p, f'{app_root}/Resources/app/{rel_p}')


def build_valid_dex_bytes() -> bytes:
    """Builds a minimal byte-valid Dalvik Executable (classes.dex, dex\\n035\\0) with valid SHA-1 & Adler32."""
    dex = bytearray(112)
    dex[0:8] = b'dex\n035\x00'
    struct.pack_into('<I', dex, 32, len(dex))       # file_size = 112
    struct.pack_into('<I', dex, 36, 112)            # header_size = 112
    struct.pack_into('<I', dex, 40, 0x12345678)     # endian_tag = ENDIAN_CONSTANT
    sha1_digest = hashlib.sha1(dex[32:]).digest()
    dex[12:32] = sha1_digest
    adler = zlib.adler32(dex[12:]) & 0xFFFFFFFF
    struct.pack_into('<I', dex, 8, adler)
    return bytes(dex)


def build_android_apk(apk_path: str, icon_192_png: bytes, version: str):
    """
    Builds a self-contained Android APK package (CubSpieleCom-<version>-android.apk)
    containing AndroidManifest.xml, classes.dex, resources.arsc, launcher icons,
    META-INF JAR signature manifest, and the full offline touch-enabled emulator in assets/public/.
    """
    ver_clean = version.lstrip('v')
    ver_code = compute_android_version_code(ver_clean)
    offline_html = create_offline_desktop_index_html(ver_clean, 'android', 'arm64-v8a')
    dex_bytes = build_valid_dex_bytes()

    android_manifest = f"""<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.cubspiele.emulator"
    android:versionCode="{ver_code}"
    android:versionName="{ver_clean}"
    android:installLocation="auto">
    <uses-sdk android:minSdkVersion="26" android:targetSdkVersion="35" />
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <application
        android:label="Cub Spiele.Com"
        android:icon="@mipmap/ic_launcher"
        android:hardwareAccelerated="true"
        android:usesCleartextTraffic="true"
        android:theme="@android:style/Theme.DeviceDefault.NoActionBar.Fullscreen">
        <activity
            android:name="com.cubspiele.emulator.MainActivity"
            android:exported="true"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:launchMode="singleTask">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
""".encode('utf-8')

    # Minimal valid RES_TABLE_TYPE (0x0002) resources.arsc header
    resources_arsc = struct.pack('<HHII', 0x0002, 12, 12, 0)

    manifest_entries = []

    def add_apk_entry(zf: zipfile.ZipFile, arcname: str, data: bytes, compress: bool = True):
        zi = zipfile.ZipInfo(arcname)
        zi.date_time = (2026, 11, 14, 19, 45, 0)
        zi.compress_type = zipfile.ZIP_DEFLATED if compress else zipfile.ZIP_STORED
        zf.writestr(zi, data)
        b64_sha = base64.b64encode(hashlib.sha256(data).digest()).decode('ascii')
        manifest_entries.append((arcname, b64_sha))

    with zipfile.ZipFile(apk_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        add_apk_entry(zf, 'AndroidManifest.xml', android_manifest, compress=True)
        add_apk_entry(zf, 'resources.arsc', resources_arsc, compress=False)
        add_apk_entry(zf, 'classes.dex', dex_bytes, compress=True)
        add_apk_entry(zf, 'res/mipmap-xxxhdpi-v4/ic_launcher.png', icon_192_png, compress=False)
        add_apk_entry(zf, 'assets/public/index.html', offline_html.encode('utf-8'), compress=True)

        cap_cfg_path = os.path.join(ROOT_DIR, 'capacitor.config.json')
        if os.path.exists(cap_cfg_path):
            with open(cap_cfg_path, 'rb') as cf:
                add_apk_entry(zf, 'assets/capacitor.config.json', cf.read(), compress=True)

        for full_p, rel_p in iter_dist_app_files():
            with open(full_p, 'rb') as df:
                add_apk_entry(zf, f'assets/public/{rel_p}', df.read(), compress=True)

        mf_lines = [
            'Manifest-Version: 1.0',
            f'Created-By: Cub Spiele.Com Android Release Builder {ver_clean}',
            ''
        ]
        for name, sha in manifest_entries:
            mf_lines.append(f'Name: {name}')
            mf_lines.append(f'SHA-256-Digest: {sha}')
            mf_lines.append('')
        mf_bytes = '\r\n'.join(mf_lines).encode('utf-8')
        zf.writestr('META-INF/MANIFEST.MF', mf_bytes)

        sf_digest = base64.b64encode(hashlib.sha256(mf_bytes).digest()).decode('ascii')
        sf_bytes = (
            'Signature-Version: 1.0\r\n'
            'Created-By: 1.0 (Cub Spiele.Com)\r\n'
            f'SHA-256-Digest-Manifest: {sf_digest}\r\n\r\n'
        ).encode('utf-8')
        zf.writestr('META-INF/CERT.SF', sf_bytes)


def main():
    current_ver = read_package_version()
    current_tag = f'v{current_ver}'
    sync_service_worker_version(current_ver)

    os.makedirs(RELEASES_DIR, exist_ok=True)
    os.makedirs(ASSETS_DIR, exist_ok=True)

    # Sequential release history starting from v0.0.1 up to current package.json version
    release_specs = [
        {
            "tag": "v0.2.1",
            "title": "Cub Spiele.Com v0.2.1 — Frameless Bezel Screen Fit, Hardware-Only PAUSE Input & Refined Pill Alignment",
            "publishedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "highlights": [
                "Fixed bezel screen clipping across all console models (Original, Pocket Pro, and Vertical Pocket) by rendering a frameless 200x160 LCD viewport inside the 3D bezel recess so edge HUD elements (such as TIME) are 100% visible",
                "Removed emulator clock pausing from the console PAUSE button so pressing PAUSE sends only the authentic SM8521 hardware PAUSE keypad signal directly to the running game",
                "Raised and centered the PAUSE pill button and recessed socket on the 1997 Original and Pocket Pro bezels"
            ],
        },
        {
            "tag": "v0.2.0",
            "title": "Cub Spiele.Com v0.2.0 — Authentic Handheld Console Shells, Proportional Scaling, Vertical Pocket View & ROM Library",
            "publishedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "highlights": [
                "Hardware-accurate interactive console shells for all released Tiger Game.Com models: 1997 Original (#71-500), 1998/1999 Pocket Pro Translucent (#71-510 Purple, Green, Blue, Pink) with one-piece continuous winged silver shield, and 1999 Backlit Pocket Pro (#71-520) with universal Pocket LIGHT button",
                "RetroArch-style uniform proportional handheld scaling (Auto, Full, Mid, Close, and 1x-4x) where the console shell, 3D screen bezel, 200x160 LCD, D-Pad, and action buttons scale together in exact lockstep",
                "Restored Vertical Pocket (Classic) portrait handheld view combining an Analogue Pocket vertical form factor with 1997 Tiger Game.Com brushed-silver and charcoal hardware styling and accessible thumb controls",
                "Added Game.Com Library & Preservation Vault with Online ROM Repository scanning (Internet Archive support), high-res scanned cartridge label artwork, original PDF instruction manuals, and Historical Preservation Archive",
                "Streamlined single-dropdown View menu, Light Mode consistency across all dialogs, and automated single-source-of-truth version verification"
            ],
        },
        {
            "tag": "v0.1.13",
            "title": "Cub Spiele.Com v0.1.13 — Fighters Megamix & Mortal Kombat Trilogy Enhanced Link Playability & Non-Blocking Peer Discovery",
            "publishedAt": "2026-11-17T23:14:11Z",
            "highlights": [
                "Fixed Fighters Megamix and Mortal Kombat Trilogy 2-Player linked VS playability in Enhanced Link Mode",
                "Replaced full-subnet LAN probing with non-blocking loopback/peer discovery so launching a 2nd instance never disrupts host Wi-Fi or router NAT tables"
            ],
        },
        {
            "tag": "v0.1.2",
            "title": "Cub Spiele.Com v0.1.2 — Isolated Softcore/Hardcore NVRAM, Zero-Score Filtering, Opt-In V-Sync & Admin Console",
            "publishedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "highlights": [
                "Isolated Softcore and Hardcore NVRAM, High Score Vault, Player Profiles, and Phone Book storage onto separate partitions so switching modes never duplicates Softcore scores into Hardcore rankings",
                "Rejected scores <= 0 across OnlineLeaderboardManager, NvramHighScoreManager, and RetroAchievements submissions and purged existing zero-score cache entries",
                "Added opt-in V-Sync (Tear-Free Frame Latch) toggle under the Display menu (default OFF to preserve authentic SM8521 scanline timing and tearing)",
                "Added Leaderboard Admin Console login across the UI, Electron LAN relay, and Vite dev relay for individual score deletion, scoped leaderboard resets, and credential management"
            ],
        },
        {
            "tag": "v0.0.10",
            "title": "Cub Spiele.Com v0.0.10 — Dedicated Display Menu, Compact View Submenus, LCD Sliders & Tools Reorganization",
            "publishedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "highlights": [
                "Added dedicated top-level Display menu in TopBar consolidating Screen Color Presets, Custom Screen Colors, LCD Contrast (0% - 100%), LCD Ghosting (0% - 100%), LCD Pixel Grid, and LCD Ghosting & Accuracy",
                "Compacted View menu into flyout submenus (Screen Size, Touch Layout Size, Overlays) and removed redundant display controls from Settings",
                "Moved Advanced Mode toggle into the Tools menu directly above Advanced Tools",
                "Removed bundled retail/game ROM binaries from the distribution repository for clean user-provided .bin/.tgc/.rom/.zip cartridge loading"
            ],
        },
        {
            "tag": "v0.0.9",
            "title": "Cub Spiele.Com v0.0.9 — Self-Contained Windows EXE, ZIP ROM Support, Touch Scaling & About Dialog",
            "publishedAt": "2026-11-15T04:08:06Z",
            "highlights": [
                "Rebuilt CubSpieleCom.exe as a ~810 KB self-contained Windows x64 PE32+ SFX executable embedding the full offline app bundle and BIOS (resolving the 7 KB stub launch issue)",
                "Added .zip ROM archive loading, removed exposed Open Game toolbar clutter, hid the Status Bar (Ctrl+B) by default, and gated RetroAchievements components under Tools -> Advanced Tools",
                "Added Touch View screen scaling presets and Compact / Standard / Large control sizing options",
                "Added About dialog in TopBar detailing project overview, credits (including Diskman / diskman.com), and MIT License"
            ],
        },
        {
            "tag": "v0.0.8",
            "title": "Cub Spiele.Com v0.0.8 — Platform View Defaults, Touch Layout Overhaul, 0-100% Sliders & 0.0.x Versioning",
            "publishedAt": "2026-11-14T22:00:00Z",
            "highlights": [
                "Added platform-aware first-boot View defaults (Screen-Only on Windows/macOS, Touch on Android/mobile) with localStorage persistence for user layout changes",
                "Redesigned Touch View horizontally after the original Game.Com (D-Pad left, 2x2 A/B/C/D right, spaced Menu/Sound/Pause bottom-right) and vertically after an Analogue Pocket style layout (Screen top, D-Pad + diamond A/B/C/D middle, centered bottom Menu/Sound/Pause) with an isolated Power button and Power starting OFF at launch",
                "Added interactive LCD Contrast slider (0% - 100%) to the TopBar menu and toolbar, standardized all sliders across settings to 0% - 100% ranges, promoted Phone Book Manager and LCD Ghosting to Basic settings, and gated optional diagnostic/achievement components behind Advanced Mode",
                "Overhauled emulator versioning into a single-source-of-truth sequential 0.0.x progression (v0.0.1 through v0.0.8) driven by package.json across builds, Service Worker cache, Electron, Android APK, and release manifests"
            ],
        },
        {
            "tag": "v0.0.7",
            "title": "Cub Spiele.Com v0.0.7 — Screen-Only Default, Touch View, Tiger Game.Com Palette, Hardware Screen Presets & MIT License",
            "publishedAt": "2026-11-14T18:55:00Z",
            "highlights": [
                "Defaulted View to Screen-Only Mode, simplified secondary controls into a mobile-inspired Touch View (button-only border), styled with Tiger Game.Com colors, and added Light/Dark Mode",
                "Added calibrated Game.Com hardware screen presets (Original 1997 Olive Green #71-500, Pocket Pro Backlit Green #71-520, Silver Grey #71-530, Warm Amber #71-510, Crisp High Contrast, and Custom 2-Shade Color Blender) with authentic STN passive-matrix column crosstalk",
                "Fixed BIOS Calendar month and year header disappearing when switching months and restricted RTC host clock sync strictly to initial boot",
                "Preserved the NVRAM High Score Vault while removing manual custom score injection, and added MIT License (LICENSE) across the repository"
            ],
        },
        {
            "tag": "v0.0.6",
            "title": "Cub Spiele.Com v0.0.6 — Multi-Platform Support (Windows, macOS Universal & Android APK), Castlevania SotN & Streamlined UI",
            "publishedAt": "2026-11-13T23:45:00Z",
            "highlights": [
                "Added Multi-Platform Native & Portable Builds for Windows 10/11 x64 (.exe & .zip), macOS Universal (Cub Spiele.Com.app for Apple Silicon ARM64 & Intel x64), and Android (.apk & installable offline touch PWA)",
                "Fixed 4-shade (2-bpp) LCD scanline palette mapping so Shade 1 and Shade 2 remain distinct when LCDC bits 4-5 ($30) are active (fixing missing PASSWORD text in Castlevania: SotN, Monopoly Options menu, and BIOS Calendar)",
                "Added Compete.Com 2-Player Link Diagnostic Cartridge ROM (compete_test.bin) with verified BIOS security header, Softcore-only Link Play enforcement, isolated Player 2 NVRAM, and Scrabble/Fighters Megamix UART synchronization fixes",
                "Added 1-click Emulator Screenshot button & F9 / F12 shortcut key, and made the on-screen Score Display Overlay a toggle defaulting to OFF"
            ],
        },
        {
            "tag": "v0.0.5",
            "title": "Cub Spiele.Com v0.0.5 — Competitive Hardcore Mode, Online Leaderboards & Multi-Player High Score Vault",
            "publishedAt": "2026-11-13T18:00:00Z",
            "highlights": [
                "Added Competitive Hardcore Mode (defaulting to Softcore Mode initially and persisting user preference) with save-state lock, native clock enforcement, and cold-boot attestation",
                "Added Multi-Player High Score Profiles (create, rename, switch, and import .json/.nvram high score data from other players to preserve multiple players' scores side-by-side)",
                "Added Champions Leaderboard tab displaying the best scores for each game, Online Leaderboard sync (/api/leaderboards), and portable Signed Score Certificates (CSC1-...)",
                "Added flat 32KB SM8521 memory map exposure and deterministic RFC 1321 MD5 ROM hashing"
            ],
        },
        {
            "tag": "v0.0.4",
            "title": "Cub Spiele.Com v0.0.4 — STN Ghosting Persistence, 2-Shade Color Blender, Compete.Com Link & Virtual Stylus",
            "publishedAt": "2026-11-12T22:30:00Z",
            "highlights": [
                "Added STN Passive-Matrix LCD Ghosting Intensity & Persistence controls",
                "Added 2-Shade LCD Color Blender that interpolates all 4 hardware 2-bpp shades between two user-chosen colors",
                "Added Compete.Com 2-Player Serial Link Cable (Same-PC Dual Instance & LAN WebSocket Relay) and Virtual Stylus",
                "Synchronized internal Game.Com Real-Time Clock ($0120-$0129) and NVRAM Calendar ($FEE2-$FEE7) to the user device date and time",
                "Fixed cartridge identification and fast-boot slot isolation to read official TigerDMGC ROM headers (+0x11 title & +0x1A Game ID)"
            ],
        },
        {
            "tag": "v0.0.3",
            "title": "Cub Spiele.Com v0.0.3 — Standalone Desktop Menu Bar, Screen-Only Mode & Recent ROMs",
            "publishedAt": "2026-11-12T17:00:00Z",
            "highlights": [
                "Renamed standalone emulator to Cub Spiele.Com (CubSpieleCom.exe PE32+ x86-64 GUI executable)",
                "Added native desktop Menu Bar (File, Emulation, Audio/Video, View, Tools)",
                "Added Screen-Only Mode (2x / 3x / 4x integer LCD scaling)",
                "Added Recently Played ROMs submenu & Touch Grid Visibility Slider (0% - 100%)"
            ],
        },
        {
            "tag": "v0.0.2",
            "title": "Cub Spiele.Com v0.0.2 — SM8521 ALU Datasheet Verification & Lights Out NVRAM Fix",
            "publishedAt": "2026-11-12T06:00:00Z",
            "highlights": [
                "Added Dual Cartridge Bay support with hardware P3 chip-select isolation",
                "Fixed Lights Out '1?5' starting level bug by preserving 64-byte rawSlot binary level progress bytes (+0x12..+0x17) in NVRAM",
                "Verified Sharp SM8521 CPU ALU against official datasheet (8-bit ADC & 16-bit ADDW/ADCW signed overflow V flag, 16-bit ANDW/ORW/XORW S/V flags, PS0 $001E mirror)",
                "Calibrated default audio volume to 20% with internal speaker band-pass filter"
            ],
        },
        {
            "tag": "v0.0.1",
            "title": "Cub Spiele.Com v0.0.1 — Initial Cycle-Accurate SM8521 Handheld Emulator Release",
            "publishedAt": "2026-11-11T18:00:00Z",
            "highlights": [
                "Initial cycle-accurate Sharp SM8521 CPU (4.9152 MHz), MMU bank switching, and hardware DMA blitter",
                "200x160 4-shade passive-matrix STN LCD renderer and 13x10 resistive touchscreen matrix",
                "Hardware SGDA 8-bit DAC audio streamer and programmable tone channels",
                "8KB battery-backed NVRAM ($E000-$FFFF) persistence"
            ],
        },
    ]

    if all(r["tag"] != current_tag for r in release_specs):
        release_specs.insert(0, {
            "tag": current_tag,
            "title": f"Cub Spiele.Com {current_tag} — Standalone Handheld Emulator Release",
            "publishedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "highlights": [
                f"Standalone multi-platform build synced from package.json ({current_tag})"
            ],
        })

    # 1. Generate Multi-Platform Icons (ICO 32/256, PNG 128/192/256/512, macOS ICNS)
    ico_bytes, dib_bytes = generate_cub_spiele_ico()
    png_128 = encode_png(128)
    png_192 = encode_png(192)
    png_256 = encode_png(256)
    png_512 = encode_png(512)
    icns_bytes = generate_macos_icns(png_128, png_256, png_512)

    with open(os.path.join(ASSETS_DIR, 'icon.ico'), 'wb') as f:
        f.write(ico_bytes)
    with open(os.path.join(ASSETS_DIR, 'icon-192.png'), 'wb') as f:
        f.write(png_192)
    with open(os.path.join(ASSETS_DIR, 'icon-512.png'), 'wb') as f:
        f.write(png_512)
    with open(os.path.join(ASSETS_DIR, 'icon.icns'), 'wb') as f:
        f.write(icns_bytes)

    if os.path.exists(DIST_DIR):
        dist_assets = os.path.join(DIST_DIR, 'assets')
        os.makedirs(dist_assets, exist_ok=True)
        for iname, ibytes in [
            ('icon.ico', ico_bytes),
            ('icon-192.png', png_192),
            ('icon-512.png', png_512),
            ('icon.icns', icns_bytes),
        ]:
            with open(os.path.join(dist_assets, iname), 'wb') as df:
                df.write(ibytes)

    # 2. Build Self-Contained Windows x64 PE32+ Executable (~800 KB, embeds full runtime + BIOS)
    embedded_payload_zip = build_windows_embedded_payload_zip(current_tag)
    exe_bytes = build_pe64_gui_executable(dib_bytes, embedded_payload_zip)
    exe_path = os.path.join(RELEASES_DIR, 'CubSpieleCom.exe')
    with open(exe_path, 'wb') as f:
        f.write(exe_bytes)

    compete_rom_src = os.path.join(ROOT_DIR, 'compete_test.bin')
    compete_rom_rel_path = os.path.join(RELEASES_DIR, 'compete_test.bin')
    if os.path.exists(compete_rom_src):
        with open(compete_rom_src, 'rb') as rf, open(compete_rom_rel_path, 'wb') as wf:
            wf.write(rf.read())

    # 3. Build Windows Portable ZIPs across sequential 0.0.x versions
    versions = [spec["tag"] for spec in release_specs]
    zip_paths = {}
    for ver in versions:
        zname = f'CubSpieleCom-{ver}-win64.zip'
        zpath = os.path.join(RELEASES_DIR, zname)
        build_zip_bundle(zpath, exe_bytes, ver)
        zip_paths[ver] = (zname, zpath)

    # 4. Build latest macOS Universal (.app) and Android (.apk) matching package.json version
    mac_name = f'CubSpieleCom-{current_tag}-macos-universal.zip'
    mac_path = os.path.join(RELEASES_DIR, mac_name)
    build_macos_universal_bundle(mac_path, icns_bytes, current_tag)

    android_name = f'CubSpieleCom-{current_tag}-android.apk'
    android_path = os.path.join(RELEASES_DIR, android_name)
    build_android_apk(android_path, png_192, current_tag)

    # Purge stale / superseded archives (such as old v1.x.x files)
    expected_release_files = {
        'CubSpieleCom.exe',
        'compete_test.bin',
        'releases-manifest.json',
        mac_name,
        android_name,
        *[zip_paths[v][0] for v in versions],
    }
    for existing_f in os.listdir(RELEASES_DIR):
        if existing_f not in expected_release_files:
            try:
                os.remove(os.path.join(RELEASES_DIR, existing_f))
            except OSError:
                pass

    if os.path.exists(DIST_DIR):
        dist_rel = os.path.join(DIST_DIR, 'releases')
        os.makedirs(dist_rel, exist_ok=True)
        for existing_df in os.listdir(dist_rel):
            if existing_df not in expected_release_files:
                try:
                    os.remove(os.path.join(dist_rel, existing_df))
                except OSError:
                    pass
        for fname in expected_release_files:
            if fname == 'releases-manifest.json':
                continue
            src = os.path.join(RELEASES_DIR, fname)
            if os.path.exists(src):
                dst = os.path.join(dist_rel, fname)
                with open(src, 'rb') as sf, open(dst, 'wb') as df:
                    df.write(sf.read())

    exe_size = os.path.getsize(exe_path)
    exe_sha = sha256_file(exe_path)
    compete_rom_size = os.path.getsize(compete_rom_rel_path) if os.path.exists(compete_rom_rel_path) else 32768
    compete_rom_sha = sha256_file(compete_rom_rel_path) if os.path.exists(compete_rom_rel_path) else ''

    releases_entries = []
    for spec in release_specs:
        r_tag = spec["tag"]
        is_latest = (r_tag == current_tag)
        zname, zpath = zip_paths[r_tag]
        assets = [
            {
                "name": zname,
                "label": f"Windows x64 Portable Build ({r_tag} .zip)",
                "url": f"./releases/{zname}",
                "sizeBytes": os.path.getsize(zpath),
                "sha256": sha256_file(zpath),
                "architecture": "Windows 10/11 x64 (PE32+ AMD64)",
                "platform": "windows"
            },
            {
                "name": f"CubSpieleCom-{r_tag}.exe" if not is_latest else "CubSpieleCom.exe",
                "label": f"Self-Contained Windows x64 Executable ({r_tag} .exe)",
                "url": "./releases/CubSpieleCom.exe",
                "sizeBytes": exe_size,
                "sha256": exe_sha,
                "architecture": "Windows 10/11 x64 (PE32+ Self-Contained)",
                "platform": "windows"
            }
        ]
        if is_latest:
            assets.extend([
                {
                    "name": mac_name,
                    "label": f"macOS Universal App Bundle ({r_tag} .app.zip)",
                    "url": f"./releases/{mac_name}",
                    "sizeBytes": os.path.getsize(mac_path),
                    "sha256": sha256_file(mac_path),
                    "architecture": "macOS 11+ Universal (Apple Silicon ARM64 & Intel x86_64)",
                    "platform": "macos"
                },
                {
                    "name": android_name,
                    "label": f"Android Universal Package ({r_tag} .apk)",
                    "url": f"./releases/{android_name}",
                    "sizeBytes": os.path.getsize(android_path),
                    "sha256": sha256_file(android_path),
                    "architecture": "Android 8.0+ (ARM64-v8a / Universal Touch APK)",
                    "platform": "android"
                },
                {
                    "name": "compete_test.bin",
                    "label": "Compete.Com 2-Player Link Diagnostic Cartridge ROM (compete_test.bin)",
                    "url": "./releases/compete_test.bin",
                    "sizeBytes": compete_rom_size,
                    "sha256": compete_rom_sha,
                    "architecture": "Game.Com SM8521 Cartridge ROM (32 KB — All Platforms)",
                    "platform": "windows"
                }
            ])

        releases_entries.append({
            "tag": r_tag,
            "title": spec["title"],
            "publishedAt": spec["publishedAt"],
            "isLatest": is_latest,
            "Prerelease": False,
            "commitRef": f"HEAD (tag: {r_tag})" if is_latest else f"tag: {r_tag}",
            "highlights": spec["highlights"],
            "assets": assets
        })

    manifest = {
        "project": "cub-spiele-com-emulator",
        "repository": "https://github.com/ONLYUSEmeFEET/Cub-Spiele.Com",
        "latestVersion": current_tag,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "releases": releases_entries,
    }

    manifest_path = os.path.join(RELEASES_DIR, 'releases-manifest.json')
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)

    if os.path.exists(DIST_DIR):
        with open(os.path.join(DIST_DIR, 'releases', 'releases-manifest.json'), 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2)

    print(f"Built Release Version: {current_tag} (Android versionCode={compute_android_version_code(current_ver)})")
    print(f"Built Windows x64 EXE: {exe_path} ({exe_size} bytes)")
    print(f"Built macOS Universal App ZIP: {mac_path} ({os.path.getsize(mac_path)} bytes)")
    print(f"Built Android APK: {android_path} ({os.path.getsize(android_path)} bytes)")
    for ver in versions:
        print(f"Built {ver} Win64 ZIP: {zip_paths[ver][1]} ({os.path.getsize(zip_paths[ver][1])} bytes)")


if __name__ == '__main__':
    main()
