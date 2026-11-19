from pathlib import Path
from PIL import Image

expected = {
    '1-cover.jpg': (1280, 720),
    '2-editor.jpg': (1280, 720),
    '3-cover.jpg': (1024, 1280),
    '4-cover.jpg': (1024, 1024),
}
files = sorted(Path('screenshots').glob('*.jpg'))
if not files:
    raise SystemExit('未通过：screenshots/ 无本次会话实拍截图；浏览器启动受到环境限制。')
assert {f.name for f in files} == set(expected), '截图文件列表不完整'
for file in files:
    with Image.open(file) as image:
        size = image.size
        image.verify()
    length = file.stat().st_size
    assert size == expected[file.name], (file.name, size)
    assert max(size) <= 1280 and min(size) >= 480
    assert length <= 262144
    print(f'{file.name}: {size[0]}×{size[1]}, {length} bytes — PASS')
