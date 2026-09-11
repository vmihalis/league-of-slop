# League of Slop

3D browser chess with funny League of Legends champion pieces on a Summoner's Rift board.
Art generated with the Higgsfield CLI (Nano Banana Pro images, Tripo H3.1 image-to-3D).

| Piece  | Demacia (white) | Noxus (black) |
|--------|-----------------|---------------|
| King   | Garen           | Darius        |
| Queen  | Kayle           | Kayle         |
| Bishop | Taric           | Shaco         |
| Knight | Yasuo           | Yasuo         |
| Rook   | Malphite        | Malphite      |
| Pawn   | Teemo           | Teemo         |

## Run

```sh
python3 -m http.server 8765
# open http://127.0.0.1:8765
```

No build step; three.js r170 and chess.js 1.0 are vendored in `vendor/`.

## Layout

- `app.js`, `index.html`, `style.css` - the game (Three.js scene, chess.js rules, 3-ply AI, kill feed)
- `assets/models/<champ>.glb` - 3D pieces; `assets/images/<champ>.png` - approved art
- `assets/board/` - Summoner's Rift map and jungle ground textures
- `assets/candidates/` - every generated variant, `_sheets/` has side-by-side review sheets
- `tools/gen_images.py` - generate candidates (`--variants`, `--prompt`, `--extra`, `--raw`)
- `tools/approve.py <champ> <letter>` - approve a candidate and convert it to a GLB
- `tools/sheet.py` - build review sheets; `tools/preview.html?m=<champ>` - check a model's facing

Higgsfield CLI 1.1.13 note: passing a local path to `generate create --image` fails with an S3
signature error, so `approve.py` uploads first with `higgsfield upload create` and passes the id.

## License

Code is MIT (see `LICENSE`). This is an unofficial fan project: League of Legends, its champions,
and Summoner's Rift are trademarks and IP of Riot Games, and the generated art depicts them, so
the MIT grant covers the code only, not rights to Riot's characters.
