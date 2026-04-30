from pathlib import Path

path = Path("app/components/AuthGate.tsx")
text = path.read_text(encoding="utf-8")

old = """  function goToProtectedPage(path: string) {
    router.refresh();

    window.setTimeout(() => {
      window.location.assign(path);
    }, 0);
  }
"""

new = """  function goToProtectedPage(path: string) {
    window.location.href = path;
  }
"""

if old not in text:
    raise SystemExit("Не нашёл старую функцию goToProtectedPage. Проверь AuthGate.tsx.")

path.write_text(text.replace(old, new), encoding="utf-8")
print("Готово: goToProtectedPage теперь делает прямой переход")
