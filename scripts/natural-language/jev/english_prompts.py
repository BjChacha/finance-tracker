"""Create an English-instruction control without changing Chinese input or candidates."""

from support import HERE, read_json, write_json


def main():
    prompts = read_json(HERE / "prompts-v2.json")
    for name, instruction in {
        "status": "Determine whether the text describes one completed transaction with a clear amount. Reject multiple transactions, negation, future plans and conflicting amounts.",
        "type": "Classify the user's transaction as an expense, income or transfer between their own accounts. Paying another person is an expense, not an internal transfer.",
        "day": "Identify when the transaction happened: today, yesterday or two days ago. Default to today if no date is mentioned. Other dates require clarification.",
    }.items():
        prompts[name]["instruction"] = instruction
    prompts.update(
        {
            "amount_instruction": "Select the actual final amount paid, received or transferred. Ignore item counts, dates, balances, original prices and discounts.",
            "category_instruction": "Select the best available bookkeeping category for the transaction's purpose or income source. Prefer a specific matching subcategory.",
            "account_instruction": "Select the user's payment account for expenses, receiving account for income, or source account for internal transfers. Leave unspecified accounts unknown.",
            "destination_instruction": "Select the user's receiving account for an internal transfer. It must differ from the source account. Leave unspecified accounts unknown.",
        }
    )
    write_json(HERE / "prompts-v3.json", prompts)


if __name__ == "__main__":
    main()
