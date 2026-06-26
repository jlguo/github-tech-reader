import json
from pathlib import Path

from app.core.tag_policy import normalize_tags
from app.models.category import SYSTEM_CATEGORIES

CONTRACT = json.loads(
    (Path(__file__).resolve().parents[2] / "tag-contract.json").read_text(encoding="utf-8")
)


def test_normalize_tags_matches_contract():
    for case in CONTRACT["normalize_cases"]:
        assert normalize_tags(case["input"]) == case["expected"], case["input"]


def test_system_categories_match_contract():
    actual = {c["key"]: c for c in SYSTEM_CATEGORIES}
    for expected in CONTRACT["system_categories"]:
        c = actual[expected["key"]]
        assert c["label"] == expected["label"]
        assert c["labels"] == expected["labels"]
        assert c["sort_order"] == expected["sort_order"]
    assert len(SYSTEM_CATEGORIES) == len(CONTRACT["system_categories"])
