"""Draw the RailtyMaps toolbar icons (a house above a transit line) as PNGs.

Pure standard library so it runs anywhere: python3 scripts/make-icons.py
Writes public/icon/{16,32,48,96,128}.png, and store/icon-128.png for the Chrome Web Store
listing: the icon at 96px inside 16px of transparent padding, as the store's image guidelines ask.
"""

import os
import struct
import zlib

BLUE = (29, 78, 216)
WHITE = (255, 255, 255)
AMBER = (251, 191, 36)
SIZES = [16, 32, 48, 96, 128]
SUPERSAMPLE = 4


def inside_round_rect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def inside_triangle(x, y, a, b, c):
    def sign(p, q, r):
        return (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1])

    d1, d2, d3 = sign((x, y), a, b), sign((x, y), b, c), sign((x, y), c, a)
    neg = d1 < 0 or d2 < 0 or d3 < 0
    pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (neg and pos)


def color_at(x, y):
    """Color of the icon at normalized (x, y), or None for transparent."""
    if not inside_round_rect(x, y, 0, 0, 1, 1, 0.22):
        return None
    # Stations on the line
    for sx in (0.28, 0.72):
        if (x - sx) ** 2 + (y - 0.8) ** 2 <= 0.075 ** 2:
            return WHITE
    if inside_round_rect(x, y, 0.1, 0.755, 0.9, 0.845, 0.045):
        return AMBER
    # Door cut out of the house
    if 0.44 <= x <= 0.56 and 0.53 <= y <= 0.66:
        return BLUE
    if inside_triangle(x, y, (0.5, 0.14), (0.15, 0.45), (0.85, 0.45)):
        return WHITE
    if 0.25 <= x <= 0.75 and 0.42 <= y <= 0.66:
        return WHITE
    return BLUE


def render(size):
    n = size * SUPERSAMPLE
    rows = []
    for py in range(size):
        row = bytearray([0])  # PNG filter type: none
        for px in range(size):
            r = g = b = a = 0
            for sy in range(SUPERSAMPLE):
                for sx in range(SUPERSAMPLE):
                    c = color_at((px * SUPERSAMPLE + sx + 0.5) / n, (py * SUPERSAMPLE + sy + 0.5) / n)
                    if c:
                        r, g, b, a = r + c[0], g + c[1], b + c[2], a + 255
            count = SUPERSAMPLE * SUPERSAMPLE
            covered = a // 255
            if covered:
                row += bytes([r // covered, g // covered, b // covered, a // count])
            else:
                row += bytes([0, 0, 0, 0])
        rows.append(bytes(row))
    return b"".join(rows)


def png(size, raw):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def padded(size, inner):
    """The icon drawn at `inner` px, centered on a transparent square of `size` px (raw PNG rows)."""
    raw = render(inner)
    stride = 1 + inner * 4  # each row starts with its filter byte
    pad = (size - inner) // 2
    left, right = bytes(pad * 4), bytes((size - inner - pad) * 4)
    rows = []
    for y in range(size):
        if pad <= y < pad + inner:
            start = (y - pad) * stride + 1
            rows.append(b"\x00" + left + raw[start:start + inner * 4] + right)
        else:
            rows.append(b"\x00" + bytes(size * 4))
    return b"".join(rows)


def main():
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    out_dir = os.path.join(root, "public", "icon")
    os.makedirs(out_dir, exist_ok=True)
    for size in SIZES:
        with open(os.path.join(out_dir, f"{size}.png"), "wb") as f:
            f.write(png(size, render(size)))
    print("wrote", ", ".join(f"{s}.png" for s in SIZES), "to", os.path.normpath(out_dir))

    store_icon = os.path.join(root, "store", "icon-128.png")
    with open(store_icon, "wb") as f:
        f.write(png(128, padded(128, 96)))
    print("wrote", os.path.normpath(store_icon))


if __name__ == "__main__":
    main()
