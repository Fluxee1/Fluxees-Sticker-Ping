"""Build and verify Foundry release assets using only the Python standard library."""
import json
import hashlib
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "https://github.com/Fluxee1/Fluxees-Sticker-Ping"
RUNTIME_FILES = ("scripts/module.js", "styles/module.css", "templates/sticker-manager.hbs")


def public_assets(root):
    allowlist = json.loads((root / "tools/public-assets.json").read_text(encoding="utf-8"))
    for name, expected in allowlist["assets"].items():
        path = root / name
        if not name.startswith("assets/") or ".." in Path(name).parts or not path.is_file():
            raise ValueError(f"Invalid or missing public asset: {name}")
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f"Public asset differs from original GitHub content: {name}")
    return [root / name for name in allowlist["assets"]]


def validate(root):
    manifest = json.loads((root / "module.json").read_text(encoding="utf-8"))
    assert manifest["id"] == "fluxees-ping", "Module ID must preserve existing settings and asset paths"
    assert re.fullmatch(r"\d+\.\d+\.\d+", manifest["version"]), "Expected semantic version"
    assert manifest["manifest"] == f"{REPOSITORY}/releases/latest/download/module.json"
    assert manifest["download"] == f"{REPOSITORY}/releases/download/{manifest['version']}-Release/fluxees-ping.zip"
    assert manifest["compatibility"]["minimum"] == "13"
    for path in manifest["esmodules"] + manifest["styles"]:
        assert (root / path).is_file(), f"Missing entry point: {path}"
    assert (root / "templates/sticker-manager.hbs").is_file()
    assert list((root / "assets").glob("*.png")), "Missing bundled stickers"
    assert (root / "assets/sounds/pop.ogg").is_file()
    assert (root / "assets/sounds/sword-slice.ogg").is_file()
    return manifest


def build(root=ROOT):
    manifest = validate(root)
    # Explicit file lists prevent local configuration, artwork, audio, and extra
    # code files from silently becoming public release contents.
    files = [root / name for name in ("module.json", "README.md", *RUNTIME_FILES)]
    files.extend(public_assets(root))
    allowed_runtime = set(RUNTIME_FILES)
    if not set(manifest["esmodules"] + manifest["styles"]).issubset(allowed_runtime):
        raise ValueError("Manifest references runtime files outside the reviewed file list")
    output = root / "dist"
    output.mkdir(exist_ok=True)
    (output / "module.json").write_bytes((root / "module.json").read_bytes())
    archive = output / "fluxees-ping.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as package:
        for path in sorted(files):
            package.write(path, path.relative_to(root).as_posix())
    with zipfile.ZipFile(archive) as package:
        assert package.testzip() is None, "Corrupt archive"
        assert set(package.namelist()) == {path.relative_to(root).as_posix() for path in files}
        assert package.read("module.json") == (output / "module.json").read_bytes()
    print(f"Built {archive} ({len(files)} files), version {manifest['version']}")
    return archive


if __name__ == "__main__":
    build()
