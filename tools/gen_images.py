#!/usr/bin/env python3
"""Generate champion chess-piece candidate images with the Higgsfield CLI.

Usage: gen_images.py [champ ...] [--variants N] [--extra "prompt addendum"]
Writes assets/candidates/<champ>_<a|b|...>.png (existing files are never overwritten;
new variants get the next free letter).
"""
import argparse
import re
import string
import subprocess
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "candidates"

# Shared spec keeps the set consistent and friendly to image-to-3D conversion:
# one connected character, planted on an identical plain base, nothing floating, no text.
STYLE = (
    "Chibi stylized 3D collectible vinyl toy figurine, big head small body, funny exaggerated expression. "
    "Single character only, full body fully visible from head to base, standing firmly on a simple smooth "
    "round light-gray stone chess pedestal with no text, no letters, no engraving. "
    "Every part is physically attached to the figure, no floating objects, no particles, no motion blur. "
    "Three-quarter front view, soft even studio lighting, plain seamless light gray background, "
    "clean readable silhouette, high-end Pixar style 3D render."
)

PROMPTS = {
    "garen": (
        "League of Legends champion Garen as a chess KING piece: the Might of Demacia in shiny blue and gold "
        "Demacian armor with a flowing blue cape, a tiny golden king crown perched on his helmet, "
        "mouth wide open mid-yell 'DEMACIA!', huge greatsword resting on his shoulder, "
        "cheesy thumbs-up with his free hand, over-the-top heroic chest-puffed pose."
    ),
    "darius": (
        "League of Legends champion Darius as a chess KING piece: the Hand of Noxus in spiky black and crimson "
        "Noxian armor, furiously scowling with a throbbing forehead vein, a comically too-small golden king crown "
        "on his head, flexing one huge bicep while his giant double-bladed battle axe rests planted on the pedestal "
        "beside his feet, grumpy dad energy."
    ),
    "kayle": (
        "League of Legends champion Kayle as a chess QUEEN piece: the Righteous angel in gleaming gold and white armor "
        "with golden wings folded close behind her back, an ornate golden queen tiara, "
        "extremely smug self-satisfied smirk, one hand on her hip, flaming sword held upright in the other, "
        "both feet planted on the pedestal."
    ),
    "shaco": (
        "League of Legends champion Shaco as a chess BISHOP piece: the Demon Jester bursting out of an open "
        "jack-in-the-box that sits on the pedestal, red and purple jester outfit with a pointy two-tailed jester hat "
        "with bells, creepy huge toothy grin, holding a curved dagger in each hand close to his chest, "
        "mischievous 'peekaboo' pose."
    ),
    "teemo": (
        "League of Legends champion Teemo as a chess PAWN piece: the cute furry yordle scout with his green scout "
        "cap and brass goggles, sitting on top of a red spotted mushroom that grows out of the pedestal, "
        "holding his blowpipe, sinister evil little grin that is somehow still adorable."
    ),
    "malphite": (
        "League of Legends champion Malphite as a chess ROOK piece: the Shard of the Monolith as a chunky rock golem "
        "whose head and shoulders are shaped like castle tower battlements, big goofy googly eyes, "
        "huge boulder fists resting on the pedestal, dopey happy expression."
    ),
    "yasuo": (
        "League of Legends champion Yasuo as a chess KNIGHT piece: the Unforgiven samurai in blue with a gigantic "
        "ridiculous ponytail, riding a tiny chubby unimpressed pony that stands on the pedestal, "
        "katana raised dramatically, overly serious brooding face, the pony looks bored."
    ),
    "taric": (
        "League of Legends champion Taric as a chess BISHOP piece: the Shield of Valoran, absurdly fabulous, "
        "sparkling blue gemstone armor and shoulder pauldrons, long luxurious shampoo-commercial brown hair, "
        "dazzling smile, striking a glamorous hand-on-hip pose while holding a crystal gem mace, "
        "blue gems set into his outfit."
    ),
}

URL_RE = re.compile(r"https://\S+")


def next_paths(champ, n):
    used = {p.stem.split("_", 1)[1] for p in OUT.glob(f"{champ}_*.png")}
    free = [c for c in string.ascii_lowercase if c not in used]
    return [OUT / f"{champ}_{c}.png" for c in free[:n]]


def generate(champ, path, extra, base=None, raw=False):
    prompt = f"{base or PROMPTS[champ]} {extra} {'' if raw else STYLE}".strip()
    cmd = ["higgsfield", "generate", "create", "nano_banana_pro",
           "--prompt", prompt, "--aspect_ratio", "1:1", "--resolution", "2k",
           "--wait", "--wait-timeout", "10m"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    urls = URL_RE.findall(res.stdout)
    if res.returncode != 0 or not urls:
        return f"[{path.stem}] FAILED rc={res.returncode}\n{res.stdout[-500:]}\n{res.stderr[-500:]}"
    urllib.request.urlretrieve(urls[-1], path)
    return f"[{path.stem}] ok -> {path.relative_to(ROOT)}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("champs", nargs="*", default=list(PROMPTS))
    ap.add_argument("--variants", type=int, default=2)
    ap.add_argument("--extra", default="", help="prompt addendum for tweaks")
    ap.add_argument("--prompt", default=None, help="replace the champion's base prompt (STYLE still applies)")
    ap.add_argument("--raw", action="store_true", help="skip the figurine STYLE suffix (textures, maps)")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = [(c, p) for c in args.champs for p in next_paths(c, args.variants)]
    with ThreadPoolExecutor(max_workers=8) as ex:
        for line in ex.map(lambda j: generate(*j, args.extra, args.prompt, args.raw), jobs):
            print(line, flush=True)


if __name__ == "__main__":
    sys.exit(main())
