#!/usr/bin/env python3
"""
Apply static overrides from static_overrides/ to static/

Reads manifest.json and copies files according to the configuration.
Fails fast if:
- overwrites_existing=true but destination doesn't exist
- overwrites_existing=false but destination already exists
"""

import json
import shutil
import sys
from pathlib import Path


def main():
    repo_root = Path(__file__).parent.parent
    overrides_dir = repo_root / "static_overrides"
    static_dir = repo_root / "static"
    manifest_path = overrides_dir / "manifest.json"

    if not manifest_path.exists():
        print("No static_overrides/manifest.json found, skipping overrides")
        return 0

    with open(manifest_path) as f:
        manifest = json.load(f)

    overrides = manifest.get("overrides", [])
    if not overrides:
        print("No overrides defined in manifest.json")
        return 0

    print(f"Applying {len(overrides)} static override(s)...")

    for override in overrides:
        source = overrides_dir / override["source"]
        destination = static_dir / override["destination"]
        overwrites_existing = override.get("overwrites_existing", False)
        description = override.get("description", override["source"])

        print(f"\n  Processing: {description}")
        print(f"    Source: {source}")
        print(f"    Destination: {destination}")
        print(f"    Overwrites existing: {overwrites_existing}")

        # Check source exists
        if not source.exists():
            print(f"    ❌ ERROR: Source file does not exist: {source}")
            print(f"       Please add the content to static_overrides/")
            sys.exit(1)

        # Check destination based on overwrites_existing
        dest_exists = destination.exists()

        if overwrites_existing and not dest_exists:
            print(f"    ❌ ERROR: overwrites_existing=true but destination doesn't exist!")
            print(f"       This likely means the Ghost post URL changed.")
            print(f"       Expected: {destination}")
            print(f"       Please update the destination path in manifest.json")
            sys.exit(1)

        if not overwrites_existing and dest_exists:
            print(f"    ❌ ERROR: overwrites_existing=false but destination already exists!")
            print(f"       Set overwrites_existing=true in manifest.json if this is intentional")
            sys.exit(1)

        # Create parent directories if needed
        destination.parent.mkdir(parents=True, exist_ok=True)

        # Copy the file
        shutil.copy2(source, destination)
        print(f"    ✓ Copied successfully")

    print(f"\n✓ All {len(overrides)} override(s) applied successfully")
    return 0


if __name__ == "__main__":
    sys.exit(main())
