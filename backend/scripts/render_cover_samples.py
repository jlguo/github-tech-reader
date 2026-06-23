#!/usr/bin/env python3
"""Render sample covers for all 4 templates to /tmp/cover_samples/."""

import sys
import os

# ensure backend package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from pathlib import Path
from app.services.cover_renderer import render_cover

SAMPLES = {
    "github": {
        "title": "Build a Second Brain",
        "tagline": "Transform your digital life with systematic knowledge management",
        "author": "tiago-forte",
        "language": "TypeScript",
        "stars": "12.4k",
    },
    "youtube": {
        "duration": "14:32",
        "title": "React Server Components Deep Dive",
        "tagline": "Understanding the architecture behind modern React applications",
        "channel": "Frontend Masters",
    },
    "url": {
        "domain": "arstechnica.com",
        "title": "The Complete Guide to Modern CSS Layout",
        "tagline": "From Flexbox to Grid, discover the power of modern CSS layout techniques",
        "author": "arstechnica.com",
    },
    "file": {
        "ext_label": "PDF",
        "title": "Advanced TypeScript Patterns",
        "tagline": "Uploaded document",
        "author": "Unknown",
        "size": "2.4MB",
    },
}

OUT = Path("/tmp/cover_samples")
OUT.mkdir(parents=True, exist_ok=True)

for key, fields in SAMPLES.items():
    out_path = str(OUT / f"{key}.png")
    render_cover(key, fields, out_path)
    size_kb = os.path.getsize(out_path) / 1024
    print(f"  ✓ {key}.png  ({size_kb:.0f} KB, {out_path})")

print(f"\nCreated {len(SAMPLES)} sample covers in {OUT}")
