"""Sections offered and the default news feeds for each (founder's list, approved 25 Nov 2026).

Each section fetches only its own feeds. Feeds found dead during the build are listed in DROPPED
with the reason, so they can be put back later. Paywalled feeds, city and language feeds are off.
"""

from __future__ import annotations

from urllib.parse import quote_plus

from .models import Section

SECTIONS: list[Section] = [
    Section(id="world", name="World"),
    Section(id="india", name="India"),
    Section(id="business", name="Business"),
    Section(id="finance", name="Finance"),
    Section(id="technology", name="Technology"),
    Section(id="science", name="Science"),
    Section(id="health", name="Health"),
    Section(id="sports", name="Sports"),
    Section(id="entertainment", name="Entertainment"),
    Section(id="politics", name="Politics"),
    Section(id="environment", name="Environment"),
    Section(id="education", name="Education"),
]
SECTION_IDS = {s.id for s in SECTIONS}
SECTION_NAMES = {s.id: s.name for s in SECTIONS}

_BUSINESS_FINANCE = [
    ("Mint markets", "https://www.livemint.com/rss/markets"),
    ("Mint money", "https://www.livemint.com/rss/money"),
    ("Mint companies", "https://www.livemint.com/rss/companies"),
    ("Mint industry", "https://www.livemint.com/rss/industry"),
    ("The Hindu business", "https://www.thehindu.com/business/feeder/default.rss"),
    ("The Hindu economy", "https://www.thehindu.com/business/Economy/feeder/default.rss"),
    ("The Hindu markets", "https://www.thehindu.com/business/markets/feeder/default.rss"),
    ("BusinessLine", "https://www.thehindubusinessline.com/feeder/default.rss"),
    ("TOI business", "https://timesofindia.indiatimes.com/rssfeeds/1898055.cms"),
    ("ET top", "https://economictimes.indiatimes.com/rssfeedstopstories.cms"),
    ("BBC Business", "https://feeds.bbci.co.uk/news/business/rss.xml"),
    ("CNBC", "https://www.cnbc.com/id/100003114/device/rss/rss.html"),
    ("Yahoo Finance", "https://finance.yahoo.com/news/rssindex"),
    ("Investing.com", "https://www.investing.com/rss/news.rss"),
]

# (source name, feed URL) per section
RSS_FEEDS: dict[str, list[tuple[str, str]]] = {
    "india": [
        ("The Hindu", "https://www.thehindu.com/feeder/default.rss"),
        ("The Hindu national", "https://www.thehindu.com/news/national/feeder/default.rss"),
        ("Livemint", "https://www.livemint.com/rss/news"),
        ("TOI top", "https://timesofindia.indiatimes.com/rssfeedstopstories.cms"),
        ("TOI India", "https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms"),
        ("HT India", "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml"),
        ("Business Standard", "https://www.business-standard.com/rss/latest.rss"),
        ("Indian Express", "https://indianexpress.com/feed/"),
        ("India Today", "https://www.indiatoday.in/rss/home"),
    ],
    "world": [
        ("BBC World", "https://feeds.bbci.co.uk/news/world/rss.xml"),
        ("Guardian World", "https://www.theguardian.com/world/rss"),
        ("Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"),
        ("DW", "https://rss.dw.com/rdf/rss-en-top"),
        ("France 24", "https://www.france24.com/en/rss"),
        ("NPR World", "https://feeds.npr.org/1004/rss.xml"),
        ("The Hindu international", "https://www.thehindu.com/news/international/feeder/default.rss"),
        ("TOI world", "https://timesofindia.indiatimes.com/rssfeeds/296589292.cms"),
    ],
    "business": _BUSINESS_FINANCE,
    "finance": _BUSINESS_FINANCE,
    "technology": [
        ("Mint AI", "https://www.livemint.com/rss/AI"),
        ("Mint tech", "https://www.livemint.com/rss/technology"),
        ("The Hindu tech", "https://www.thehindu.com/sci-tech/technology/feeder/default.rss"),
        ("The Hindu gadgets", "https://www.thehindu.com/sci-tech/technology/gadgets/feeder/default.rss"),
        ("BBC Tech", "https://feeds.bbci.co.uk/news/technology/rss.xml"),
        ("TechCrunch", "https://techcrunch.com/feed/"),
        ("TechCrunch AI", "https://techcrunch.com/category/artificial-intelligence/feed/"),
        ("The Verge", "https://www.theverge.com/rss/index.xml"),
        ("Ars Technica", "https://feeds.arstechnica.com/arstechnica/index"),
        ("Wired", "https://www.wired.com/feed/rss"),
        ("MIT Tech Review", "https://www.technologyreview.com/feed/"),
    ],
    "science": [
        ("Mint science", "https://www.livemint.com/rss/science"),
        ("The Hindu science", "https://www.thehindu.com/sci-tech/science/feeder/default.rss"),
        ("TOI science", "https://timesofindia.indiatimes.com/rssfeeds/-2128672765.cms"),
        ("BBC Science", "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml"),
        ("Phys.org", "https://phys.org/rss-feed/"),
        ("Quanta", "https://www.quantamagazine.org/feed/"),
    ],
    "health": [("The Hindu health", "https://www.thehindu.com/sci-tech/health/feeder/default.rss")],
    "environment": [
        ("The Hindu environment", "https://www.thehindu.com/sci-tech/energy-and-environment/feeder/default.rss"),
    ],
    "sports": [
        ("The Hindu cricket", "https://www.thehindu.com/sport/cricket/feeder/default.rss"),
        ("The Hindu sport", "https://www.thehindu.com/sport/feeder/default.rss"),
        ("Sportstar", "https://sportstar.thehindu.com/feeder/default.rss"),
        ("TOI cricket", "https://timesofindia.indiatimes.com/rssfeeds/54829575.cms"),
        ("TOI sports", "https://timesofindia.indiatimes.com/rssfeeds/4719148.cms"),
        ("Mint sports", "https://www.livemint.com/rss/sports"),
        ("ESPNcricinfo", "https://www.espncricinfo.com/rss/content/story/feeds/6.xml"),
        ("Guardian Sport", "https://www.theguardian.com/uk/sport/rss"),
        ("Sky Sports", "https://www.skysports.com/rss/12040"),
        ("ESPN football", "https://www.espn.com/espn/rss/soccer/news"),
        ("France 24 sport", "https://www.france24.com/en/sport/rss"),
    ],
    "politics": [("Mint politics", "https://www.livemint.com/rss/politics")],
    "education": [
        ("Mint education", "https://www.livemint.com/rss/education"),
        ("The Hindu education", "https://www.thehindu.com/education/feeder/default.rss"),
    ],
    "entertainment": [],  # Google News only
}

# Feeds from the founder's list that did not answer with a usable feed during the build check.
DROPPED: dict[str, str] = {
    # Checked from the Vercel preview on 25 Nov 2026 (/api/feeds/check): 74 of 76 feeds answered.
    "https://www.business-standard.com/rss/latest.rss": "answered with an HTTP error from Vercel (25 Nov 2026)",
    "https://finance.yahoo.com/news/rssindex": "answered with an HTTP error from Vercel (25 Nov 2026)",
}

_GN = "hl=en-IN&gl=IN&ceid=IN:en"
_GN_TOPICS = {
    "world": "WORLD",
    "india": "NATION",
    "business": "BUSINESS",
    "technology": "TECHNOLOGY",
    "science": "SCIENCE",
    "health": "HEALTH",
    "sports": "SPORTS",
    "entertainment": "ENTERTAINMENT",
}
_GN_SEARCH = {
    "finance": "finance OR markets OR economy",
    "politics": "politics India",
    "environment": "environment OR climate",
    "education": "education India",
}


def google_news_section_url(section: str) -> str:
    """Google News topic feed for a section (India edition); a search feed where there is no topic."""
    if section in _GN_TOPICS:
        return f"https://news.google.com/rss/headlines/section/topic/{_GN_TOPICS[section]}?{_GN}"
    return google_news_search_url(_GN_SEARCH.get(section, SECTION_NAMES.get(section, section)))


def google_news_search_url(query: str) -> str:
    """Google News search over the last 24 hours (India edition)."""
    return f"https://news.google.com/rss/search?q={quote_plus(query + ' when:1d')}&{_GN}"


def rss_feeds_for(section: str) -> list[tuple[str, str]]:
    return [(name, url) for name, url in RSS_FEEDS.get(section, []) if url not in DROPPED]
