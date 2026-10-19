"""Add assistant-reviewed auxiliary labels; never feed them into inference."""

import csv

from bridge import HERE, evaluation


def main():
    rows = evaluation.load_rows(HERE.parent / "data/dev.tsv")
    accounts = {
        3: "wechat",
        8: "alipay",
        14: "wechat",
        23: "alipay",
        27: "bank",
        33: "alipay",
        42: "wechat",
        45: "alipay",
        53: "bank",
        59: "bank",
        61: "wechat",
        65: "alipay",
    }
    days = {
        5: "yesterday",
        10: "before_yesterday",
        14: "yesterday",
        17: "yesterday",
        24: "yesterday",
        28: "yesterday",
        33: "yesterday",
        38: "yesterday",
        47: "yesterday",
        54: "yesterday",
        60: "yesterday",
        62: "yesterday",
        68: "yesterday",
        73: "yesterday",
        77: "yesterday",
    }
    for index, row in enumerate(rows, 1):
        row["account"] = accounts.get(index, "")
        row["to_account"] = ""
        row["day"] = days.get(index, "today") if row["status"] == "single" else ""
        if 71 <= index <= 75:
            row["account"], row["to_account"] = "wechat", "bank"
        if 76 <= index <= 80:
            row["account"], row["to_account"] = "bank", "cash"
    with (HERE / "dev-annotated.tsv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]), delimiter="\t")
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
