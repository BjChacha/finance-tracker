"""Evaluate the unique-amount semantic contract with explicit readiness waits."""

from backend import ARTIFACTS
from evaluate_prepared import main
from unique_amount import configure_unique_amount

if __name__ == "__main__":
    main(
        configure_client=configure_unique_amount,
        extra_sources=("evaluate_unique.py", "unique_amount.py", "unique_amount.txt"),
        variant="unique-amount",
        validation_freeze=ARTIFACTS / "unique-amount-freeze.json",
    )
