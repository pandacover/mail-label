#!/usr/bin/env python3
"""Generate Mail Label toolbar PNG icons (no third-party deps)."""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "icons"

BG = (15, 15, 18, 255)
TAG = (110, 168, 255, 255)
HOLE = (15, 15, 18, 255)
FLAP = (245, 246, 248, 255)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def png_write(path: Path, pixels: list[list[tuple[int, int, int, int]]]) -> None:
    height = len(pixels)
    width = len(pixels[0])
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for r, g, b, a in row:
            raw.extend((r, g, b, a))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    payload = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.write_bytes(payload)


def fill_rect(px, x0, y0, x1, y1, color) -> None:
    h, w = len(px), len(px[0])
    for y in range(max(0, int(y0)), min(h, int(y1) + 1)):
        for x in range(max(0, int(x0)), min(w, int(x1) + 1)):
            px[y][x] = color


def fill_circle(px, cx, cy, radius, color) -> None:
    h, w = len(px), len(px[0])
    r2 = radius * radius
    y0, y1 = max(0, int(cy - radius - 1)), min(h, int(cy + radius + 2))
    x0, x1 = max(0, int(cx - radius - 1)), min(w, int(cx + radius + 2))
    for y in range(y0, y1):
        for x in range(x0, x1):
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r2:
                px[y][x] = color


def fill_round_rect(px, x, y, w, h, r, color) -> None:
    fill_rect(px, x + r, y, x + w - r, y + h, color)
    fill_rect(px, x, y + r, x + w, y + h - r, color)
    fill_circle(px, x + r, y + r, r, color)
    fill_circle(px, x + w - r, y + r, r, color)
    fill_circle(px, x + r, y + h - r, r, color)
    fill_circle(px, x + w - r, y + h - r, r, color)


def point_in_poly(x: float, y: float, poly: list[tuple[float, float]]) -> bool:
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi):
            inside = not inside
        j = i
    return inside


def fill_poly(px, poly, color) -> None:
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    h, w = len(px), len(px[0])
    x0, x1 = max(0, int(min(xs) - 1)), min(w, int(max(xs) + 2))
    y0, y1 = max(0, int(min(ys) - 1)), min(h, int(max(ys) + 2))
    for y in range(y0, y1):
        for x in range(x0, x1):
            if point_in_poly(x + 0.5, y + 0.5, poly):
                px[y][x] = color


def stroke_poly(px, poly, color, width: float) -> None:
    # Approximate stroke by sampling segments
    h, w = len(px), len(px[0])
    r = width / 2
    pts = poly + [poly[0]]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        dist = math.hypot(x1 - x0, y1 - y0)
        steps = max(1, int(dist * 2))
        for i in range(steps + 1):
            t = i / steps
            fill_circle(px, lerp(x0, x1, t), lerp(y0, y1, t), r, color)
    # silence unused
    _ = (h, w)


def draw_icon(size: int) -> list[list[tuple[int, int, int, int]]]:
    px = [[BG for _ in range(size)] for _ in range(size)]
    s = size / 128.0

    fill_round_rect(px, 6 * s, 6 * s, 116 * s, 116 * s, 28 * s, BG)

    # Price-tag shape (point on the left)
    tag = [
        (22 * s, 64 * s),
        (46 * s, 34 * s),
        (108 * s, 38 * s),
        (108 * s, 90 * s),
        (46 * s, 94 * s),
    ]
    fill_poly(px, tag, TAG)
    fill_circle(px, 38 * s, 64 * s, 7.5 * s, HOLE)
    fill_circle(px, 38 * s, 64 * s, 3.2 * s, TAG)

    # Mini envelope on the tag body
    env = [
        (58 * s, 52 * s),
        (96 * s, 52 * s),
        (96 * s, 78 * s),
        (58 * s, 78 * s),
    ]
    fill_poly(px, env, FLAP)
    flap = [
        (58 * s, 52 * s),
        (77 * s, 66 * s),
        (96 * s, 52 * s),
    ]
    stroke_poly(px, flap, TAG, max(1.6 * s, 1.2))
    stroke_poly(px, env, TAG, max(1.4 * s, 1.0))
    return px


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        png_write(ROOT / f"icon{size}.png", draw_icon(size))
        print(f"wrote {ROOT / f'icon{size}.png'}")


if __name__ == "__main__":
    main()
