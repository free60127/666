from pathlib import Path
import sys

sys.path.insert(0, r"C:\Users\23674\AppData\Local\Temp\codex-qr-deps")
import qrcode
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent
URL = "https://free60127.github.io/666/"
CAT_PATH = Path(r"C:\Users\23674\AppData\Local\Temp\codex-clipboard-5644c5cf-ba04-42ed-bca9-2fa632e8143d.png")
QR_PATH = ROOT / "website-qr.png"
POSTER_PATH = ROOT / "website-qr-square-poster.png"

W = H = 2048
BG = "#F7F5EF"
GREEN = "#28634F"
GREEN_DARK = "#183B31"
ORANGE = "#D97845"
MUTED = "#68766F"


def font(size, bold=False):
    path = r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc"
    return ImageFont.truetype(path, size=size)


qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=18, border=5)
qr.add_data(URL)
qr.make(fit=True)
qr_img = qr.make_image(fill_color=GREEN_DARK, back_color="white").convert("RGB")
qr_img.save(QR_PATH, format="PNG", optimize=True)

poster = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(poster)
draw.rounded_rectangle((80, 80, W - 80, H - 80), radius=58, outline="#D9E4DB", width=5)
draw.ellipse((W - 510, -100, W + 180, 590), fill="#E5EEE7")
draw.ellipse((-240, H - 450, 380, H + 170), fill="#F1E3D8")
draw.rounded_rectangle((120, 136, 1928, 490), radius=42, fill=GREEN)
draw.rounded_rectangle((120, 515, 1928, 595), radius=40, fill="#E4EEE7")

draw.text((190, 178), "外院 · 知识分享站", font=font(78, True), fill="white")
draw.text((196, 292), "KNOWLEDGE SHARE / 2026", font=font(29), fill="#CFE4D6")
draw.text((196, 390), "把学习资料，放在一个更好找的地方。", font=font(42), fill="white")

labels = ["专业课", "计算机", "思政", "考证", "电子教材"]
x = 185
for label in labels:
    draw.rounded_rectangle((x, 535, x + 290, 575), radius=20, fill="#DDEBE0")
    draw.text((x + 145, 555), label, anchor="mm", font=font(25, True), fill=GREEN)
    x += 333

card = (260, 690, 1788, 1755)
draw.rounded_rectangle(card, radius=52, fill="white", outline="#DCE7DF", width=5)
draw.text((1024, 750), "扫码进入学习资料站", anchor="ma", font=font(52, True), fill=GREEN_DARK)
draw.text((1024, 834), "课程题库 · 学习工具 · 资料持续更新", anchor="ma", font=font(30), fill=MUTED)
qr_size = 730
qr_big = qr_img.resize((qr_size, qr_size), Image.Resampling.NEAREST)
poster.paste(qr_big, ((W - qr_size) // 2, 925))
draw.text((1024, 1690), URL, anchor="mm", font=font(27), fill=MUTED)

cat = Image.open(CAT_PATH).convert("RGBA")
cat.thumbnail((430, 430), Image.Resampling.LANCZOS)
pixels = cat.load()
for yy in range(cat.height):
    for xx in range(cat.width):
        r, g, b, a = pixels[xx, yy]
        if r > 244 and g > 244 and b > 244:
            pixels[xx, yy] = (r, g, b, 0)
shadow = Image.new("RGBA", cat.size, (24, 47, 39, 90))
shadow.putalpha(cat.getchannel("A").filter(ImageFilter.GaussianBlur(14)))
poster_rgba = poster.convert("RGBA")
poster_rgba.alpha_composite(shadow, (1500, 1535))
poster_rgba.alpha_composite(cat, (1495, 1505))
poster = poster_rgba.convert("RGB")
draw = ImageDraw.Draw(poster)
draw.text((180, 1845), "免费分享 · 持续完善", font=font(30, True), fill=GREEN)
draw.text((1865, 1845), "FREE", anchor="ra", font=font(30, True), fill=ORANGE)
poster.save(POSTER_PATH, format="PNG", optimize=True)
print(QR_PATH)
print(POSTER_PATH)
