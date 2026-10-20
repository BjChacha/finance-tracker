"""Conservative integer-only conversion of a model-selected CNY span."""

import re
import unicodedata

DIGITS = dict(
    zip("\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d", range(10), strict=True)
)
DIGITS.update({"\u3007": 0, "\u4e24": 2})
SMALL_UNITS = {"\u5341": 10, "\u767e": 100, "\u5343": 1000}
MAX_CENTS = 2**53 - 1


def integer(text):
    if re.fullmatch(r"[0-9]+", text):
        return int(text)
    if not text:
        return None
    if all(char in DIGITS for char in text):
        return int("".join(str(DIGITS[char]) for char in text))
    total, current, previous_unit = 0, None, 10000
    for char in text:
        if char in DIGITS:
            if current not in (None, 0):
                return None
            current = DIGITS[char]
        elif char in SMALL_UNITS:
            unit = SMALL_UNITS[char]
            if unit >= previous_unit or (current is None and unit != 10):
                return None
            total += (1 if current is None else current) * unit
            current, previous_unit = None, unit
        else:
            return None
    if (
        current is not None
        and previous_unit >= 100
        and text[-2:-1] not in ("\u96f6", "\u3007")
    ):
        return None
    return total + (current or 0)


def whole(text):
    if "\u4e07" in text:
        parts = text.split("\u4e07")
        if len(parts) != 2:
            return None
        high, low = integer(parts[0]), integer(parts[1]) if parts[1] else 0
        if (
            parts[1]
            and low is not None
            and low < 1000
            and not parts[1].startswith(("\u96f6", "\u3007"))
        ):
            return None
        return (
            None if high is None or low is None or low >= 10000 else high * 10000 + low
        )
    return integer(text)


def parse_money(span):
    text = re.sub(r"\s+", "", unicodedata.normalize("NFKC", span))
    text = re.sub(r"^[\u00a5\uffe5]", "", text)
    text = re.sub(r"[\u6574\u94b1]$", "", text)
    # Commas are accepted only in standard thousands groups.
    if "," in text:
        if not re.fullmatch(
            r"[0-9]{1,3}(,[0-9]{3})+(\.[0-9]{1,2})?[\u5143\u5757]?", text
        ):
            return None
        text = text.replace(",", "")
    match = re.fullmatch(r"(.+?)[\u5143\u5757](.*)", text)
    base, fraction = (match.group(1), match.group(2)) if match else (text, "")
    if not match and re.search(r"[\u89d2\u6bdb\u5206]", text):
        base, fraction = "0", text
    decimal = re.fullmatch(r"(.+?)[.\u70b9](.+)", base)
    if decimal:
        units = whole(decimal.group(1))
        tail = decimal.group(2)
        digits = "".join(str(DIGITS.get(c, c)) for c in tail)
        if units is None or not re.fullmatch(r"[0-9]{1,2}", digits) or fraction:
            return None
        cents = units * 100 + int(digits.ljust(2, "0"))
    else:
        units = whole(base)
        if units is None:
            return None
        cents = units * 100
        if fraction:
            short = integer(fraction)
            if short is not None and 0 <= short <= 9:
                cents += short * 10
            else:
                match = re.fullmatch(
                    r"(?:(.+?)[\u89d2\u6bdb])?(?:(.+?)\u5206|([0-9\u96f6\u3007\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d]))?",
                    fraction,
                )
                if match is None or not any(match.groups()):
                    return None
                tenths = integer(match.group(1)) if match.group(1) else 0
                # A bare digit after jiao/mao is fen in colloquial speech.
                hundredths_text = match.group(2) or match.group(3)
                hundredths = integer(hundredths_text) if hundredths_text else 0
                if (
                    tenths is None
                    or hundredths is None
                    or not (0 <= tenths <= 9 and 0 <= hundredths <= 9)
                ):
                    return None
                cents += tenths * 10 + hundredths
    return cents if 0 < cents <= MAX_CENTS else None
