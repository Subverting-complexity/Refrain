"""
Refrain — App Store / Google Play screenshot generator.

Composes artistic, on-brand store screenshots from raw app captures:
a dark green-tinted background matching the app palette, a rounded device
frame holding the real screen, and a short marketing caption.

Palette is taken straight from src/theme/index.ts (dark theme):
  background #111d1f  surface #1a2e30  accent(mint) #7edbb8
  textPrimary #e8f5f0  textSecondary #8ba89e  border #2a4a4e
  markerA #ffb02e  markerB #ff5d77

Everything is rendered with Pillow at exact target pixel sizes (no upscaling
of the composition; the source screen is downscaled to fit). Run:

    python render.py mockups     # 2 hero directions -> creative/_preview/
    python render.py full        # full sets -> fastlane/screenshots + android images

Dimensions verified programmatically before writing.
"""

from __future__ import annotations

import math
import os
import sys
from dataclasses import dataclass

from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ---------------------------------------------------------------------------
# Palette (from src/theme/index.ts darkColors)
# ---------------------------------------------------------------------------
BG = (17, 29, 31)  # #111d1f
BG_DEEP = (9, 17, 18)  # darker for gradient base
SURFACE = (26, 46, 48)  # #1a2e30
ACCENT = (126, 219, 184)  # #7edbb8 mint
TEXT_PRIMARY = (232, 245, 240)  # #e8f5f0
TEXT_SECONDARY = (139, 168, 158)  # #8ba89e
BORDER = (42, 74, 78)  # #2a4a4e
MARKER_A = (255, 176, 46)  # #ffb02e
MARKER_B = (255, 93, 119)  # #ff5d77

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
RAW_DIR = os.path.join(REPO, "assets", "appstore_images")
ICON_PATH = os.path.join(REPO, "assets", "logo", "png", "icon-transparent.png")

# Raw screenshots mapped to a stable ordering + captions.
# order is the store slide order (slide 1 is the most-seen image).
# Each caption is a single centered line: `lead` (primary) + `accent` (mint),
# kept short so the type stays large and legible at thumbnail size.
SLIDES = [
    {
        "id": "IMG_2203",
        "cap_lead": "Loop any",
        "cap_accent": "section",
    },
    {
        "id": "IMG_2205",
        "cap_lead": "Save your",
        "cap_accent": "loops",
    },
    {
        "id": "IMG_2199",
        "cap_lead": "Your",
        "cap_accent": "library",
    },
    {
        "id": "IMG_2208",
        "cap_lead": "Skip",
        "cap_accent": "precisely",
    },
    {
        "id": "IMG_2206",
        "cap_lead": "Count you",
        "cap_accent": "in",
    },
    {
        "id": "IMG_2198",
        "cap_lead": "Play your",
        "cap_accent": "favourites",
    },
]

# ---------------------------------------------------------------------------
# Fonts
# ---------------------------------------------------------------------------
FONTS = "C:/Windows/Fonts"


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(os.path.join(FONTS, name), size)


# ---------------------------------------------------------------------------
# Drawing helpers
# ---------------------------------------------------------------------------
def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def vertical_gradient(size, top, bottom):
    w, h = size
    base = Image.new("RGB", (1, h))
    px = base.load()
    for y in range(h):
        px[0, y] = lerp(top, bottom, y / max(1, h - 1))
    return base.resize((w, h))


def radial_glow(size, center, radius, color, max_alpha):
    """Soft radial glow as an RGBA layer."""
    w, h = size
    glow = Image.new("L", (w, h), 0)
    gpx = glow.load()
    cx, cy = center
    r2 = radius * radius
    for y in range(h):
        dy2 = (y - cy) ** 2
        for x in range(w):
            d2 = (x - cx) ** 2 + dy2
            if d2 < r2:
                t = 1 - (d2 / r2)
                gpx[x, y] = int(max_alpha * (t ** 1.6))
    color_layer = Image.new("RGBA", (w, h), color + (0,))
    color_layer.putalpha(glow)
    return color_layer


def rounded_mask(size, radius, ss=4):
    """Anti-aliased rounded-rectangle mask via supersampling."""
    w, h = size
    big = Image.new("L", (w * ss, h * ss), 0)
    d = ImageDraw.Draw(big)
    d.rounded_rectangle([0, 0, w * ss - 1, h * ss - 1], radius=radius * ss, fill=255)
    return big.resize((w, h), Image.LANCZOS)


def draw_text_center(draw, cx, y, text, fnt, fill):
    bbox = draw.textbbox((0, 0), text, font=fnt)
    tw = bbox[2] - bbox[0]
    draw.text((cx - tw / 2, y), text, font=fnt, fill=fill)
    return bbox[3] - bbox[1]


def measure(draw, text, fnt):
    b = draw.textbbox((0, 0), text, font=fnt)
    return b[2] - b[0], b[3] - b[1]


# ---------------------------------------------------------------------------
# Composition
# ---------------------------------------------------------------------------
@dataclass
class Layout:
    w: int
    h: int
    scale: float  # relative to the 1320x2868 reference


REF_W, REF_H = 1320, 2868


def load_screen(slide_id: str) -> Image.Image:
    path = os.path.join(RAW_DIR, slide_id + ".png")
    if not os.path.exists(path):
        path = os.path.join(RAW_DIR, slide_id + ".PNG")
    return Image.open(path).convert("RGB")


def load_icon() -> Image.Image:
    return Image.open(ICON_PATH).convert("RGBA")


def compose(slide, size, variant="A", show_status_caption=True) -> Image.Image:
    w, h = size
    s = w / REF_W  # uniform scale from reference design

    # --- background gradient ---
    img = vertical_gradient((w, h), BG_DEEP, BG).convert("RGBA")

    # --- ambient waveform texture along the lower third ---
    wave = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wave)
    baseline = int(h * (0.80 if variant == "A" else 0.86))
    bar_w = max(2, int(4 * s))
    gap = max(3, int(7 * s))
    x = int(-10 * s)
    i = 0
    while x < w:
        # smooth pseudo-random envelope, deterministic
        amp = (
            0.5
            + 0.5 * math.sin(i * 0.20)
            * math.sin(i * 0.057 + 1.3)
        )
        bar_h = int((30 + amp * 190) * s)
        wd.rounded_rectangle(
            [x, baseline - bar_h // 2, x + bar_w, baseline + bar_h // 2],
            radius=bar_w // 2,
            fill=ACCENT + (26,),
        )
        x += bar_w + gap
        i += 1
    img = Image.alpha_composite(img, wave)

    # --- mint radial glow behind the device ---
    glow = radial_glow(
        (w, h),
        center=(int(w * 0.5), int(h * (0.58 if variant == "A" else 0.62))),
        radius=int(w * 0.85),
        color=ACCENT,
        max_alpha=60 if variant == "A" else 46,
    )
    img = Image.alpha_composite(img, glow)

    draw = ImageDraw.Draw(img)

    # --- caption: one big centered line, `lead` (primary) + `accent` (mint) ---
    lead_size = int(124 * s)
    f_lead = font("segoeuib.ttf", lead_size)

    top_pad = int(250 * s)
    cx = w // 2

    lead = slide["cap_lead"]
    accent = slide["cap_accent"]
    space = " "
    lw, lh = measure(draw, lead + space, f_lead)
    aw, ah = measure(draw, accent, f_lead)
    total_w = lw + aw
    line_h = max(lh, ah)

    # small mint underline flourish above the headline
    ul_w = int(110 * s)
    ul_y = top_pad - int(60 * s)
    draw.rounded_rectangle(
        [cx - ul_w // 2, ul_y, cx + ul_w // 2, ul_y + int(9 * s)],
        radius=int(4 * s),
        fill=ACCENT + (255,),
    )

    x0 = cx - total_w / 2
    y = top_pad
    draw.text((x0, y), lead + space, font=f_lead, fill=TEXT_PRIMARY)
    draw.text((x0 + lw, y), accent, font=f_lead, fill=ACCENT)
    y += line_h + int(90 * s)

    # --- device frame with the real screen ---
    screen = load_screen(slide["id"])
    src_ratio = screen.width / screen.height  # ~0.462

    # device width ~ 62% of canvas for variant A, a touch larger for B
    dev_w = int(w * (0.62 if variant == "A" else 0.66))
    dev_h = int(dev_w / src_ratio)

    # place device so it sits below the caption, comfortably within canvas
    dev_x = (w - dev_w) // 2
    dev_y = int(y + int(30 * s))
    # keep bottom margin
    max_bottom = h - int(150 * s)
    if dev_y + dev_h > max_bottom:
        dev_y = max_bottom - dev_h

    corner = int(70 * s)

    # drop shadow
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    pad = int(30 * s)
    sd.rounded_rectangle(
        [dev_x - pad, dev_y - pad + int(30 * s), dev_x + dev_w + pad, dev_y + dev_h + pad + int(40 * s)],
        radius=corner + pad,
        fill=(0, 0, 0, 150),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(int(38 * s)))
    img = Image.alpha_composite(img, shadow)

    # screen scaled to device inner size
    screen_scaled = screen.resize((dev_w, dev_h), Image.LANCZOS).convert("RGBA")
    mask = rounded_mask((dev_w, dev_h), corner)
    device = Image.new("RGBA", (dev_w, dev_h), (0, 0, 0, 0))
    device.paste(screen_scaled, (0, 0), mask)

    img.paste(device, (dev_x, dev_y), device)

    # crisp mint-tinted border around the device
    bdraw = ImageDraw.Draw(img)
    bw = max(2, int(4 * s))
    bdraw.rounded_rectangle(
        [dev_x, dev_y, dev_x + dev_w - 1, dev_y + dev_h - 1],
        radius=corner,
        outline=BORDER + (255,),
        width=bw,
    )

    return img.convert("RGB")


def save_exact(img, path, expected):
    assert img.size == expected, f"size {img.size} != expected {expected} for {path}"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG")
    print(f"  wrote {os.path.relpath(path, REPO)}  {img.size[0]}x{img.size[1]}")


# ---------------------------------------------------------------------------
# Targets
# ---------------------------------------------------------------------------
APPLE_IPHONE = (1320, 2868)  # 6.9" master
PLAY_PHONE = (1290, 2796)    # 9:16 portrait within Play limits


def cmd_mockups():
    out = os.path.join(HERE, "_preview")
    os.makedirs(out, exist_ok=True)
    # Preview the chosen direction (variant B) across the first two slides so
    # the shorter single-line captions can be reviewed before the full run.
    for idx in (0, 3):
        img = compose(SLIDES[idx], APPLE_IPHONE, variant="B")
        save_exact(img, os.path.join(out, f"preview_{idx + 1:02d}.png"), APPLE_IPHONE)


def cmd_full(variant="A"):
    ios_dir = os.path.join(REPO, "fastlane", "screenshots", "en-US")
    play_dir = os.path.join(
        REPO, "fastlane", "metadata", "android", "en-US", "images", "phoneScreenshots"
    )
    for idx, slide in enumerate(SLIDES, start=1):
        ios = compose(slide, APPLE_IPHONE, variant=variant)
        save_exact(ios, os.path.join(ios_dir, f"{idx:02d}_iphone69.png"), APPLE_IPHONE)
        play = compose(slide, PLAY_PHONE, variant=variant)
        save_exact(play, os.path.join(play_dir, f"{idx:02d}.png"), PLAY_PHONE)
    # feature graphic
    make_feature_graphic()


def ambient_waveform_layer(size, baseline_frac, alpha) -> Image.Image:
    """Full-width faint waveform texture, used as landscape-banner backdrop."""
    w, h = size
    s = h / 500
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    baseline = int(h * baseline_frac)
    bar_w = max(2, int(4 * s))
    gap = max(3, int(7 * s))
    x = int(-10 * s)
    i = 0
    while x < w:
        amp = 0.5 + 0.5 * math.sin(i * 0.20) * math.sin(i * 0.057 + 1.3)
        bar_h = int((16 + amp * 110) * s)
        d.rounded_rectangle(
            [x, baseline - bar_h // 2, x + bar_w, baseline + bar_h // 2],
            radius=bar_w // 2,
            fill=ACCENT + (alpha,),
        )
        x += bar_w + gap
        i += 1
    return layer


def compose_banner(size, slide_id, tagline, headline="Refrain") -> Image.Image:
    """Premium landscape banner: dark gradient + glow + ambient waveform,
    a device-framed real screenshot on the right, and a soft surface card
    holding the icon/wordmark/tagline on the left. Used for the Play feature
    graphic and general marketing banners so they all read as one system.
    """
    w, h = size
    s = h / 500  # reference scale off the 1024x500 feature-graphic design

    img = vertical_gradient((w, h), BG_DEEP, BG).convert("RGBA")
    img = Image.alpha_composite(img, ambient_waveform_layer(size, 0.82, 22))

    # --- device frame with the real screen, anchored to the right ---
    screen = load_screen(slide_id)
    src_ratio = screen.width / screen.height

    dev_h = int(h * 0.94)
    dev_w = int(dev_h * src_ratio)
    margin = int(50 * s)
    dev_x = w - margin - dev_w
    dev_y = (h - dev_h) // 2
    corner = int(46 * s)

    glow = radial_glow(
        (w, h),
        center=(dev_x + dev_w // 2, h // 2),
        radius=int(dev_w * 1.9),
        color=ACCENT,
        max_alpha=75,
    )
    img = Image.alpha_composite(img, glow)

    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    pad = int(22 * s)
    sd.rounded_rectangle(
        [dev_x - pad, dev_y - pad + int(18 * s), dev_x + dev_w + pad, dev_y + dev_h + pad + int(24 * s)],
        radius=corner + pad,
        fill=(0, 0, 0, 150),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(int(24 * s)))
    img = Image.alpha_composite(img, shadow)

    screen_scaled = screen.resize((dev_w, dev_h), Image.LANCZOS).convert("RGBA")
    mask = rounded_mask((dev_w, dev_h), corner)
    device = Image.new("RGBA", (dev_w, dev_h), (0, 0, 0, 0))
    device.paste(screen_scaled, (0, 0), mask)
    img.paste(device, (dev_x, dev_y), device)

    bdraw = ImageDraw.Draw(img)
    bdraw.rounded_rectangle(
        [dev_x, dev_y, dev_x + dev_w - 1, dev_y + dev_h - 1],
        radius=corner,
        outline=BORDER + (255,),
        width=max(2, int(3 * s)),
    )

    # --- soft surface card behind the wordmark, so the text has a "back" ---
    icon_size = int(90 * s)
    f_name = font("segoeuib.ttf", int(64 * s))
    f_tag = font("segoeui.ttf", int(27 * s))

    card_x0 = int(48 * s)
    card_y0 = int(48 * s)
    card_w = min(int(560 * s), dev_x - card_x0 - int(30 * s))
    card_w = max(card_w, int(340 * s))
    card_h = h - int(96 * s)
    card_radius = int(28 * s)

    card = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle(
        [card_x0, card_y0, card_x0 + card_w, card_y0 + card_h],
        radius=card_radius,
        fill=SURFACE + (140,),
        outline=BORDER + (200,),
        width=max(1, int(2 * s)),
    )
    img = Image.alpha_composite(img, card)

    d = ImageDraw.Draw(img)
    inner_x = card_x0 + int(36 * s)
    icon = load_icon().resize((icon_size, icon_size), Image.LANCZOS)
    icon_y = card_y0 + int(36 * s)
    img.paste(icon, (inner_x, icon_y), icon)

    text_x = inner_x + icon_size + int(20 * s)
    text_y = icon_y + int(icon_size * 0.5) - int(f_name.size * 0.42)
    d.text((text_x, text_y), headline, font=f_name, fill=TEXT_PRIMARY)

    tag_y = icon_y + icon_size + int(30 * s)
    max_tag_w = card_x0 + card_w - int(36 * s) - inner_x
    words = tagline.split(" ")
    lines, cur = [], ""
    for word in words:
        trial = (cur + " " + word).strip()
        if measure(d, trial, f_tag)[0] <= max_tag_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    for line in lines:
        d.text((inner_x, tag_y), line, font=f_tag, fill=ACCENT)
        tag_y += int(f_tag.size * 1.3)

    return img.convert("RGB")


def make_feature_graphic():
    img = compose_banner((1024, 500), "IMG_2203", "Loop. Practice. Repeat.")
    out = os.path.join(REPO, "fastlane", "metadata", "android", "en-US", "images", "featureGraphic")
    p = os.path.join(out, "featureGraphic.png")
    save_exact(img, p, (1024, 500))


BANNERS = [
    # (relative output path under assets/marketing/, size, tagline)
    ("social-banner.png", (1200, 630), "A focused A/B loop player for anyone who learns by repetition."),
    ("hero-banner.png", (1600, 500), "Loop. Practice. Repeat."),
]


def cmd_banners():
    out_dir = os.path.join(REPO, "assets", "marketing")
    for name, size, tagline in BANNERS:
        img = compose_banner(size, "IMG_2203", tagline)
        save_exact(img, os.path.join(out_dir, name), size)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "mockups"
    if cmd == "mockups":
        cmd_mockups()
    elif cmd == "full":
        variant = sys.argv[2] if len(sys.argv) > 2 else "A"
        cmd_full(variant)
        cmd_banners()
    elif cmd == "banners":
        cmd_banners()
    else:
        print("usage: render.py [mockups|full [A|B]|banners]")
