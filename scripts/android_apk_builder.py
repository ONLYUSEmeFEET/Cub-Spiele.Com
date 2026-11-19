#!/usr/bin/env python3
"""
Cub Spiele.Com — Spec-Compliant Android APK Builder (Pure Python + Node crypto signer)
Produces a valid, zipaligned, v1+v2 signed Android APK with:
  - Binary AXML AndroidManifest.xml (RES_XML_TYPE 0x0003)
  - Valid resources.arsc (RES_TABLE_TYPE 0x0002) with @mipmap/ic_launcher & @string/app_name
  - Real Dalvik classes.dex (dex\\n035\\0) implementing com.cubspiele.emulator.MainActivity
  - 4-byte zipaligned ZIP_STORED entries (required for targetSdkVersion >= 30)
  - APK Signature Scheme v1 (META-INF/MANIFEST.MF, CERT.SF, CERT.RSA) + v2 (APK Sig Block 42)
"""

import base64
import hashlib
import os
import struct
import subprocess
import tempfile
import zipfile
import zlib

# Standard Android android.R.attr resource IDs
ATTR_RES_IDS = {
    'theme': 0x01010000,
    'label': 0x01010001,
    'icon': 0x01010002,
    'name': 0x01010003,
    'exported': 0x01010010,
    'launchMode': 0x0101001D,
    'configChanges': 0x0101001F,
    'minSdkVersion': 0x0101020C,
    'versionCode': 0x0101021B,
    'versionName': 0x0101021C,
    'targetSdkVersion': 0x01010270,
    'installLocation': 0x010102B7,
    'hardwareAccelerated': 0x010102D3,
    'usesCleartextTraffic': 0x010104EC,
}

TYPE_REFERENCE = 0x01
TYPE_STRING = 0x03
TYPE_INT_DEC = 0x10
TYPE_INT_HEX = 0x11
TYPE_INT_BOOLEAN = 0x12

ANDROID_NS = 'http://schemas.android.com/apk/res/android'


def _encode_utf8_len(val: int) -> bytes:
    if val < 0x80:
        return bytes([val])
    return bytes([((val >> 8) & 0x7F) | 0x80, val & 0xFF])


def build_utf8_string_pool(strings: list[str]) -> bytes:
    """Builds a standard AOSP ResStringPool_header (0x0001) with UTF8_FLAG (0x0100)."""
    offsets = []
    pool = bytearray()
    for s in strings:
        offsets.append(len(pool))
        u8 = s.encode('utf-8')
        u16_len = len(s.encode('utf-16-le')) // 2
        pool.extend(_encode_utf8_len(u16_len))
        pool.extend(_encode_utf8_len(len(u8)))
        pool.extend(u8)
        pool.append(0)

    while len(pool) % 4 != 0:
        pool.append(0)

    header_size = 28
    strings_start = header_size + 4 * len(strings)
    total_size = strings_start + len(pool)

    hdr = struct.pack(
        '<HHIIIIII',
        0x0001,          # RES_STRING_POOL_TYPE
        header_size,     # headerSize
        total_size,      # size
        len(strings),    # stringCount
        0,               # styleCount
        0x00000100,      # flags = UTF8_FLAG
        strings_start,   # stringsStart
        0,               # stylesStart
    )
    off_table = b''.join(struct.pack('<I', o) for o in offsets)
    return hdr + off_table + bytes(pool)


def build_binary_android_manifest(version_code: int, version_name: str) -> bytes:
    """Compiles AndroidManifest.xml into Android Binary XML (AXML)."""
    # Strings 0..N-1 that have resource IDs MUST come first in exact ATTR_RES_IDS order
    ordered_attr_names = list(ATTR_RES_IDS.keys())
    res_ids = [ATTR_RES_IDS[k] for k in ordered_attr_names]

    strings = list(ordered_attr_names)
    str_idx = {s: i for i, s in enumerate(strings)}

    def intern(s: str) -> int:
        if s not in str_idx:
            str_idx[s] = len(strings)
            strings.append(s)
        return str_idx[s]

    # Pre-intern namespace & all element/attribute strings
    ns_prefix = intern('android')
    ns_uri = intern(ANDROID_NS)

    # XML tree definition: (tag, [(ns, name, type, value), ...], children)
    # configChanges = orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode
    config_changes = 0x0080 | 0x0020 | 0x0010 | 0x0400 | 0x0004 | 0x0800 | 0x0100 | 0x0200  # 0x0FB4

    tree = (
        'manifest',
        [
            (None, 'package', TYPE_STRING, 'com.cubspiele.emulator'),
            (ANDROID_NS, 'versionCode', TYPE_INT_DEC, version_code),
            (ANDROID_NS, 'versionName', TYPE_STRING, version_name),
            (ANDROID_NS, 'installLocation', TYPE_INT_DEC, 0),  # auto
        ],
        [
            (
                'uses-sdk',
                [
                    (ANDROID_NS, 'minSdkVersion', TYPE_INT_DEC, 21),
                    (ANDROID_NS, 'targetSdkVersion', TYPE_INT_DEC, 35),
                ],
                [],
            ),
            (
                'uses-permission',
                [(ANDROID_NS, 'name', TYPE_STRING, 'android.permission.INTERNET')],
                [],
            ),
            (
                'uses-permission',
                [(ANDROID_NS, 'name', TYPE_STRING, 'android.permission.VIBRATE')],
                [],
            ),
            (
                'uses-permission',
                [(ANDROID_NS, 'name', TYPE_STRING, 'android.permission.READ_EXTERNAL_STORAGE')],
                [],
            ),
            (
                'application',
                [
                    (ANDROID_NS, 'label', TYPE_REFERENCE, 0x7F020000),
                    (ANDROID_NS, 'icon', TYPE_REFERENCE, 0x7F010000),
                    (ANDROID_NS, 'hardwareAccelerated', TYPE_INT_BOOLEAN, 0xFFFFFFFF),
                    (ANDROID_NS, 'usesCleartextTraffic', TYPE_INT_BOOLEAN, 0xFFFFFFFF),
                    (ANDROID_NS, 'theme', TYPE_REFERENCE, 0x01030007),  # Theme.NoTitleBar.Fullscreen
                ],
                [
                    (
                        'activity',
                        [
                            (ANDROID_NS, 'name', TYPE_STRING, 'com.cubspiele.emulator.MainActivity'),
                            (ANDROID_NS, 'exported', TYPE_INT_BOOLEAN, 0xFFFFFFFF),
                            (ANDROID_NS, 'configChanges', TYPE_INT_HEX, config_changes),
                            (ANDROID_NS, 'launchMode', TYPE_INT_DEC, 2),  # singleTask
                        ],
                        [
                            (
                                'intent-filter',
                                [],
                                [
                                    (
                                        'action',
                                        [(ANDROID_NS, 'name', TYPE_STRING, 'android.intent.action.MAIN')],
                                        [],
                                    ),
                                    (
                                        'category',
                                        [(ANDROID_NS, 'name', TYPE_STRING, 'android.intent.category.LAUNCHER')],
                                        [],
                                    ),
                                ],
                            )
                        ],
                    )
                ],
            ),
        ],
    )

    # First pass to intern all strings
    def collect_strings(node):
        tag, attrs, children = node
        intern(tag)
        for ns, name, typ, val in attrs:
            if ns:
                intern(ns)
            intern(name)
            if typ == TYPE_STRING:
                intern(val)
        for ch in children:
            collect_strings(ch)

    collect_strings(tree)

    # Build XML node chunks
    chunks = bytearray()
    line_num = [1]

    # START_NAMESPACE
    chunks.extend(
        struct.pack('<HHIIIII', 0x0100, 16, 24, line_num[0], 0xFFFFFFFF, ns_prefix, ns_uri)
    )

    def emit_node_clean(node):
        tag, attrs, children = node
        line = line_num[0]
        line_num[0] += 1
        tag_idx = str_idx[tag]
        attr_bytes = bytearray()
        for ns, name, typ, val in attrs:
            ns_i = str_idx[ns] if ns else 0xFFFFFFFF
            name_i = str_idx[name]
            if typ == TYPE_STRING:
                v_idx = str_idx[val]
                raw_i = v_idx
                data_val = v_idx
            else:
                raw_i = 0xFFFFFFFF
                data_val = val & 0xFFFFFFFF
            attr_bytes.extend(struct.pack('<IIIHBBI', ns_i, name_i, raw_i, 8, 0, typ, data_val))

        start_size = 36 + len(attr_bytes)
        chunks.extend(
            struct.pack(
                '<HHIIIIIHHHHHH',
                0x0102,       # RES_XML_START_ELEMENT_TYPE
                16,           # headerSize
                start_size,   # size
                line,         # lineNumber
                0xFFFFFFFF,   # comment
                0xFFFFFFFF,   # ns
                tag_idx,      # name
                0x0014,       # attributeStart
                0x0014,       # attributeSize
                len(attrs),   # attributeCount
                0,            # idIndex
                0,            # classIndex
                0,            # styleIndex
            )
        )
        chunks.extend(attr_bytes)

        for ch in children:
            emit_node_clean(ch)

        chunks.extend(
            struct.pack('<HHIIIII', 0x0103, 16, 24, line, 0xFFFFFFFF, 0xFFFFFFFF, tag_idx)
        )

    emit_node_clean(tree)

    # END_NAMESPACE
    chunks.extend(
        struct.pack('<HHIIIII', 0x0101, 16, 24, line_num[0], 0xFFFFFFFF, ns_prefix, ns_uri)
    )

    string_pool = build_utf8_string_pool(strings)
    res_map = struct.pack('<HHI', 0x0180, 8, 8 + 4 * len(res_ids)) + b''.join(
        struct.pack('<I', rid) for rid in res_ids
    )

    total_size = 8 + len(string_pool) + len(res_map) + len(chunks)
    file_hdr = struct.pack('<HHI', 0x0003, 8, total_size)
    return file_hdr + string_pool + res_map + bytes(chunks)


def build_resources_arsc() -> bytes:
    """
    Builds a valid compiled resources.arsc containing:
      - 0x7f010000: mipmap/ic_launcher -> res/mipmap-xxxhdpi-v4/ic_launcher.png
      - 0x7f020000: string/app_name    -> Cub Spiele.Com
    """
    global_pool = build_utf8_string_pool([
        'res/mipmap-xxxhdpi-v4/ic_launcher.png',
        'Cub Spiele.Com',
    ])
    type_pool = build_utf8_string_pool(['mipmap', 'string'])
    key_pool = build_utf8_string_pool(['ic_launcher', 'app_name'])

    def make_type_spec(type_id: int, flags: list[int]) -> bytes:
        hdr = struct.pack('<HHIBBHI', 0x0202, 16, 16 + 4 * len(flags), type_id, 0, 0, len(flags))
        return hdr + b''.join(struct.pack('<I', f) for f in flags)

    def make_type_chunk(type_id: int, key_idx: int, global_str_idx: int, density: int = 0) -> bytes:
        # ResTable_config (64 bytes): size=64 at 0, density (uint16) at 14
        cfg = bytearray(64)
        struct.pack_into('<I', cfg, 0, 64)
        if density:
            struct.pack_into('<H', cfg, 14, density)
        header_size = 20 + 64  # 84
        entries_start = header_size + 4  # 88
        entry = struct.pack('<HHI', 8, 0, key_idx) + struct.pack('<HBBI', 8, 0, TYPE_STRING, global_str_idx)
        total = entries_start + len(entry)
        hdr = struct.pack('<HHIBBHII', 0x0201, header_size, total, type_id, 0, 0, 1, entries_start)
        return hdr + bytes(cfg) + struct.pack('<I', 0) + entry

    mipmap_chunks = make_type_spec(1, [0x00000000]) + make_type_chunk(1, 0, 0, density=0)
    string_chunks = make_type_spec(2, [0x00000000]) + make_type_chunk(2, 1, 1, density=0)

    pkg_name_u16 = 'com.cubspiele.emulator'.encode('utf-16-le').ljust(256, b'\x00')
    pkg_hdr_size = 288
    type_strings_off = pkg_hdr_size
    key_strings_off = type_strings_off + len(type_pool)
    pkg_body = type_pool + key_pool + mipmap_chunks + string_chunks
    pkg_size = pkg_hdr_size + len(pkg_body)

    pkg_hdr = (
        struct.pack('<HHII', 0x0200, pkg_hdr_size, pkg_size, 0x7F)
        + pkg_name_u16
        + struct.pack('<IIIII', type_strings_off, 2, key_strings_off, 2, 0)
    )

    total_size = 12 + len(global_pool) + pkg_size
    table_hdr = struct.pack('<HHII', 0x0002, 12, total_size, 1)
    return table_hdr + global_pool + pkg_hdr + pkg_body


def _uleb128(val: int) -> bytes:
    out = bytearray()
    while True:
        b = val & 0x7F
        val >>= 7
        if val:
            out.append(b | 0x80)
        else:
            out.append(b)
            break
    return bytes(out)


def build_valid_dex_bytes() -> bytes:
    """
    Builds a complete, valid Dalvik Executable (classes.dex, dex\\n035\\0)
    implementing:
      - com.cubspiele.emulator.FileChromeClient (extends WebChromeClient, handles onShowFileChooser)
      - com.cubspiele.emulator.MainActivity (extends Activity, full-screen WebView + onActivityResult)
    """
    strings_set = set()
    types_list = [
        'I',
        'Landroid/app/Activity;',
        'Landroid/content/Context;',
        'Landroid/content/Intent;',
        'Landroid/net/Uri;',
        'Landroid/os/Bundle;',
        'Landroid/view/View;',
        'Landroid/webkit/ValueCallback;',
        'Landroid/webkit/WebChromeClient$FileChooserParams;',
        'Landroid/webkit/WebChromeClient;',
        'Landroid/webkit/WebSettings;',
        'Landroid/webkit/WebView;',
        'Landroid/webkit/WebViewClient;',
        'Lcom/cubspiele/emulator/FileChromeClient;',
        'Lcom/cubspiele/emulator/MainActivity;',
        'Ljava/lang/Object;',
        'Ljava/lang/String;',
        'V',
        'Z',
        '[Landroid/net/Uri;',
    ]
    for t in types_list:
        strings_set.add(t)

    extra_strings = [
        '<init>',
        'MainActivity.java',
        'activity',
        'createIntent',
        'file:///android_asset/public/index.html',
        'fileCallback',
        'getSettings',
        'loadUrl',
        'onActivityResult',
        'onCreate',
        'onReceiveValue',
        'onShowFileChooser',
        'parseResult',
        'setAllowFileAccess',
        'setAllowFileAccessFromFileURLs',
        'setAllowUniversalAccessFromFileURLs',
        'setContentView',
        'setDomStorageEnabled',
        'setJavaScriptEnabled',
        'setMediaPlaybackRequiresUserGesture',
        'setWebChromeClient',
        'setWebViewClient',
        'startActivityForResult',
        'webView',
        'L',
        'LIL',
        'VL',
        'VLI',
        'VIIL',
        'VZ',
        'ZLLL',
    ]
    strings_set.update(extra_strings)
    strings = sorted(strings_set)
    s_idx = {s: i for i, s in enumerate(strings)}

    types = sorted(types_list)
    t_idx = {t: i for i, t in enumerate(types)}

    proto_specs = [
        ('V', 'V', ()),
        ('VL', 'V', ('Landroid/content/Context;',)),
        ('VL', 'V', ('Landroid/os/Bundle;',)),
        ('VL', 'V', ('Landroid/view/View;',)),
        ('VL', 'V', ('Landroid/webkit/WebChromeClient;',)),
        ('VL', 'V', ('Landroid/webkit/WebViewClient;',)),
        ('VL', 'V', ('Lcom/cubspiele/emulator/MainActivity;',)),
        ('VL', 'V', ('Ljava/lang/Object;',)),
        ('VL', 'V', ('Ljava/lang/String;',)),
        ('VLI', 'V', ('Landroid/content/Intent;', 'I')),
        ('VIIL', 'V', ('I', 'I', 'Landroid/content/Intent;')),
        ('VZ', 'V', ('Z',)),
        ('L', 'Landroid/content/Intent;', ()),
        ('L', 'Landroid/webkit/WebSettings;', ()),
        ('LIL', '[Landroid/net/Uri;', ('I', 'Landroid/content/Intent;')),
        ('ZLLL', 'Z', ('Landroid/webkit/WebView;', 'Landroid/webkit/ValueCallback;', 'Landroid/webkit/WebChromeClient$FileChooserParams;')),
    ]
    proto_specs.sort(key=lambda p: (t_idx[p[1]], tuple(t_idx[x] for x in p[2])))
    p_idx = {p: i for i, p in enumerate(proto_specs)}

    field_specs = [
        ('Lcom/cubspiele/emulator/FileChromeClient;', 'Lcom/cubspiele/emulator/MainActivity;', 'activity'),
        ('Lcom/cubspiele/emulator/MainActivity;', 'Landroid/webkit/ValueCallback;', 'fileCallback'),
        ('Lcom/cubspiele/emulator/MainActivity;', 'Landroid/webkit/WebView;', 'webView'),
    ]
    field_specs.sort(key=lambda f: (t_idx[f[0]], s_idx[f[2]], t_idx[f[1]]))
    f_idx = {f: i for i, f in enumerate(field_specs)}

    method_specs = [
        ('Landroid/app/Activity;', ('V', 'V', ()), '<init>'),
        ('Landroid/app/Activity;', ('VL', 'V', ('Landroid/os/Bundle;',)), 'onCreate'),
        ('Landroid/webkit/ValueCallback;', ('VL', 'V', ('Ljava/lang/Object;',)), 'onReceiveValue'),
        ('Landroid/webkit/WebChromeClient$FileChooserParams;', ('L', 'Landroid/content/Intent;', ()), 'createIntent'),
        ('Landroid/webkit/WebChromeClient$FileChooserParams;', ('LIL', '[Landroid/net/Uri;', ('I', 'Landroid/content/Intent;')), 'parseResult'),
        ('Landroid/webkit/WebChromeClient;', ('V', 'V', ()), '<init>'),
        ('Landroid/webkit/WebSettings;', ('VZ', 'V', ('Z',)), 'setJavaScriptEnabled'),
        ('Landroid/webkit/WebSettings;', ('VZ', 'V', ('Z',)), 'setDomStorageEnabled'),
        ('Landroid/webkit/WebSettings;', ('VZ', 'V', ('Z',)), 'setAllowFileAccess'),
        ('Landroid/webkit/WebSettings;', ('VZ', 'V', ('Z',)), 'setAllowFileAccessFromFileURLs'),
        ('Landroid/webkit/WebSettings;', ('VZ', 'V', ('Z',)), 'setAllowUniversalAccessFromFileURLs'),
        ('Landroid/webkit/WebSettings;', ('VZ', 'V', ('Z',)), 'setMediaPlaybackRequiresUserGesture'),
        ('Landroid/webkit/WebView;', ('VL', 'V', ('Landroid/content/Context;',)), '<init>'),
        ('Landroid/webkit/WebView;', ('L', 'Landroid/webkit/WebSettings;', ()), 'getSettings'),
        ('Landroid/webkit/WebView;', ('VL', 'V', ('Landroid/webkit/WebViewClient;',)), 'setWebViewClient'),
        ('Landroid/webkit/WebView;', ('VL', 'V', ('Landroid/webkit/WebChromeClient;',)), 'setWebChromeClient'),
        ('Landroid/webkit/WebView;', ('VL', 'V', ('Ljava/lang/String;',)), 'loadUrl'),
        ('Landroid/webkit/WebViewClient;', ('V', 'V', ()), '<init>'),
        ('Lcom/cubspiele/emulator/FileChromeClient;', ('VL', 'V', ('Lcom/cubspiele/emulator/MainActivity;',)), '<init>'),
        ('Lcom/cubspiele/emulator/FileChromeClient;', ('ZLLL', 'Z', ('Landroid/webkit/WebView;', 'Landroid/webkit/ValueCallback;', 'Landroid/webkit/WebChromeClient$FileChooserParams;')), 'onShowFileChooser'),
        ('Lcom/cubspiele/emulator/MainActivity;', ('V', 'V', ()), '<init>'),
        ('Lcom/cubspiele/emulator/MainActivity;', ('VIIL', 'V', ('I', 'I', 'Landroid/content/Intent;')), 'onActivityResult'),
        ('Lcom/cubspiele/emulator/MainActivity;', ('VL', 'V', ('Landroid/os/Bundle;',)), 'onCreate'),
        ('Lcom/cubspiele/emulator/MainActivity;', ('VL', 'V', ('Landroid/view/View;',)), 'setContentView'),
        ('Lcom/cubspiele/emulator/MainActivity;', ('VLI', 'V', ('Landroid/content/Intent;', 'I')), 'startActivityForResult'),
    ]
    method_specs.sort(key=lambda m: (t_idx[m[0]], s_idx[m[2]], p_idx[m[1]]))
    m_idx = {m: i for i, m in enumerate(method_specs)}

    def op_invoke(opcode: int, regs: list[int], method_key) -> bytes:
        cnt = len(regs)
        padded = regs + [0] * (5 - cnt)
        w0 = opcode | (cnt << 12) | (padded[4] << 8)
        w1 = m_idx[method_key]
        w2 = padded[0] | (padded[1] << 4) | (padded[2] << 8) | (padded[3] << 12)
        return struct.pack('<HHH', w0, w1, w2)

    f_fc_act = f_idx[('Lcom/cubspiele/emulator/FileChromeClient;', 'Lcom/cubspiele/emulator/MainActivity;', 'activity')]
    f_ma_cb = f_idx[('Lcom/cubspiele/emulator/MainActivity;', 'Landroid/webkit/ValueCallback;', 'fileCallback')]
    f_ma_wv = f_idx[('Lcom/cubspiele/emulator/MainActivity;', 'Landroid/webkit/WebView;', 'webView')]

    # 1. FileChromeClient.<init>(MainActivity)V (v0=this, v1=activity)
    fc_init_insns = (
        op_invoke(0x70, [0], ('Landroid/webkit/WebChromeClient;', ('V', 'V', ()), '<init>'))
        + struct.pack('<HH', 0x5B | (1 << 8) | (0 << 12), f_fc_act)
        + struct.pack('<H', 0x000E)
    )
    fc_init_code = struct.pack('<HHHHII', 2, 2, 1, 0, 0, len(fc_init_insns) // 2) + fc_init_insns

    # 2. FileChromeClient.onShowFileChooser(WebView, ValueCallback, FileChooserParams)Z
    # v0..v2 locals, v3=this, v4=webView, v5=filePathCallback, v6=fileChooserParams
    fc_show_insns = bytearray()
    fc_show_insns += struct.pack('<HH', 0x54 | (0 << 8) | (3 << 12), f_fc_act)   # iget-object v0, v3, activity (2u)
    fc_show_insns += struct.pack('<HH', 0x54 | (1 << 8) | (0 << 12), f_ma_cb)    # iget-object v1, v0, fileCallback (2u)
    fc_show_insns += struct.pack('<Hh', 0x0138, 6)                               # if-eqz v1, +6u (2u) -> skips 1u + 3u = 4u? Wait: 2u(if) + 1u(const) + 3u(invoke) = 6u!
    fc_show_insns += struct.pack('<H', 0x0012)                                   # const/4 v0=0? Wait: const/4 v2, 0 -> 0x0212! (1u)
    fc_show_insns = fc_show_insns[:-2] + struct.pack('<H', 0x0212)               # const/4 v2, 0 (1u)
    fc_show_insns += op_invoke(0x72, [1, 2], ('Landroid/webkit/ValueCallback;', ('VL', 'V', ('Ljava/lang/Object;',)), 'onReceiveValue'))  # (3u)
    fc_show_insns += struct.pack('<HH', 0x5B | (5 << 8) | (0 << 12), f_ma_cb)    # iput-object v5, v0, fileCallback (2u)
    fc_show_insns += op_invoke(0x6E, [6], ('Landroid/webkit/WebChromeClient$FileChooserParams;', ('L', 'Landroid/content/Intent;', ()), 'createIntent'))  # (3u)
    fc_show_insns += struct.pack('<H', 0x010C)                                   # move-result-object v1 (1u)
    fc_show_insns += struct.pack('<HH', 0x0213, 1001)                            # const/16 v2, 1001 (2u)
    fc_show_insns += op_invoke(0x6E, [0, 1, 2], ('Lcom/cubspiele/emulator/MainActivity;', ('VLI', 'V', ('Landroid/content/Intent;', 'I')), 'startActivityForResult'))  # (3u)
    fc_show_insns += struct.pack('<H', 0x1012)                                   # const/4 v0, 1 (1u)
    fc_show_insns += struct.pack('<H', 0x000F)                                   # return v0 (1u)
    fc_show_code = struct.pack('<HHHHII', 7, 4, 3, 0, 0, len(fc_show_insns) // 2) + bytes(fc_show_insns)

    # 3. MainActivity.<init>()V
    ma_init_insns = (
        op_invoke(0x70, [0], ('Landroid/app/Activity;', ('V', 'V', ()), '<init>'))
        + struct.pack('<H', 0x000E)
    )
    ma_init_code = struct.pack('<HHHHII', 1, 1, 1, 0, 0, len(ma_init_insns) // 2) + ma_init_insns

    # 4. MainActivity.onActivityResult(int requestCode, int resultCode, Intent data)V
    # v0..v1 locals, v2=this, v3=requestCode, v4=resultCode, v5=data
    ma_res_insns = bytearray()
    ma_res_insns += struct.pack('<HH', 0x0013, 1001)                             # const/16 v0, 1001 (2u)
    # Branch to return-void at end: 2u(if-ne) + 2u(iget) + 2u(if-eqz) + 3u(parseResult) + 1u(move) + 3u(onReceive) + 1u(const) + 2u(iput) = 16u
    ma_res_insns += struct.pack('<Hh', 0x0333, 16)                               # if-ne v3, v0, +16u (2u)
    ma_res_insns += struct.pack('<HH', 0x54 | (0 << 8) | (2 << 12), f_ma_cb)     # iget-object v0, v2, fileCallback (2u)
    # Branch to return-void: 2u(if-eqz) + 3u + 1u + 3u + 1u + 2u = 12u
    ma_res_insns += struct.pack('<Hh', 0x0038, 12)                               # if-eqz v0, +12u (2u)
    ma_res_insns += op_invoke(0x71, [4, 5], ('Landroid/webkit/WebChromeClient$FileChooserParams;', ('LIL', '[Landroid/net/Uri;', ('I', 'Landroid/content/Intent;')), 'parseResult'))  # (3u)
    ma_res_insns += struct.pack('<H', 0x010C)                                    # move-result-object v1 (1u)
    ma_res_insns += op_invoke(0x72, [0, 1], ('Landroid/webkit/ValueCallback;', ('VL', 'V', ('Ljava/lang/Object;',)), 'onReceiveValue'))  # (3u)
    ma_res_insns += struct.pack('<H', 0x0012)                                    # const/4 v0, 0 (1u)
    ma_res_insns += struct.pack('<HH', 0x5B | (0 << 8) | (2 << 12), f_ma_cb)     # iput-object v0, v2, fileCallback (2u)
    ma_res_insns += struct.pack('<H', 0x000E)                                    # return-void (1u)
    ma_res_code = struct.pack('<HHHHII', 6, 4, 2, 0, 0, len(ma_res_insns) // 2) + bytes(ma_res_insns)

    # 5. MainActivity.onCreate(Bundle)V: v0..v2 locals, v3=this, v4=Bundle
    oncreate_insns = bytearray()
    oncreate_insns += op_invoke(0x6F, [3, 4], ('Landroid/app/Activity;', ('VL', 'V', ('Landroid/os/Bundle;',)), 'onCreate'))
    oncreate_insns += struct.pack('<HH', 0x0122, t_idx['Landroid/webkit/WebView;'])
    oncreate_insns += op_invoke(0x70, [1, 3], ('Landroid/webkit/WebView;', ('VL', 'V', ('Landroid/content/Context;',)), '<init>'))
    oncreate_insns += struct.pack('<HH', 0x5B | (1 << 8) | (3 << 12), f_ma_wv)
    oncreate_insns += op_invoke(0x6E, [1], ('Landroid/webkit/WebView;', ('L', 'Landroid/webkit/WebSettings;', ()), 'getSettings'))
    oncreate_insns += struct.pack('<H', 0x000C)
    oncreate_insns += struct.pack('<H', 0x1212)
    for m_name in (
        'setJavaScriptEnabled',
        'setDomStorageEnabled',
        'setAllowFileAccess',
        'setAllowFileAccessFromFileURLs',
        'setAllowUniversalAccessFromFileURLs',
    ):
        oncreate_insns += op_invoke(0x6E, [0, 2], ('Landroid/webkit/WebSettings;', ('VZ', 'V', ('Z',)), m_name))
    oncreate_insns += struct.pack('<H', 0x0212)
    oncreate_insns += op_invoke(0x6E, [0, 2], ('Landroid/webkit/WebSettings;', ('VZ', 'V', ('Z',)), 'setMediaPlaybackRequiresUserGesture'))
    oncreate_insns += struct.pack('<HH', 0x0022, t_idx['Landroid/webkit/WebViewClient;'])
    oncreate_insns += op_invoke(0x70, [0], ('Landroid/webkit/WebViewClient;', ('V', 'V', ()), '<init>'))
    oncreate_insns += op_invoke(0x6E, [1, 0], ('Landroid/webkit/WebView;', ('VL', 'V', ('Landroid/webkit/WebViewClient;',)), 'setWebViewClient'))
    oncreate_insns += struct.pack('<HH', 0x0022, t_idx['Lcom/cubspiele/emulator/FileChromeClient;'])
    oncreate_insns += op_invoke(0x70, [0, 3], ('Lcom/cubspiele/emulator/FileChromeClient;', ('VL', 'V', ('Lcom/cubspiele/emulator/MainActivity;',)), '<init>'))
    oncreate_insns += op_invoke(0x6E, [1, 0], ('Landroid/webkit/WebView;', ('VL', 'V', ('Landroid/webkit/WebChromeClient;',)), 'setWebChromeClient'))
    oncreate_insns += op_invoke(0x6E, [3, 1], ('Lcom/cubspiele/emulator/MainActivity;', ('VL', 'V', ('Landroid/view/View;',)), 'setContentView'))
    oncreate_insns += struct.pack('<HH', 0x001A, s_idx['file:///android_asset/public/index.html'])
    oncreate_insns += op_invoke(0x6E, [1, 0], ('Landroid/webkit/WebView;', ('VL', 'V', ('Ljava/lang/String;',)), 'loadUrl'))
    oncreate_insns += struct.pack('<H', 0x000E)
    oncreate_code = struct.pack('<HHHHII', 5, 2, 2, 0, 0, len(oncreate_insns) // 2) + bytes(oncreate_insns)

    # Layout DEX file sections (2 class_defs: FileChromeClient & MainActivity)
    header_size = 112
    string_ids_off = header_size
    type_ids_off = string_ids_off + 4 * len(strings)
    proto_ids_off = type_ids_off + 4 * len(types)
    field_ids_off = proto_ids_off + 12 * len(proto_specs)
    method_ids_off = field_ids_off + 8 * len(field_specs)
    class_defs_off = method_ids_off + 8 * len(method_specs)
    data_off = class_defs_off + 32 * 2

    data_buf = bytearray()

    def data_pos() -> int:
        return data_off + len(data_buf)

    def align_data(a: int = 4):
        while (data_off + len(data_buf)) % a != 0:
            data_buf.append(0)

    proto_param_offs = {}
    for p in proto_specs:
        if p[2]:
            align_data(4)
            proto_param_offs[p] = data_pos()
            data_buf.extend(struct.pack('<I', len(p[2])))
            for pt in p[2]:
                data_buf.extend(struct.pack('<H', t_idx[pt]))
        else:
            proto_param_offs[p] = 0

    string_data_offs = []
    for s in strings:
        string_data_offs.append(data_pos())
        u8 = s.encode('utf-8')
        u16_len = len(s.encode('utf-16-le')) // 2
        data_buf.extend(_uleb128(u16_len))
        data_buf.extend(u8)
        data_buf.append(0)

    code_offs = []
    for c_bytes in (fc_init_code, fc_show_code, ma_init_code, ma_res_code, oncreate_code):
        align_data(4)
        code_offs.append(data_pos())
        data_buf.extend(c_bytes)
    fc_init_off, fc_show_off, ma_init_off, ma_res_off, ma_oncreate_off = code_offs

    # class_data_item 1: FileChromeClient
    fc_class_data_off = data_pos()
    m_fc_init = m_idx[('Lcom/cubspiele/emulator/FileChromeClient;', ('VL', 'V', ('Lcom/cubspiele/emulator/MainActivity;',)), '<init>')]
    m_fc_show = m_idx[('Lcom/cubspiele/emulator/FileChromeClient;', ('ZLLL', 'Z', ('Landroid/webkit/WebView;', 'Landroid/webkit/ValueCallback;', 'Landroid/webkit/WebChromeClient$FileChooserParams;')), 'onShowFileChooser')]
    data_buf.extend(_uleb128(0) + _uleb128(1) + _uleb128(1) + _uleb128(1))
    data_buf.extend(_uleb128(f_fc_act) + _uleb128(0x0002))
    data_buf.extend(_uleb128(m_fc_init) + _uleb128(0x10001) + _uleb128(fc_init_off))
    data_buf.extend(_uleb128(m_fc_show) + _uleb128(0x0001) + _uleb128(fc_show_off))

    # class_data_item 2: MainActivity
    ma_class_data_off = data_pos()
    m_ma_init = m_idx[('Lcom/cubspiele/emulator/MainActivity;', ('V', 'V', ()), '<init>')]
    m_ma_res = m_idx[('Lcom/cubspiele/emulator/MainActivity;', ('VIIL', 'V', ('I', 'I', 'Landroid/content/Intent;')), 'onActivityResult')]
    m_ma_oncreate = m_idx[('Lcom/cubspiele/emulator/MainActivity;', ('VL', 'V', ('Landroid/os/Bundle;',)), 'onCreate')]
    # instance_fields sorted by field_idx: f_ma_cb vs f_ma_wv
    assert f_ma_cb < f_ma_wv
    # direct_methods: <init>, virtual_methods sorted by method_idx: onActivityResult vs onCreate
    assert m_ma_res < m_ma_oncreate
    data_buf.extend(_uleb128(0) + _uleb128(2) + _uleb128(1) + _uleb128(2))
    data_buf.extend(_uleb128(f_ma_cb) + _uleb128(0x0001))
    data_buf.extend(_uleb128(f_ma_wv - f_ma_cb) + _uleb128(0x0002))
    data_buf.extend(_uleb128(m_ma_init) + _uleb128(0x10001) + _uleb128(ma_init_off))
    data_buf.extend(_uleb128(m_ma_res) + _uleb128(0x0004) + _uleb128(ma_res_off))
    data_buf.extend(_uleb128(m_ma_oncreate - m_ma_res) + _uleb128(0x0004) + _uleb128(ma_oncreate_off))

    align_data(4)
    map_off = data_pos()
    type_list_count = sum(1 for p in proto_specs if p[2])
    map_items = [
        (0x0000, 1, 0),
        (0x0001, len(strings), string_ids_off),
        (0x0002, len(types), type_ids_off),
        (0x0003, len(proto_specs), proto_ids_off),
        (0x0004, len(field_specs), field_ids_off),
        (0x0005, len(method_specs), method_ids_off),
        (0x0006, 2, class_defs_off),
        (0x1001, type_list_count, proto_param_offs[next(p for p in proto_specs if p[2])]),
        (0x2002, len(strings), string_data_offs[0]),
        (0x2001, 5, fc_init_off),
        (0x2000, 2, fc_class_data_off),
        (0x1000, 1, map_off),
    ]
    data_buf.extend(struct.pack('<I', len(map_items)))
    for m_type, m_size, m_off in map_items:
        data_buf.extend(struct.pack('<HHII', m_type, 0, m_size, m_off))

    string_ids_bin = b''.join(struct.pack('<I', o) for o in string_data_offs)
    type_ids_bin = b''.join(struct.pack('<I', s_idx[t]) for t in types)
    proto_ids_bin = b''.join(
        struct.pack('<III', s_idx[p[0]], t_idx[p[1]], proto_param_offs[p]) for p in proto_specs
    )
    field_ids_bin = b''.join(
        struct.pack('<HHI', t_idx[f[0]], t_idx[f[1]], s_idx[f[2]]) for f in field_specs
    )
    method_ids_bin = b''.join(
        struct.pack('<HHI', t_idx[m[0]], p_idx[m[1]], s_idx[m[2]]) for m in method_specs
    )
    class_defs_bin = (
        struct.pack(
            '<IIIIIIII',
            t_idx['Lcom/cubspiele/emulator/FileChromeClient;'],
            0x0001,
            t_idx['Landroid/webkit/WebChromeClient;'],
            0,
            s_idx['MainActivity.java'],
            0,
            fc_class_data_off,
            0,
        )
        + struct.pack(
            '<IIIIIIII',
            t_idx['Lcom/cubspiele/emulator/MainActivity;'],
            0x0001,
            t_idx['Landroid/app/Activity;'],
            0,
            s_idx['MainActivity.java'],
            0,
            ma_class_data_off,
            0,
        )
    )

    body = (
        string_ids_bin
        + type_ids_bin
        + proto_ids_bin
        + field_ids_bin
        + method_ids_bin
        + class_defs_bin
        + bytes(data_buf)
    )
    file_size = header_size + len(body)
    data_size = len(data_buf)

    hdr = bytearray(header_size)
    hdr[0:8] = b'dex\n035\x00'
    struct.pack_into(
        '<IIIIIIIIIIIIIIIIIIII',
        hdr,
        32,
        file_size,
        header_size,
        0x12345678,
        0, 0,
        map_off,
        len(strings), string_ids_off,
        len(types), type_ids_off,
        len(proto_specs), proto_ids_off,
        len(field_specs), field_ids_off,
        len(method_specs), method_ids_off,
        2, class_defs_off,
        data_size, data_off,
    )

    dex = hdr + body
    dex[12:32] = hashlib.sha1(dex[32:]).digest()
    struct.pack_into('<I', dex, 8, zlib.adler32(dex[12:]) & 0xFFFFFFFF)
    return bytes(dex)


def build_signed_android_apk(
    apk_path: str,
    icon_192_png: bytes,
    version_code: int,
    version_name: str,
    offline_html: str,
    capacitor_cfg_bytes: bytes | None,
    dist_files: list[tuple[str, str]],
):
    """Builds a zipaligned, v1+v2 signed Android APK at apk_path."""
    android_manifest = build_binary_android_manifest(version_code, version_name)
    resources_arsc = build_resources_arsc()
    dex_bytes = build_valid_dex_bytes()

    manifest_entries: list[tuple[str, str]] = []
    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    signer_mjs = os.path.join(scripts_dir, 'apk-sign.mjs')

    with tempfile.TemporaryDirectory() as tmpdir:
        unsigned_apk = os.path.join(tmpdir, 'unsigned.apk')
        sf_path = os.path.join(tmpdir, 'CERT.SF')
        key_json = os.path.join(tmpdir, 'key.json')
        cert_rsa_path = os.path.join(tmpdir, 'CERT.RSA')

        def add_aligned_entry(zf: zipfile.ZipFile, arcname: str, data: bytes, compress: bool = True):
            zi = zipfile.ZipInfo(arcname)
            zi.date_time = (2026, 11, 14, 19, 45, 0)
            zi.compress_type = zipfile.ZIP_DEFLATED if compress else zipfile.ZIP_STORED
            if not compress:
                # 4-byte zipalign for ZIP_STORED entries (required on Android 11+ / API 30+)
                pos = zf.fp.tell()
                name_len = len(arcname.encode('utf-8'))
                pad = (4 - ((pos + 30 + name_len) % 4)) % 4
                if pad:
                    zi.extra = b'\x00' * pad
            zf.writestr(zi, data)
            b64_sha = base64.b64encode(hashlib.sha256(data).digest()).decode('ascii')
            manifest_entries.append((arcname, b64_sha))

        # Step 1: Write all APK entries + compute MANIFEST.MF and CERT.SF
        with zipfile.ZipFile(unsigned_apk, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            add_aligned_entry(zf, 'AndroidManifest.xml', android_manifest, compress=True)
            add_aligned_entry(zf, 'resources.arsc', resources_arsc, compress=False)
            add_aligned_entry(zf, 'classes.dex', dex_bytes, compress=True)
            add_aligned_entry(zf, 'res/mipmap-xxxhdpi-v4/ic_launcher.png', icon_192_png, compress=False)
            add_aligned_entry(zf, 'assets/public/index.html', offline_html.encode('utf-8'), compress=True)

            if capacitor_cfg_bytes is not None:
                add_aligned_entry(zf, 'assets/capacitor.config.json', capacitor_cfg_bytes, compress=True)

            for full_p, rel_p in dist_files:
                with open(full_p, 'rb') as df:
                    add_aligned_entry(zf, f'assets/public/{rel_p}', df.read(), compress=True)

            mf_header = (
                'Manifest-Version: 1.0\r\n'
                f'Created-By: Cub Spiele.Com Android Release Builder {version_name}\r\n\r\n'
            )
            mf_sections = []
            for name, sha in manifest_entries:
                mf_sections.append(f'Name: {name}\r\nSHA-256-Digest: {sha}\r\n\r\n')
            mf_bytes = (mf_header + ''.join(mf_sections)).encode('utf-8')
            zf.writestr('META-INF/MANIFEST.MF', mf_bytes)

            sf_digest = base64.b64encode(hashlib.sha256(mf_bytes).digest()).decode('ascii')
            sf_header = (
                'Signature-Version: 1.0\r\n'
                'Created-By: 1.0 (Cub Spiele.Com)\r\n'
                f'SHA-256-Digest-Manifest: {sf_digest}\r\n\r\n'
            )
            sf_sections = []
            for (name, _), sec in zip(manifest_entries, mf_sections):
                sec_sha = base64.b64encode(hashlib.sha256(sec.encode('utf-8')).digest()).decode('ascii')
                sf_sections.append(f'Name: {name}\r\nSHA-256-Digest: {sec_sha}\r\n\r\n')
            sf_bytes = (sf_header + ''.join(sf_sections)).encode('utf-8')
            zf.writestr('META-INF/CERT.SF', sf_bytes)

            with open(sf_path, 'wb') as sff:
                sff.write(sf_bytes)

            # Generate CERT.RSA (PKCS#7 SignedData) via Node crypto
            subprocess.run(
                ['node', signer_mjs, '--v1-cert', sf_path, key_json, cert_rsa_path],
                check=True,
            )
            with open(cert_rsa_path, 'rb') as crf:
                zf.writestr('META-INF/CERT.RSA', crf.read())

        # Step 2: Add APK Signature Scheme v2 block ("APK Sig Block 42")
        subprocess.run(
            ['node', signer_mjs, '--v2-block', key_json, unsigned_apk, apk_path],
            check=True,
        )
