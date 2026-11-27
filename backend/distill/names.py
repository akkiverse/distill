"""Instrument kinds and tidy names for the Watchlist (US-10, added CR-0006).

The gateway sets `instruments.category` from Market Gateway E1 on (market data contract, CR-0002). Rows written before it,
and gateways that don't have the column yet, get the category worked out here with the same rules (AC-10.6).
Names come in Zerodha's capitals ("TATA CONSULTANCY SERV LT"); they are shown tidied (AC-10.10).
"""

from __future__ import annotations

import re

STOCK, ETF = "stock", "etf"
GOLD_SPOT, GOLD_INDIA, GOLD_ETF, GOLD_BOND, GOLD_MF = "gold_spot", "gold_india", "gold_etf", "gold_bond", "gold_mf"
GOLD = (GOLD_INDIA, GOLD_SPOT, GOLD_ETF, GOLD_BOND, GOLD_MF)  # the order the Add sheet lists them in
FX = "fx"  # a currency rate, e.g. FX:USDINR (added CR-0012, Market Gateway E4)
CATEGORIES = (STOCK, ETF, *GOLD, FX)

NOT_GOLD = re.compile(r"SILVER|GOLDMAN", re.I)
SGB_NAME = re.compile(r"SOVEREIGN\s+GOLD|GOLD\s*BOND|\bSGB", re.I)


def is_gold_bond(symbol: str, name: str) -> bool:
    s = (symbol or "").upper()
    return s.endswith("-GB") or s.startswith("SGB") or bool(SGB_NAME.search(name or ""))


def is_gold_name(symbol: str, name: str) -> bool:
    text = f"{symbol} {name}"
    return "GOLD" in text.upper() and not NOT_GOLD.search(text)


def category_of(key: str, symbol: str, name: str, type_: str, given: str | None = None) -> str:
    """AC-10.6: the gateway's category when set, otherwise worked out from the key, symbol and name."""
    if given and given in CATEGORIES:
        return given
    prefix = key.split(":", 1)[0].upper()
    t = (type_ or "").lower()
    if prefix == "FX" or t == FX:
        return FX  # AC-14.6
    if key.upper() == "GOLD:XAU_USD" or (prefix in ("GOLD", "SPOT") and is_gold_name(symbol, name or "XAU gold")):
        return GOLD_SPOT
    if prefix == "MCX":
        return GOLD_INDIA if is_gold_name(symbol, name) else STOCK
    if prefix == "MF":
        return GOLD_MF
    if is_gold_bond(symbol, name):
        return GOLD_BOND
    if t == ETF:
        return GOLD_ETF if is_gold_name(symbol, name) else ETF
    return STOCK


def group_of(category: str, key: str) -> str:
    """AC-10.2: Gold, Indian shares or US shares; Currency for rates (AC-14.6, added CR-0012)."""
    if category in GOLD:
        return "gold"
    if category == FX:
        return "currency"
    return "us" if key.split(":", 1)[0].upper() == "US" else "india"


def market_of(key: str, category: str = "") -> str:
    """Which market's hours a key follows (the calendar's `market`), or AMFI for gold funds (a NAV once a day)."""
    prefix = key.split(":", 1)[0].upper()
    if prefix in ("NSE", "BSE"):
        return "NSE"
    if prefix == "US":
        return "US"
    if prefix == "MCX":
        return "MCX"
    if prefix == "MF" or category == GOLD_MF:
        return "AMFI"
    if prefix == "FX" or category == FX:
        return "FX"  # a daily reference rate: no trading hours (CR-0012)
    return "GOLD"


# ---------- names ----------
# Common items by symbol: (display name, short name for the strip). AC-10.10.
SHORT_NAMES: dict[str, tuple[str, str]] = {
    "NSE:TCS": ("Tata Consultancy Services", "TCS"),
    "NSE:INFY": ("Infosys", "Infosys"),
    "NSE:RELIANCE": ("Reliance Industries", "Reliance"),
    "NSE:HDFCBANK": ("HDFC Bank", "HDFC Bank"),
    "NSE:ICICIBANK": ("ICICI Bank", "ICICI Bank"),
    "NSE:SBIN": ("State Bank of India", "SBI"),
    "NSE:ITC": ("ITC", "ITC"),
    "NSE:WIPRO": ("Wipro", "Wipro"),
    "NSE:HCLTECH": ("HCL Technologies", "HCL Tech"),
    "NSE:TECHM": ("Tech Mahindra", "Tech M"),
    "NSE:BHARTIARTL": ("Bharti Airtel", "Airtel"),
    "NSE:LT": ("Larsen & Toubro", "L&T"),
    "NSE:KOTAKBANK": ("Kotak Mahindra Bank", "Kotak Bank"),
    "NSE:AXISBANK": ("Axis Bank", "Axis Bank"),
    "NSE:MARUTI": ("Maruti Suzuki India", "Maruti"),
    "NSE:TATAMOTORS": ("Tata Motors", "Tata Motors"),
    "NSE:TATASTEEL": ("Tata Steel", "Tata Steel"),
    "NSE:HINDUNILVR": ("Hindustan Unilever", "HUL"),
    "NSE:ASIANPAINT": ("Asian Paints", "Asian Paints"),
    "NSE:BAJFINANCE": ("Bajaj Finance", "Bajaj Fin"),
    "NSE:SUNPHARMA": ("Sun Pharmaceutical Industries", "Sun Pharma"),
    "NSE:LTIM": ("LTIMindtree", "LTIMindtree"),
    "NSE:NIFTYBEES": ("Nippon India ETF Nifty BeES", "Nifty BeES"),
    "NSE:GOLDBEES": ("Nippon India ETF Gold BeES", "Gold BeES"),
    "NSE:HDFCGOLD": ("HDFC Gold ETF", "HDFC Gold"),
    "NSE:GOLDIETF": ("ICICI Prudential Gold ETF", "ICICI Gold"),
    "NSE:AXISGOLD": ("Axis Gold ETF", "Axis Gold"),
    "NSE:SETFGOLD": ("SBI Gold ETF", "SBI Gold"),
    "NSE:KOTAKGOLD": ("Kotak Gold ETF", "Kotak Gold"),
    "MCX:GOLDM": ("Gold rate, India", "Gold India"),
    "GOLD:XAU_USD": ("Gold spot", "Gold spot"),
    "FX:USDINR": ("US dollar in rupees", "USD/INR"),
}
# Kept in capitals however a name is written (AC-10.10).
UPPER = {
    "ETF", "ETFS", "NSE", "BSE", "SGB", "MF", "FOF", "NAV", "MCX", "US", "USA", "USD", "INR", "IT", "AMC", "HDFC", "ICICI", "SBI",
    "LIC", "ITC", "UTI", "IDFC", "IDBI", "DSP", "HSBC", "BNP", "IIFL", "HCL", "TVS", "MRF", "ACC", "NTPC", "ONGC", "BPCL", "HPCL",
    "IOC", "GAIL", "BHEL", "SAIL", "NMDC", "IRCTC", "IRFC", "PSU", "NBFC", "REIT", "II", "III", "IV", "XAU", "UK", "AI", "TV", "PNB",
    "BEML", "CDSL", "NSDL", "MSCI", "S&P", "L&T", "M&M", "TCS",
}  # fmt: skip
SMALL = {"of", "and", "the", "for", "in", "on", "a", "an", "to"}
EXPAND = {"SERV": "Services", "SERVS": "Services", "INDS": "Industries", "CORPN": "Corporation", "INTL": "International"}
TRAILING = {"LT", "LTD", "LTD.", "LIMITED", "INC", "INC."}
SPECIAL = {"BEES": "BeES"}


def _word(w: str, first: bool) -> str:
    up = w.upper()
    if up in SPECIAL:
        return SPECIAL[up]
    if up in UPPER or any(ch.isdigit() for ch in w):
        return up
    if up in EXPAND:
        return EXPAND[up]
    if not first and up.lower() in SMALL:
        return up.lower()
    if "-" in w:
        return "-".join(_word(p, first and i == 0) for i, p in enumerate(w.split("-")))
    return up[:1] + up[1:].lower()


def title_case(name: str) -> str:
    """AC-10.10: "NIPPON INDIA ETF GOLD BEES" -> "Nippon India ETF Gold BeES"; trailing LT/LTD/LIMITED dropped."""
    words = (name or "").split()
    while len(words) > 1 and words[-1].upper() in TRAILING:
        words.pop()
    return " ".join(_word(w, i == 0) for i, w in enumerate(words))


def display_name(key: str, name: str) -> str:
    """AC-10.10: the short-name list first, then title case for all-capital names; names already in mixed case stay."""
    if key in SHORT_NAMES:
        return SHORT_NAMES[key][0]
    n = (name or "").strip()
    letters = [c for c in n if c.isalpha()]
    if letters and all(c.isupper() for c in letters):
        return title_case(n)
    return n or key.split(":", 1)[-1]


FUND_NOISE = re.compile(r"\s*[-–]\s*(direct|regular)\b.*$|\b(direct plan|regular plan|growth option|growth|idcw.*)$", re.I)


def short_name(key: str, symbol: str, name: str, category: str) -> str:
    """AC-10.1: a few words for the strip: "TCS", "Gold India", "Gold BeES", "SGBJUN31I", "HDFC Gold FoF"."""
    if key in SHORT_NAMES:
        return SHORT_NAMES[key][1]
    sym = (symbol or key.split(":", 1)[-1]).upper()
    if category == GOLD_BOND:
        return sym.removesuffix("-GB")
    if category == GOLD_MF:
        n = FUND_NOISE.sub("", display_name(key, name)).strip(" -")
        n = re.sub(r"\bfund of funds?\b", "FoF", n, flags=re.I)
        n = re.sub(r"\b(ETF\s+)?FoF\b", "FoF", n)
        n = re.sub(r"\s+(fund|scheme)$", "", n, flags=re.I)
        return n if len(n) <= 18 else n[:17].rstrip() + "…"
    if category == GOLD_SPOT:
        return "Gold spot"
    if category == GOLD_INDIA:
        return "Gold India"
    return sym
