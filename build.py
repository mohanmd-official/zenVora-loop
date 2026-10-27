#!/usr/bin/env python3
"""Builds public/index.html from the modules in src/ (the app is still ONE file when served).

    python3 build.py           # write public/index.html
    python3 build.py --check   # only check that public/index.html is up to date (exit 1 if not)

Edit the files in src/ — never public/index.html (it is overwritten on every build).
The modules are joined in file-name order: src/css/*.css into <style>, src/js/*.js into one <script>,
so everything shares one scope exactly as before (a function in one module can call one in another).
"""
import glob, os, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
SRC, OUT = os.path.join(ROOT, 'src'), os.path.join(ROOT, 'public', 'index.html')
read = lambda p: open(p, encoding='utf-8').read()
def build():
    shell = read(os.path.join(SRC, 'shell.html'))
    css = ''.join(read(p) for p in sorted(glob.glob(os.path.join(SRC, 'css', '*.css'))))
    js = ''.join(read(p) for p in sorted(glob.glob(os.path.join(SRC, 'js', '*.js'))))
    assert shell.count('/*@build:css*/\n') == 1 and shell.count('//@build:js\n') == 1, 'markers missing in src/shell.html'
    return shell.replace('/*@build:css*/\n', css).replace('//@build:js\n', js)
if __name__ == '__main__':
    html = build()
    if '--check' in sys.argv:
        ok = os.path.exists(OUT) and read(OUT) == html
        print('public/index.html is up to date' if ok else 'public/index.html is OUT OF DATE: run python3 build.py'); sys.exit(0 if ok else 1)
    open(OUT, 'w', encoding='utf-8').write(html)
    print(f'built public/index.html ({len(html) // 1024} KB) from {len(glob.glob(os.path.join(SRC, "js", "*.js")))} JS + {len(glob.glob(os.path.join(SRC, "css", "*.css")))} CSS modules')
