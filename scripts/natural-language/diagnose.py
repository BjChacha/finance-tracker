"""Oracle-type category diagnostic, separate from end-to-end release metrics."""

from common import ARTIFACTS, write_json
from corpus import load_split
from runtime import OfflineCandidate


def main():
    reports = {}
    for precision in ("fp32", "int8"):
        model = OfflineCandidate(precision)
        rows = []
        for row in load_split("test"):
            if row["status"] != "single":
                continue
            candidates = model.rank_categories(row["text"], row["type"])
            rows.append(
                {
                    "id": row["id"],
                    "text": row["text"],
                    "expected": row["category"],
                    "predicted": candidates[0]["id"],
                    "correct": candidates[0]["id"] == row["category"],
                    "candidates": candidates[:3],
                }
            )
        reports[precision] = {
            "correct": sum(row["correct"] for row in rows),
            "total": len(rows),
            "failures": [row for row in rows if not row["correct"]],
        }
    write_json(
        ARTIFACTS / "category-diagnostic.json",
        {
            "scope": "Supplied gold transaction type. Not end-to-end accuracy and not a release gate pass.",
            "results": reports,
        },
    )
    print(
        {
            key: {field: value[field] for field in ("correct", "total")}
            for key, value in reports.items()
        }
    )


if __name__ == "__main__":
    main()
