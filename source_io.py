"""Read and write the canonical JSON source files used by the data builders."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / "source"


def load_banks(path: Path | None = None) -> list[dict]:
    target = path or SOURCE_DIR / "computer.json"
    if not target.exists():
        return []
    data = json.loads(target.read_text(encoding="utf-8-sig"))
    if isinstance(data, dict) and isinstance(data.get("banks"), list):
        return data["banks"]
    if isinstance(data, list):
        return data
    raise ValueError(f"Expected a banks array in {target}")


def save_banks(banks: list[dict], path: Path | None = None) -> None:
    target = path or SOURCE_DIR / "computer.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(banks, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def replace_bank(banks: list[dict], bank: dict) -> list[dict]:
    return [item for item in banks if item.get("key") != bank.get("key")] + [bank]
