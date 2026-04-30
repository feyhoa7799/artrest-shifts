from pathlib import Path

files = [
    Path("app/components/AuthGate.tsx"),
    Path("app/components/ApprovedShiftsCard.tsx"),
    Path("app/components/TelegramLinkCard.tsx"),
]

for path in files:
    if not path.exists():
        print(f"SKIP: {path} не найден")
        continue

    text = path.read_text(encoding="utf-8")

    text = text.replace(
        '<Link\n                href="/admin"\n                className=',
        '<Link\n                href="/admin"\n                prefetch={false}\n                className='
    )

    text = text.replace(
        '<Link\n                href="/my-applications"\n                className=',
        '<Link\n                href="/my-applications"\n                prefetch={false}\n                className='
    )

    text = text.replace(
        '<Link\n              href="/my-applications"\n              className=',
        '<Link\n              href="/my-applications"\n              prefetch={false}\n              className='
    )

    text = text.replace(
        '<Link\n                href="/slots"\n                className=',
        '<Link\n                href="/slots"\n                prefetch={false}\n                className='
    )

    text = text.replace(
        '<Link\n                  href="/slots"\n                  className=',
        '<Link\n                  href="/slots"\n                  prefetch={false}\n                  className='
    )

    text = text.replace(
        "      showNotice('Вход выполнен.');\n      resetCaptcha();\n      await hydrate();",
        "      showNotice('Вход выполнен.');\n      resetCaptcha();\n      await hydrate({ force: true });\n      router.refresh();"
    )

    path.write_text(text, encoding="utf-8")
    print(f"OK: {path}")

print("Готово")
