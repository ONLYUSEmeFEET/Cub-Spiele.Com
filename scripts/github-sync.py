#!/usr/bin/env python3
"""
Cub Spiele.Com — GitHub Repository Sync, Topic Tagger & Release Publisher
Maintains https://github.com/ONLYUSEmeFEET/Cub-Spiele.Com:
  1. Syncs workspace files with local git staging directory (since Google Drive blocks .git dirs)
  2. Commits any modified/new tracked files and pushes main + release tags (v1.0.0 .. v1.4.0)
  3. Sets GitHub Repository Topics and Description via GitHub CLI (gh repo edit)
  4. Ensures all GitHub Releases (v1.0.0, v1.1.0, v1.2.0, v1.3.0, v1.4.0) are properly titled,
     labeled, and contain clean Windows x64 release assets.
"""

import os
import sys
import json
import shutil
import subprocess

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
REPO_SLUG = "ONLYUSEmeFEET/Cub-Spiele.Com"
REMOTE_URL = f"https://github.com/{REPO_SLUG}.git"
LOCAL_GIT_STAGE = os.path.join(
    os.environ.get("LOCALAPPDATA", os.path.expanduser("~")),
    "CubSpieleCom-git-stage"
)

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

REPO_TOPICS = [
    "emulator",
    "gamecom",
    "tiger-game-com",
    "sm8521",
    "sharp-sm8521",
    "retroachievements",
    "rcheevos",
    "hardcore-mode",
    "online-leaderboards",
    "high-scores",
    "handheld-emulator",
    "retro-gaming",
    "nvram",
    "stn-lcd",
    "typescript",
    "electron",
    "windows-x64",
]


def run(cmd, cwd=LOCAL_GIT_STAGE, check=True):
    safe_cmd = [
        c if "x-access-token:" not in c else f"https://github.com/{REPO_SLUG}.git"
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


def format_release_notes(rel_entry: dict) -> str:
    tag = rel_entry["tag"]
    title = rel_entry["title"]
    highlights = rel_entry.get("highlights", [])
    assets = rel_entry.get("assets", [])

    lines = [
        f"## {title}",
        "",
        "### Key Highlights",
    ]
    for h in highlights:
        lines.append(f"- {h}")

    lines.extend([
        "",
        "### Windows x64 Release Artifacts & SHA-256 Checksums",
        "| File | Label | Architecture | SHA-256 |",
        "| :--- | :--- | :--- | :--- |",
    ])
    for a in assets:
        lines.append(
            f"| `{a['name']}` | {a['label']} | {a['architecture']} | `{a['sha256']}` |"
        )

    lines.extend([
        "",
        f"**Release Tag**: `{tag}` · **Target OS**: Windows 10 / Windows 11 x64 (`PE32+ AMD64`)",
    ])
    return "\n".join(lines)


def main():
    with open(os.path.join(ROOT_DIR, "package.json"), "r", encoding="utf-8") as f:
        pkg = json.load(f)
    version_tag = f"v{pkg.get('version', '1.4.0')}"

    manifest_path = os.path.join(ROOT_DIR, "public", "releases", "releases-manifest.json")
    with open(manifest_path, "r", encoding="utf-8") as mf:
        manifest = json.load(mf)

    sync_workspace_to_stage()

    run([GIT_EXE, "add", "-A"])
    status = subprocess.run(
        [GIT_EXE, "status", "--short"],
        cwd=LOCAL_GIT_STAGE,
        capture_output=True,
        text=True
    )
    if status.stdout.strip():
        msg = (
            sys.argv[1]
            if len(sys.argv) > 1
            else f"feat(release): Cub Spiele.Com {version_tag} — Competitive Hardcore Mode, Online Leaderboards & RetroAchievements"
        )
        run([GIT_EXE, "commit", "-m", msg])
    else:
        print("Working tree clean — all workspace changes already committed.")

    push_url = REMOTE_URL
    if os.path.exists(GH_EXE):
        tok_res = subprocess.run([GH_EXE, "auth", "token"], capture_output=True, text=True)
        token = tok_res.stdout.strip()
        if token:
            push_url = f"https://x-access-token:{token}@github.com/{REPO_SLUG}.git"

    print(f"Pushing main to {REMOTE_URL}...")
    run([GIT_EXE, "push", push_url, "main"])

    # Ensure all release tags exist and are pushed
    for rel in manifest.get("releases", []):
        r_tag = rel["tag"]
        if r_tag == version_tag:
            run([GIT_EXE, "tag", "-f", r_tag, "-m", rel["title"]])
            run([GIT_EXE, "push", push_url, r_tag, "--force"])
        else:
            tag_check = subprocess.run(
                [GIT_EXE, "rev-parse", "-q", "--verify", f"refs/tags/{r_tag}"],
                cwd=LOCAL_GIT_STAGE,
                capture_output=True
            )
            if tag_check.returncode != 0:
                run([GIT_EXE, "tag", r_tag, "-m", rel["title"]])
            run([GIT_EXE, "push", push_url, r_tag], check=False)

    if os.path.exists(GH_EXE):
        # 1. Update repository description and topics
        topic_args = []
        for t in REPO_TOPICS:
            topic_args.extend(["--add-topic", t])
        run([
            GH_EXE, "repo", "edit", REPO_SLUG,
            "--description", pkg.get("description", ""),
            *topic_args
        ], check=False)

        # 2. Ensure every release in releases-manifest.json is properly titled, labeled, and clean
        releases_dir = os.path.join(ROOT_DIR, "public", "releases")
        # Process oldest to newest so v1.4.0 ends as Latest
        for rel in reversed(manifest.get("releases", [])):
            r_tag = rel["tag"]
            r_title = rel["title"]
            r_is_latest = bool(rel.get("isLatest"))
            notes_md = format_release_notes(rel)
            notes_file = os.path.join(LOCAL_GIT_STAGE, f"release-notes-{r_tag}.md")
            with open(notes_file, "w", encoding="utf-8") as nf:
                nf.write(notes_md)

            zip_path = os.path.join(releases_dir, f"CubSpieleCom-{r_tag}-win64.zip")
            exe_path = os.path.join(releases_dir, "CubSpieleCom.exe")
            versioned_exe_path = os.path.join(LOCAL_GIT_STAGE, f"CubSpieleCom-{r_tag}.exe")
            if os.path.exists(exe_path):
                shutil.copy2(exe_path, versioned_exe_path)

            upload_specs = []
            if os.path.exists(zip_path):
                upload_specs.append(f"{zip_path}#Windows x64 Portable Build ({r_tag} .zip)")
            if r_is_latest and os.path.exists(exe_path):
                upload_specs.append(f"{exe_path}#Standalone Windows x64 Emulator Executable ({r_tag} .exe)")
            elif os.path.exists(versioned_exe_path):
                upload_specs.append(f"{versioned_exe_path}#Standalone Windows x64 Emulator Executable ({r_tag} .exe)")

            view_res = subprocess.run(
                [GH_EXE, "release", "view", r_tag, "--repo", REPO_SLUG, "--json", "assets"],
                cwd=LOCAL_GIT_STAGE,
                capture_output=True,
                text=True
            )

            if view_res.returncode == 0:
                print(f"Updating existing GitHub Release {r_tag}: {r_title}")
                # Remove any old/unlabeled or non-win64 build clutter assets before uploading clean labeled assets
                try:
                    existing_data = json.loads(view_res.stdout)
                    for old_asset in existing_data.get("assets", []):
                        old_name = old_asset.get("name", "")
                        if old_name:
                            subprocess.run(
                                [GH_EXE, "release", "delete-asset", r_tag, old_name, "--yes", "--repo", REPO_SLUG],
                                cwd=LOCAL_GIT_STAGE,
                                capture_output=True
                            )
                except Exception:
                    pass

                edit_cmd = [
                    GH_EXE, "release", "edit", r_tag,
                    "--repo", REPO_SLUG,
                    "--title", r_title,
                    "--notes-file", notes_file,
                    f"--latest={'true' if r_is_latest else 'false'}"
                ]
                run(edit_cmd, check=False)
                if upload_specs:
                    run([GH_EXE, "release", "upload", r_tag, *upload_specs, "--clobber", "--repo", REPO_SLUG])
            else:
                print(f"Creating GitHub Release {r_tag}: {r_title}")
                create_cmd = [
                    GH_EXE, "release", "create", r_tag,
                    *upload_specs,
                    "--repo", REPO_SLUG,
                    "--title", r_title,
                    "--notes-file", notes_file,
                    f"--latest={'true' if r_is_latest else 'false'}"
                ]
                run(create_cmd)

            for temp_f in (notes_file, versioned_exe_path):
                if os.path.exists(temp_f):
                    try:
                        os.remove(temp_f)
                    except OSError:
                        pass


if __name__ == "__main__":
    main()
