from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SCORES = DATA / "scores"


def load_json(path: Path, default: Any):
    try:
        if not path.exists():
            return default
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, value: Any):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def score_file(name: str) -> Path:
    return SCORES / name


def get_guild_scores(name: str, guild_id: int) -> dict:
    path = score_file(name)
    all_scores = load_json(path, {})
    guild_scores = all_scores.setdefault(str(guild_id), {})
    return all_scores, guild_scores


def save_guild_scores(name: str, all_scores: dict):
    save_json(score_file(name), all_scores)


def ranking_text(scores: dict, points_key: str = "points") -> str:
    rows = sorted(
        scores.items(),
        key=lambda item: item[1].get(points_key, 0) if isinstance(item[1], dict) else item[1],
        reverse=True,
    )
    if not rows:
        return "Noch keine Punkte vorhanden."

    result = []
    for index, (user_id, data) in enumerate(rows, 1):
        value = data.get(points_key, 0) if isinstance(data, dict) else data
        name = data.get("name", user_id) if isinstance(data, dict) else user_id
        place = ["🥇", "🥈", "🥉"][index - 1] if index <= 3 else f"{index}."
        result.append(f"{place} **{name}** — **{value} Punkte**")
    return "\n".join(result)
