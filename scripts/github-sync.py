#!/usr/bin/env python3
"""
Cub Spiele.Com — GitHub Repository Sync & Release Publisher
Maintains https://github.com/ONLYUSEmeFEET/Cub-Spiele.Com:
  1. Syncs workspace files with local git staging directory (since Google Drive blocks .git dirs)
  2. Commits any modified/new tracked files and tags the current version (v1.2.0)
  3. Pushes main branch & tags to https://github.com/ONLYUSEmeFEET/Cub-Spiele.Com.git
  4. Creates or updates the GitHub Release with dist files (CubSpieleCom-v1.2.0-dist.zip,
     CubSpieleCom-v1.2.0-win64.zip, CubSpieleCom.exe, CubSpieleCom-Antigravity-Workspace.zip,
     releases-manifest.json) via GitHub CLI (gh) or GITHUB_TOKEN.
"""

import os
import sys
import json
import shutil
import subprocess

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
REPO_SLUG = "ONLYUSEmeFEET/Cub-Spiele.Com"
REMOTE_URL = f"https://github.com/{REPO_SLUG}.git"
LOCAL_GIT_STAGE = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "CubSpieleCom-git-stage")

GIT_PATHS = [
    r"C:\msys64\usr\bin",
    r"C:\msys64\mingw64\bin",
    r"C:\Program Files\Git\cmd",
    r"C:\Program Files\GitHub CLI",
]
for p in GIT_PATHS:
    if os.path.exists(p):
        os.environ["PATH"] = p + os.pathsep + os.environ.get("PATH", "")

GIT_EXE = shutil.which("git") or r"C:\msys64\usr\bin\git.exe"
GH_EXE = shutil.which("gh") or r"C:\Program Files\GitHub CLI\gh.exe"


import glob

def run(cmd, cwd=LOCAL_GIT_STAGE, check=True):
    safe_cmd = [
        c if "x-access-token:" not in c else "https://github.com/ONLYUSEmeFEET/Cub-Spiele.Com.git"
        for c in cmd
    ]
    print(f"$ {' '.join(safe_cmd)}")
    res = subprocess.run(cmd, cwd=cwd, text=True)
    if check and res.returncode != 0:
        sys.exit(res.returncode)
    return res


def sync_workspace_to_stage():
    if not os.path.exists(os.path.join(LOCAL_GIT_STAGE, ".git")):
        if os.path.exists(LOCAL_GIT_STAGE):
            shutil.rmtree(LOCAL_GIT_STAGE, ignore_errors=True)
        os.makedirs(LOCAL_GIT_STAGE, exist_ok=True)
        run([GIT_EXE, "clone", REMOTE_URL, LOCAL_GIT_STAGE], cwd=os.path.expanduser("~"))

    run([GIT_EXE, "config", "user.name", "AJ Ryan"], check=False)
    run([GIT_EXE, "config", "user.email", "onlyusemefeet@gmail.com"], check=False)

    exclude_root = {
        ".git", "node_modules", "dist", "release", "roms",
        "Applications", "Firmware", "Other_Emulators", "build", "coverage"
    }

    for item in os.listdir(LOCAL_GIT_STAGE):
        if item == ".git":
            continue
        p = os.path.join(LOCAL_GIT_STAGE, item)
        if os.path.isdir(p):
            shutil.rmtree(p)
        else:
            os.remove(p)

    for root, dirs, files in os.walk(ROOT_DIR):
        rel = os.path.relpath(root, ROOT_DIR)
        if rel == ".":
            dirs[:] = [d for d in dirs if d not in exclude_root]
        else:
            dirs[:] = [d for d in dirs if d not in {".git", "node_modules"}]
        target_dir = LOCAL_GIT_STAGE if rel == "." else os.path.join(LOCAL_GIT_STAGE, rel)
        os.makedirs(target_dir, exist_ok=True)
        for f in files:
            if f.lower() == "desktop.ini":
                continue
            shutil.copy2(os.path.join(root, f), os.path.join(target_dir, f))


def main():
    with open(os.path.join(ROOT_DIR, "package.json"), "r", encoding="utf-8") as f:
        pkg = json.load(f)
    version_tag = f"v{pkg.get('version', '1.2.0')}"

    sync_workspace_to_stage()

    run([GIT_EXE, "add", "-A"])
    status = subprocess.run([GIT_EXE, "status", "--short"], cwd=LOCAL_GIT_STAGE, capture_output=True, text=True)
    if status.stdout.strip():
        msg = sys.argv[1] if len(sys.argv) > 1 else f"chore(release): sync Cub Spiele.Com {version_tag} & dist release artifacts"
        run([GIT_EXE, "commit", "-m", msg])
    else:
        print("Working tree clean — all workspace changes already committed.")

    run([GIT_EXE, "tag", "-f", version_tag, "-m", f"Cub Spiele.Com {version_tag} Release"])

    push_url = REMOTE_URL
    if os.path.exists(GH_EXE):
        tok_res = subprocess.run([GH_EXE, "auth", "token"], capture_output=True, text=True)
        token = tok_res.stdout.strip()
        if token:
            push_url = f"https://x-access-token:{token}@github.com/{REPO_SLUG}.git"

    print(f"Pushing main and tag {version_tag} to {REMOTE_URL}...")
    run([GIT_EXE, "push", push_url, "main"])
    run([GIT_EXE, "push", push_url, version_tag, "--force"])

    if os.path.exists(GH_EXE):
        releases_dir = os.path.join(ROOT_DIR, "public", "releases")
        dist_dir = os.path.join(ROOT_DIR, "dist")
        dist_assets = glob.glob(os.path.join(dist_dir, "assets", "*"))
        assets = [
            os.path.join(releases_dir, f"CubSpieleCom-{version_tag}-win64.zip"),
            os.path.join(releases_dir, f"CubSpieleCom-{version_tag}-dist.zip"),
            os.path.join(releases_dir, "CubSpieleCom.exe"),
            os.path.join(releases_dir, "CubSpieleCom-Antigravity-Workspace.zip"),
            os.path.join(releases_dir, "releases-manifest.json"),
            os.path.join(dist_dir, "index.html"),
            *dist_assets,
        ]
        existing_assets = [a for a in assets if os.path.exists(a) and os.path.isfile(a)]

        rel_check = subprocess.run(
            [GH_EXE, "release", "view", version_tag, "--repo", REPO_SLUG],
            cwd=LOCAL_GIT_STAGE,
            capture_output=True
        )
        if rel_check.returncode == 0:
            print(f"Uploading updated dist & Win64 assets to existing release {version_tag}...")
            run([GH_EXE, "release", "upload", version_tag, *existing_assets, "--clobber", "--repo", REPO_SLUG])
        else:
            print(f"Creating GitHub Release {version_tag} with dist & Win64 assets...")
            run([
                GH_EXE, "release", "create", version_tag,
                *existing_assets,
                "--repo", REPO_SLUG,
                "--title", f"Cub Spiele.Com {version_tag} — Standalone Handheld Emulator, 4-Shade SGB/GBC Colorizer & Dist Release",
                "--generate-notes"
            ])


if __name__ == "__main__":
    main()
