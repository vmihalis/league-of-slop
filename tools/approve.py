#!/usr/bin/env python3
"""Approve a candidate image and convert it to a 3D model with Higgsfield (Tripo H3.1).

Usage: approve.py <champ> <variant-letter> [--image-only]
  1. copies assets/candidates/<champ>_<v>.png -> assets/images/<champ>.png
  2. runs tripo_h3_1_image_to_3d and saves assets/models/<champ>.glb
The app picks up the .glb automatically on reload.
"""
import argparse
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAND = ROOT / "assets" / "candidates"
IMAGES = ROOT / "assets" / "images"
MODELS = ROOT / "assets" / "models"
URL_RE = re.compile(r"https://\S+")

TRIPO = [
    "--texture", "true", "--pbr", "true",
    "--texture_quality", "detailed", "--geometry_quality", "standard",
    "--face_limit", "60000",
]


def upload(path):
    # `generate create --image <local path>` auto-upload fails with an S3 signature error
    # in CLI 1.1.13, so upload explicitly and pass the media id.
    res = subprocess.run(["higgsfield", "upload", "create", str(path)], capture_output=True, text=True)
    media_id = res.stdout.strip().splitlines()[-1] if res.stdout.strip() else ""
    if res.returncode != 0 or not re.fullmatch(r"[0-9a-f-]{36}", media_id):
        sys.exit(f"upload failed for {path}: {res.stdout[-300:]} {res.stderr[-300:]}")
    return media_id


def convert(champ):
    media_id = upload(IMAGES / f"{champ}.png")
    cmd = ["higgsfield", "generate", "create", "tripo_h3_1_image_to_3d",
           "--image", media_id, *TRIPO, "--wait", "--wait-timeout", "25m"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    (MODELS / f"{champ}.log").write_text(res.stdout + "\n--- stderr ---\n" + res.stderr)
    urls = URL_RE.findall(res.stdout)
    if res.returncode != 0 or not urls:
        sys.exit(f"[{champ}] 3D job failed (rc={res.returncode}); see assets/models/{champ}.log")
    # Prefer an explicit .glb URL; otherwise sniff each result for the glTF magic.
    urls.sort(key=lambda u: ".glb" not in u.lower())
    for url in urls:
        data = urllib.request.urlopen(url).read()
        if data[:4] == b"glTF":
            (MODELS / f"{champ}.glb").write_bytes(data)
            print(f"[{champ}] 3D model saved -> assets/models/{champ}.glb ({len(data) // 1024} KB)")
            return
    sys.exit(f"[{champ}] no GLB among results: {urls}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("champ")
    ap.add_argument("variant")
    ap.add_argument("--image-only", action="store_true")
    a = ap.parse_args()
    src = CAND / f"{a.champ}_{a.variant.lower()}.png"
    if not src.exists():
        sys.exit(f"missing candidate {src}")
    IMAGES.mkdir(parents=True, exist_ok=True)
    MODELS.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, IMAGES / f"{a.champ}.png")
    print(f"[{a.champ}] approved {src.name}")
    if not a.image_only:
        convert(a.champ)


if __name__ == "__main__":
    main()
