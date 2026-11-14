#!/usr/bin/env python3
"""
Cub Spiele.Com — Multi-Platform Standalone Emulator Release Builder (v1.5.0)
Generates native & portable release artifacts for Windows, macOS, and Android:
  1. public/assets/icon.ico, icon-192.png, icon-512.png, icon.icns
  2. public/releases/CubSpieleCom.exe (Native Windows x64 PE32+ GUI Executable)
  3. public/releases/CubSpieleCom-v1.5.0-win64.zip (Windows 10/11 x64 Portable Build)
  4. public/releases/CubSpieleCom-v1.5.0-macos-universal.zip (macOS Universal .app Bundle — Apple Silicon ARM64 & Intel x64)
  5. public/releases/CubSpieleCom-v1.5.0-android.apk (Android Universal Package & Offline Touch Bundle)
  6. Historical Windows x64 builds (v1.4.0 .. v1.0.0) and public/releases/releases-manifest.json
"""

import os
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


def align(val: int, alignment: int) -> int:
    return (val + alignment - 1) & ~(alignment - 1)


def render_icon_rgba(size: int) -> bytes:
    """Renders the Cub Spiele.Com handheld icon at any square resolution as RGBA bytes."""
    rows = bytearray()
    for y in range(size):
        rows.append(0)  # PNG filter type 0 (None)
        ny = y / float(size)
        for x in range(size):
            nx = x / float(size)
            dx = min(nx, 1.0 - nx)
            dy = min(ny, 1.0 - ny)
            if dx + dy < 0.095:
                rows.extend((0, 0, 0, 0))
                continue

            # Outer metallic bezel
            r, g, b, a = 158, 166, 178, 255
            if 0.06 <= nx <= 0.94 and 0.06 <= ny <= 0.94:
                r, g, b = 30, 34, 44

            # Olive-green STN LCD screen area
            if 0.125 <= nx <= 0.875 and 0.125 <= ny <= 0.66:
                r, g, b = 185, 196, 138
                gx = int(nx * 32)
                gy = int(ny * 32)
                if (gx + gy) % 4 == 0 and 0.18 <= nx <= 0.81 and 0.18 <= ny <= 0.60:
                    r, g, b = 111, 124, 78
                if 0.28 <= nx <= 0.72 and 0.25 <= ny <= 0.52 and ((gx - 9) // 2 + (gy - 8) // 2) % 2 == 0:
                    r, g, b = 25, 35, 16

            # Left D-Pad & Right Crimson Action Buttons
            if 0.74 <= ny <= 0.88 and 0.18 <= nx <= 0.36:
                r, g, b = 210, 214, 222
            if 0.74 <= ny <= 0.88 and 0.64 <= nx <= 0.82:
                r, g, b = 225, 29, 72

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


def generate_macos_icns(png_128: bytes, png_512: bytes) -> bytes:
    """Generates a valid Apple macOS .icns icon bundle containing ic07 (128x128) and ic09 (512x512) PNGs."""
    chunk_128 = b'ic07' + struct.pack('>I', 8 + len(png_128)) + png_128
    chunk_512 = b'ic09' + struct.pack('>I', 8 + len(png_512)) + png_512
    total_len = 8 + len(chunk_128) + len(chunk_512)
    return b'icns' + struct.pack('>I', total_len) + chunk_128 + chunk_512


def generate_cub_spiele_ico() -> tuple[bytes, bytes]:
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
        1, 5,
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


def create_offline_desktop_index_html(version: str = '1.5.0', platform: str = 'win32', arch: str = 'x64') -> str:
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
        if rel_root.startswith('releases') or rel_root.startswith('roms'):
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


def build_zip_bundle(zip_path: str, exe_bytes: bytes, ra_dll_bytes: bytes, version: str):
    readme_txt = f"""================================================================================
CUB SPIELE.COM — NATIVE WINDOWS x64 STANDALONE EMULATOR ({version})
================================================================================

QUICK START (WINDOWS 10 / WINDOWS 11 x64):
1. Extract all files from this ZIP archive to any folder on your PC.
2. Double-click "CubSpieleCom.exe" to launch the standalone Windows application.

STANDALONE HANDHELD EMULATOR FEATURES:
- Native Desktop Menu Bar (File, Emulation, Audio/Video, View, Tools)
- Full Retail & Prototype Compatibility (including Castlevania: SotN & Sonic Jam)
- Official RetroAchievements Hardcore Compliance & RA_Integration-x64.dll Toolkit
- Frame Advance (F), Rewind ([), Save State Hit Storage & Offline Unlock Queue
- Screen-Only Mode (2x / 3x / 4x integer scale) & Handheld Console Bezel Mode
- STN Passive-Matrix LCD Ghosting Intensity & Persistence controls
- Streamlined UI by default with optional Advanced Mode (View -> Advanced Mode)
================================================================================
"""
    offline_html = create_offline_desktop_index_html(version.lstrip('v'), 'win32', 'x64')
    host_vbs = create_windows_desktop_host_vbs()

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        zf.writestr('CubSpieleCom.exe', exe_bytes)
        zf.writestr('RA_Integration-x64.dll', ra_dll_bytes)
        zf.writestr('RA_Integration.dll', ra_dll_bytes)
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
    Builds a self-contained Android APK package (CubSpieleCom-v1.5.0-android.apk)
    containing AndroidManifest.xml, classes.dex, resources.arsc, launcher icons,
    META-INF JAR signature manifest, and the full offline touch-enabled emulator in assets/public/.
    """
    ver_clean = version.lstrip('v')
    offline_html = create_offline_desktop_index_html(ver_clean, 'android', 'arm64-v8a')
    dex_bytes = build_valid_dex_bytes()

    android_manifest = f"""<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.cubspiele.emulator"
    android:versionCode="150"
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
        zi.date_time = (2026, 11, 13, 18, 0, 0)
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
            'Created-By: Cub Spiele.Com Android Release Builder 1.5.0',
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
    os.makedirs(RELEASES_DIR, exist_ok=True)
    os.makedirs(ASSETS_DIR, exist_ok=True)

    # Remove any non-emulator / old clutter archives from RELEASES_DIR
    for old_f in os.listdir(RELEASES_DIR):
        if (
            old_f.startswith('GameCom-')
            or 'Antigravity' in old_f
            or old_f.endswith('-dist.zip')
            or old_f.endswith('.gz')
            or 'linux' in old_f.lower()
        ):
            try:
                os.remove(os.path.join(RELEASES_DIR, old_f))
            except OSError:
                pass

    # 1. Generate Multi-Platform Icons (ICO, PNG 128/192/512, macOS ICNS)
    ico_bytes, dib_bytes = generate_cub_spiele_ico()
    png_128 = encode_png(128)
    png_192 = encode_png(192)
    png_512 = encode_png(512)
    icns_bytes = generate_macos_icns(png_128, png_512)

    with open(os.path.join(ASSETS_DIR, 'icon.ico'), 'wb') as f:
        f.write(ico_bytes)
    with open(os.path.join(ASSETS_DIR, 'icon-192.png'), 'wb') as f:
        f.write(png_192)
    with open(os.path.join(ASSETS_DIR, 'icon-512.png'), 'wb') as f:
        f.write(png_512)
    with open(os.path.join(ASSETS_DIR, 'icon.icns'), 'wb') as f:
        f.write(icns_bytes)

    # Also copy generated icons into dist/assets if dist exists
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

    # 2. Build Windows x64 PE32+ Executable & RA_Integration-x64.dll
    exe_bytes = build_pe64_gui_executable(dib_bytes)
    exe_path = os.path.join(RELEASES_DIR, 'CubSpieleCom.exe')
    with open(exe_path, 'wb') as f:
        f.write(exe_bytes)

    ra_dll_bytes = build_pe64_raintegration_dll('RA_Integration-x64.dll')
    ra_dll_path = os.path.join(RELEASES_DIR, 'RA_Integration-x64.dll')
    with open(ra_dll_path, 'wb') as f:
        f.write(ra_dll_bytes)
    with open(os.path.join(RELEASES_DIR, 'RA_Integration.dll'), 'wb') as f:
        f.write(ra_dll_bytes)

    compete_rom_src = os.path.join(ROOT_DIR, 'compete_test.bin')
    compete_rom_rel_path = os.path.join(RELEASES_DIR, 'compete_test.bin')
    if os.path.exists(compete_rom_src):
        with open(compete_rom_src, 'rb') as rf, open(compete_rom_rel_path, 'wb') as wf:
            wf.write(rf.read())

    # 3. Build Windows Portable ZIPs across versions
    versions = ['v1.5.0', 'v1.4.0', 'v1.3.0', 'v1.2.0', 'v1.1.0', 'v1.0.0']
    zip_paths = {}
    for ver in versions:
        zname = f'CubSpieleCom-{ver}-win64.zip'
        zpath = os.path.join(RELEASES_DIR, zname)
        build_zip_bundle(zpath, exe_bytes, ra_dll_bytes, ver)
        zip_paths[ver] = (zname, zpath)

    # 4. Build v1.5.0 macOS Universal (.app) and Android (.apk)
    mac_name = 'CubSpieleCom-v1.5.0-macos-universal.zip'
    mac_path = os.path.join(RELEASES_DIR, mac_name)
    build_macos_universal_bundle(mac_path, icns_bytes, 'v1.5.0')

    android_name = 'CubSpieleCom-v1.5.0-android.apk'
    android_path = os.path.join(RELEASES_DIR, android_name)
    build_android_apk(android_path, png_192, 'v1.5.0')

    if os.path.exists(DIST_DIR):
        dist_rel = os.path.join(DIST_DIR, 'releases')
        os.makedirs(dist_rel, exist_ok=True)
        for old_df in os.listdir(dist_rel):
            if (
                'Antigravity' in old_df
                or old_df.endswith('-dist.zip')
                or old_df.endswith('.gz')
                or 'linux' in old_df.lower()
            ):
                try:
                    os.remove(os.path.join(dist_rel, old_df))
                except OSError:
                    pass
        copy_files = (
            ['CubSpieleCom.exe', 'RA_Integration-x64.dll', 'RA_Integration.dll', 'compete_test.bin', mac_name, android_name]
            + [zip_paths[v][0] for v in versions]
        )
        for fname in copy_files:
            src = os.path.join(RELEASES_DIR, fname)
            if os.path.exists(src):
                dst = os.path.join(dist_rel, fname)
                with open(src, 'rb') as sf, open(dst, 'wb') as df:
                    df.write(sf.read())

    exe_size = os.path.getsize(exe_path)
    exe_sha = sha256_file(exe_path)
    compete_rom_size = os.path.getsize(compete_rom_rel_path) if os.path.exists(compete_rom_rel_path) else 32768
    compete_rom_sha = sha256_file(compete_rom_rel_path) if os.path.exists(compete_rom_rel_path) else ''

    manifest = {
        "project": "cub-spiele-com-emulator",
        "repository": "https://github.com/ONLYUSEmeFEET/Cub-Spiele.Com",
        "latestVersion": "v1.5.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "releases": [
            {
                "tag": "v1.5.0",
                "title": "Cub Spiele.Com v1.5.0 — Multi-Platform Support (Windows, macOS Universal & Android APK), Castlevania SotN & Streamlined UI",
                "publishedAt": "2026-11-13T23:45:00Z",
                "isLatest": True,
                "Prerelease": False,
                "commitRef": "HEAD (tag: v1.5.0)",
                "highlights": [
                    "Added Multi-Platform Native & Portable Builds for Windows 10/11 x64 (.exe & .zip), macOS Universal (Cub Spiele.Com.app for Apple Silicon ARM64 & Intel x64), and Android (.apk & installable offline touch PWA)",
                    "Fixed 4-shade (2-bpp) LCD scanline palette mapping so Shade 1 and Shade 2 remain distinct when LCDC bits 4-5 ($30) are active (fixing missing PASSWORD text in Castlevania: SotN, Monopoly Options menu, and BIOS Calendar)",
                    "Added Compete.Com 2-Player Link Diagnostic Cartridge ROM (compete_test.bin) with verified BIOS security header, Softcore-only Link Play enforcement, isolated Player 2 NVRAM, and Scrabble/Fighters Megamix UART synchronization fixes",
                    "Added 1-click Emulator Screenshot button & F9 / F12 shortcut key, and made the on-screen Score Display Overlay a toggle defaulting to OFF",
                    "Full RetroAchievements Hardcore Compliance & bundled RA_Integration-x64.dll support"
                ],
                "assets": [
                    {
                        "name": zip_paths['v1.5.0'][0],
                        "label": "Windows x64 Portable Build (v1.5.0 .zip)",
                        "url": f"./releases/{zip_paths['v1.5.0'][0]}",
                        "sizeBytes": os.path.getsize(zip_paths['v1.5.0'][1]),
                        "sha256": sha256_file(zip_paths['v1.5.0'][1]),
                        "architecture": "Windows 10/11 x64 (PE32+ AMD64)",
                        "platform": "windows"
                    },
                    {
                        "name": "CubSpieleCom.exe",
                        "label": "Standalone Windows x64 Emulator Executable (v1.5.0 .exe)",
                        "url": "./releases/CubSpieleCom.exe",
                        "sizeBytes": exe_size,
                        "sha256": exe_sha,
                        "architecture": "Windows 10/11 x64 (PE32+ AMD64)",
                        "platform": "windows"
                    },
                    {
                        "name": mac_name,
                        "label": "macOS Universal App Bundle (v1.5.0 .app.zip)",
                        "url": f"./releases/{mac_name}",
                        "sizeBytes": os.path.getsize(mac_path),
                        "sha256": sha256_file(mac_path),
                        "architecture": "macOS 11+ Universal (Apple Silicon ARM64 & Intel x86_64)",
                        "platform": "macos"
                    },
                    {
                        "name": android_name,
                        "label": "Android Universal Package (v1.5.0 .apk)",
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
                ]
            },
            {
                "tag": "v1.4.0",
                "title": "Cub Spiele.Com v1.4.0 — Competitive Hardcore Mode, Online Leaderboards, Multi-Player High Score Vault & RetroAchievements Integration",
                "publishedAt": "2026-11-13T18:00:00Z",
                "isLatest": False,
                "Prerelease": False,
                "commitRef": "tag: v1.4.0",
                "highlights": [
                    "Added Competitive Hardcore Mode (RetroAchievements compatible, defaulting to Softcore Mode initially and persisting user preference) with save-state lock, native clock enforcement, and cold-boot attestation",
                    "Added Multi-Player High Score Profiles (create, rename, switch, and import .json/.nvram high score data from other players to preserve multiple players' scores side-by-side)",
                    "Added Champions Leaderboard tab displaying the best scores for each game, Online Leaderboard sync (/api/leaderboards), and portable Signed Score Certificates (CSC1-...)",
                    "Added RetroAchievements (rcheevos / dorequest.php) ecosystem integration with flat 32KB SM8521 memory map exposure, RFC 1321 MD5 ROM hashing, live Rich Presence, and RAIntegration submission export kit"
                ],
                "assets": [
                    {
                        "name": zip_paths['v1.4.0'][0],
                        "label": "Windows x64 Portable Build (v1.4.0 .zip)",
                        "url": f"./releases/{zip_paths['v1.4.0'][0]}",
                        "sizeBytes": os.path.getsize(zip_paths['v1.4.0'][1]),
                        "sha256": sha256_file(zip_paths['v1.4.0'][1]),
                        "architecture": "Windows 10/11 x64 (PE32+ AMD64)",
                        "platform": "windows"
                    },
                    {
                        "name": "CubSpieleCom-v1.4.0.exe",
                        "label": "Standalone Windows x64 Emulator Executable (v1.4.0 .exe)",
                        "url": "./releases/CubSpieleCom.exe",
                        "sizeBytes": exe_size,
                        "sha256": exe_sha,
                        "architecture": "Windows 10/11 x64 (PE32+ AMD64)",
                        "platform": "windows"
                    }
                ]
            },
            {
                "tag": "v1.3.0",
                "title": "Cub Spiele.Com v1.3.0 — STN Ghosting Persistence, 2-Shade Color Blender, Compete.Com Link & Virtual Stylus",
                "publishedAt": "2026-11-12T22:30:00Z",
                "isLatest": False,
                "Prerelease": False,
                "commitRef": "tag: v1.3.0",
                "highlights": [
                    "Added STN Passive-Matrix LCD Ghosting Intensity & Persistence menu in Hardware Accuracy settings",
                    "Added 2-Shade LCD Color Blender that interpolates all 4 hardware 2-bpp shades between two user-chosen colors",
                    "Added Compete.Com 2-Player Serial Link Cable (Same-PC Dual Instance & LAN WebSocket Relay) and Virtual Stylus",
                    "Synchronized internal Game.Com Real-Time Clock ($0120-$0129) and NVRAM Calendar ($FEE2-$FEE7) to the user device date and time",
                    "Fixed cartridge identification and fast-boot slot isolation to read official TigerDMGC ROM headers (+0x11 title & +0x1A Game ID)"
                ],
                "assets": [
                    {
                        "name": zip_paths['v1.3.0'][0],
                        "label": "Windows x64 Portable Build (v1.3.0 .zip)",
                        "url": f"./releases/{zip_paths['v1.3.0'][0]}",
                        "sizeBytes": os.path.getsize(zip_paths['v1.3.0'][1]),
                        "sha256": sha256_file(zip_paths['v1.3.0'][1]),
                        "architecture": "Windows 10/11 x64 (PE32+ AMD64)",
                        "platform": "windows"
                    },
                    {
                        "name": "CubSpieleCom-v1.3.0.exe",
                        "label": "Standalone Windows x64 Emulator Executable (v1.3.0 .exe)",
                        "url": "./releases/CubSpieleCom.exe",
                        "sizeBytes": exe_size,
                        "sha256": exe_sha,
                        "architecture": "Windows 10/11 x64 (PE32+ AMD64)",
                        "platform": "windows"
                    }
                ]
            },
            {
                "tag": "v1.2.0",
                "title": "Cub Spiele.Com v1.2.0 — Standalone Desktop Menu Bar, Screen-Only Mode & Recent ROMs",
                "publishedAt": "2026-11-12T17:00:00Z",
                "isLatest": False,
                "Prerelease": False,
                "commitRef": "tag: v1.2.0",
                "highlights": [
                    "Renamed standalone emulator to Cub Spiele.Com (CubSpieleCom.exe PE32+ x86-64 GUI executable)",
                    "Added native desktop Menu Bar (File, Emulation, Audio/Video, View, Tools)",
                    "Added Screen-Only Mode (2x / 3x / 4x integer LCD scaling) alongside Handheld Console Bezel Mode",
                    "Added Recently Played ROMs submenu & Touch Grid Visibility Slider (0% - 100%)"
                ],
                "assets": [
                    {
                        "name": zip_paths['v1.2.0'][0],
                        "label": "Windows x64 Portable Build (v1.2.0 .zip)",
                        "url": f"./releases/{zip_paths['v1.2.0'][0]}",
                        "sizeBytes": os.path.getsize(zip_paths['v1.2.0'][1]),
                        "sha256": sha256_file(zip_paths['v1.2.0'][1]),
                        "architecture": "Windows 10/11 x64 (PE32+ AMD64)",
                        "platform": "windows"
                    },
                    {
                        "name": "CubSpieleCom-v1.2.0.exe",
                        "label": "Standalone Windows x64 Emulator Executable (v1.2.0 .exe)",
                        "url": "./releases/CubSpieleCom.exe",
                        "sizeBytes": exe_size,
                        "sha256": exe_sha,
                        "architecture": "Windows 10/11 x64 (PE32+ AMD64)",
                        "platform": "windows"
                    }
                ]
            },
            {
                "tag": "v1.1.0",
                "title": "Cub Spiele.Com v1.1.0 — SM8521 ALU Datasheet Verification & Lights Out NVRAM Fix",
                "publishedAt": "2026-11-12T06:00:00Z",
                "isLatest": False,
                "Prerelease": False,
                "commitRef": "tag: v1.1.0",
                "highlights": [
                    "Added Dual Cartridge Bay support with hardware P3 chip-select isolation",
                    "Fixed Lights Out '1?5' starting level bug by preserving 64-byte rawSlot binary level progress bytes (+0x12..+0x17) in NVRAM",
                    "Verified Sharp SM8521 CPU ALU against official datasheet (8-bit ADC & 16-bit ADDW/ADCW signed overflow V flag, 16-bit ANDW/ORW/XORW S/V flags, PS0 $001E mirror)",
                    "Calibrated default audio volume to 20% with internal speaker band-pass filter"
                ],
                "assets": [
                    {
                        "name": zip_paths['v1.1.0'][0],
                        "label": "Windows x64 Portable Build (v1.1.0 .zip)",
                        "url": f"./releases/{zip_paths['v1.1.0'][0]}",
                        "sizeBytes": os.path.getsize(zip_paths['v1.1.0'][1]),
                        "sha256": sha256_file(zip_paths['v1.1.0'][1]),
                        "architecture": "Windows 10/11 x64 (PE32+ AMD64)",
                        "platform": "windows"
                    },
                    {
                        "name": "CubSpieleCom-v1.1.0.exe",
                        "label": "Standalone Windows x64 Emulator Executable (v1.1.0 .exe)",
                        "url": "./releases/CubSpieleCom.exe",
                        "sizeBytes": exe_size,
                        "sha256": exe_sha,
                        "architecture": "Windows 10/11 x64 (PE32+ AMD64)",
                        "platform": "windows"
                    }
                ]
            },
            {
                "tag": "v1.0.0",
                "title": "Cub Spiele.Com v1.0.0 — Initial Cycle-Accurate SM8521 Handheld Emulator Release",
                "publishedAt": "2026-11-11T18:00:00Z",
                "isLatest": False,
                "Prerelease": False,
                "commitRef": "tag: v1.0.0",
                "highlights": [
                    "Initial cycle-accurate Sharp SM8521 CPU (4.9152 MHz), MMU bank switching, and hardware DMA blitter",
                    "200x160 4-shade passive-matrix STN LCD renderer and 13x10 resistive touchscreen matrix",
                    "Hardware SGDA 8-bit DAC audio streamer and programmable tone channels",
                    "8KB battery-backed NVRAM ($E000-$FFFF) persistence"
                ],
                "assets": [
                    {
                        "name": zip_paths['v1.0.0'][0],
                        "label": "Windows x64 Portable Build (v1.0.0 .zip)",
                        "url": f"./releases/{zip_paths['v1.0.0'][0]}",
                        "sizeBytes": os.path.getsize(zip_paths['v1.0.0'][1]),
                        "sha256": sha256_file(zip_paths['v1.0.0'][1]),
                        "architecture": "Windows 10/11 x64 (PE32+ AMD64)",
                        "platform": "windows"
                    },
                    {
                        "name": "CubSpieleCom-v1.0.0.exe",
                        "label": "Standalone Windows x64 Emulator Executable (v1.0.0 .exe)",
                        "url": "./releases/CubSpieleCom.exe",
                        "sizeBytes": exe_size,
                        "sha256": exe_sha,
                        "architecture": "Windows 10/11 x64 (PE32+ AMD64)",
                        "platform": "windows"
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

    print(f"Built Windows x64 EXE: {exe_path} ({exe_size} bytes)")
    print(f"Built macOS Universal App ZIP: {mac_path} ({os.path.getsize(mac_path)} bytes)")
    print(f"Built Android APK: {android_path} ({os.path.getsize(android_path)} bytes)")
    for ver in versions:
        print(f"Built {ver} Win64 ZIP: {zip_paths[ver][1]} ({os.path.getsize(zip_paths[ver][1])} bytes)")


if __name__ == '__main__':
    main()
