import functools
import http.server
import importlib.util
import io
import json
from pathlib import Path
import shutil
import tempfile
import threading
import unittest
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("package", ROOT / "tools/package.py")
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "source"
        shutil.copytree(ROOT, self.root, ignore=shutil.ignore_patterns(".git", "dist", "__pycache__"))

    def test_download_and_extract_runtime_package(self):
        archive = package.build(self.root)
        handler = functools.partial(QuietHandler, directory=str(archive.parent))
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = f"http://127.0.0.1:{server.server_port}"
            with urllib.request.urlopen(f"{base}/module.json") as response:
                manifest = json.load(response)
            with urllib.request.urlopen(f"{base}/{manifest['download'].rsplit('/', 1)[1]}") as response:
                data = response.read()
            target = Path(self.temp.name) / "Data/modules" / manifest["id"]
            with zipfile.ZipFile(io.BytesIO(data)) as downloaded:
                downloaded.extractall(target)
            self.assertEqual(package.validate(target), manifest)
            self.assertEqual(manifest["compatibility"], {"minimum": "13", "verified": "14"})
            for source in (self.root / "assets").rglob("*"):
                if source.is_file():
                    self.assertEqual(source.read_bytes(), (target / source.relative_to(self.root)).read_bytes())
            for name in ("README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"):
                self.assertEqual((self.root / name).read_bytes(), (target / name).read_bytes())
            for name in ("tools", "tests", ".git", ".gitignore", ".gitattributes", ".github"):
                self.assertFalse((target / name).exists())
        finally:
            server.shutdown()
            thread.join()
            server.server_close()

    def test_reject_missing_license_or_notices(self):
        for name in ("LICENSE", "THIRD_PARTY_NOTICES.md"):
            with self.subTest(name=name):
                path = self.root / name
                original = path.read_bytes()
                path.unlink()
                try:
                    with self.assertRaisesRegex(AssertionError, "Missing license or documentation file"):
                        package.build(self.root)
                finally:
                    path.write_bytes(original)

    def test_reject_missing_entry_point(self):
        (self.root / "scripts/module.js").unlink()
        with self.assertRaisesRegex(AssertionError, "Missing entry point"):
            package.build(self.root)

    def test_reject_version_download_mismatch(self):
        path = self.root / "module.json"
        manifest = json.loads(path.read_text())
        manifest["version"] = "99.0.0"
        path.write_text(json.dumps(manifest))
        with self.assertRaises(AssertionError):
            package.build(self.root)

    def test_exclude_added_private_files(self):
        for name in ("assets/private.png", "assets/sounds/private.ogg",
                     "scripts/personal-config.json", "templates/private.hbs",
                     "styles/private.css", ".env"):
            (self.root / name).write_bytes(b"PRIVATE TEST CONTENT")
        with zipfile.ZipFile(package.build(self.root)) as archive:
            self.assertFalse(any(b"PRIVATE TEST CONTENT" in archive.read(name)
                                 for name in archive.namelist()))
            expected = {
                "module.json", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md",
                "scripts/module.js", "styles/module.css", "templates/sticker-manager.hbs",
                *json.loads((self.root / "tools/public-assets.json").read_text())["assets"],
            }
            self.assertEqual(set(archive.namelist()), expected)

    def test_reject_modified_public_asset(self):
        (self.root / "assets/angry.png").write_bytes(b"PRIVATE REPLACEMENT")
        with self.assertRaisesRegex(ValueError, "differs from original GitHub"):
            package.build(self.root)


if __name__ == "__main__":
    unittest.main()
