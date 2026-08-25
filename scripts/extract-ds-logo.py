"""从 app-icon.png 白底圆角方内抠出 DeepSeek logo 剪影，导出黑/白两版。"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "app-icon.png"
OUT = ROOT / "public"


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    arr = np.array(im)
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    luma = 0.299 * r + 0.587 * g + 0.114 * b
    logo = (a > 200) & (luma < 80)
    ys, xs = np.where(logo)
    if xs.size == 0:
        raise SystemExit("no logo pixels found")
    pad = 24
    x0 = max(0, int(xs.min()) - pad)
    y0 = max(0, int(ys.min()) - pad)
    x1 = min(arr.shape[1] - 1, int(xs.max()) + pad)
    y1 = min(arr.shape[0] - 1, int(ys.max()) + pad)
    mask = logo[y0 : y1 + 1, x0 : x1 + 1]
    h, w = mask.shape
    black = np.zeros((h, w, 4), dtype=np.uint8)
    black[mask] = (0, 0, 0, 255)
    white = np.zeros((h, w, 4), dtype=np.uint8)
    white[mask] = (255, 255, 255, 255)

    for name, data in (("ds-logo-black.png", black), ("ds-logo-white.png", white)):
        img = Image.fromarray(data, "RGBA")
        side = max(img.size)
        sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        sq.paste(img, ((side - img.size[0]) // 2, (side - img.size[1]) // 2))
        sq.resize((160, 160), Image.Resampling.LANCZOS).save(OUT / name)
        print(name, "logo_pixels", int(mask.sum()), "bbox", w, h)


if __name__ == "__main__":
    main()
