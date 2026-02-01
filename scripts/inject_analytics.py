#!/usr/bin/env python3
"""Inject Plausible analytics into HTML files that don't already have it."""

import os
import sys

ANALYTICS_ID = "pa-BcRrHMb-WDJL_dgiM5A81"

ANALYTICS_SCRIPT = f"""<!-- Privacy-friendly analytics by Plausible -->
  <script async src="https://plausible.io/js/{ANALYTICS_ID}.js"></script>
  <script>
    window.plausible=window.plausible||function(){{(plausible.q=plausible.q||[]).push(arguments)}},plausible.init=plausible.init||function(i){{plausible.o=i||{{}}}};
    plausible.init()
  </script>
</head>"""

SKIP_PATHS = ["/rss/"]


def should_skip(filepath: str) -> bool:
    return any(skip in filepath for skip in SKIP_PATHS)


def inject_analytics(directory: str) -> int:
    files_processed = 0

    for root, _, files in os.walk(directory):
        for filename in files:
            if not filename.endswith(".html"):
                continue

            filepath = os.path.join(root, filename)

            if should_skip(filepath):
                continue

            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()

            if ANALYTICS_ID in content:
                continue

            if "</head>" not in content:
                continue

            modified = content.replace("</head>", ANALYTICS_SCRIPT)

            with open(filepath, "w", encoding="utf-8") as f:
                f.write(modified)

            files_processed += 1

    return files_processed


def main():
    if len(sys.argv) < 2:
        print("Usage: inject_analytics.py <directory>")
        sys.exit(1)

    directory = sys.argv[1]

    if not os.path.isdir(directory):
        print(f"Error: {directory} is not a directory")
        sys.exit(1)

    count = inject_analytics(directory)
    print(f"Injected analytics into {count} HTML files")


if __name__ == "__main__":
    main()
