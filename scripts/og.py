"""Composes public/og.png from the raw map (scripts/og.mjs) plus title text.
Usage: python3 scripts/og.py <in.rgba> <Inter.ttf> public/og.jpg"""
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1200, 630
raw, font_path, out = sys.argv[1:4]
img = Image.frombytes('RGBA', (W, H), open(raw, 'rb').read()).convert('RGB')

# Darken the left side so the title reads well.
shade = Image.new('L', (W, H))
d = ImageDraw.Draw(shade)
for x in range(W):
    # Solid behind the text, fading out across the middle of the image.
    d.line([(x, 0), (x, H)], fill=int(236 if x < 560 else max(0, 236 - (x - 560) * 0.55)))
img = Image.composite(Image.new('RGB', (W, H), (11, 13, 18)), img, shade)

draw = ImageDraw.Draw(img)
def font(size, weight):
    f = ImageFont.truetype(font_path, size)
    try:
        f.set_variation_by_axes([14 if size < 40 else 32, weight])
    except Exception:
        pass
    return f

# Logo diamond + name.
cx, cy = 92, 118
draw.polygon([(cx, cy - 16), (cx + 16, cy), (cx, cy + 16), (cx - 16, cy)], fill=(156, 242, 122))
draw.text((122, 96), 'Seedscape', font=font(44, 700), fill=(238, 241, 246))
draw.text((72, 210), 'Every structure and biome,', font=font(58, 700), fill=(238, 241, 246))
draw.text((72, 280), 'on one map.', font=font(58, 700), fill=(156, 242, 122))
draw.text((72, 380), 'Relief and 3D terrain · seed finder · biome search', font=font(28, 500), fill=(201, 206, 216))
draw.text((72, 424), 'Minecraft Java 1.18 – 1.21 · runs in your browser', font=font(28, 500), fill=(141, 149, 163))
draw.text((72, 540), 'seedscape.ishanmalu.dev', font=font(26, 600), fill=(156, 242, 122))
draw.text((72, 578), 'Built by Ishan Malu · github.com/ishanmalu', font=font(22, 500), fill=(141, 149, 163))
img.save(out, quality=86, optimize=True, progressive=True)
print('wrote', out, img.size)
