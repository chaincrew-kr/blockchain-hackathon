#!/usr/bin/env python3
"""Build the self-contained E2E HTML report.

The checked-in screenshots remain useful for recapture, but the generated report
does not depend on them at runtime: every PNG is embedded as a data URL.
"""

from __future__ import annotations

import base64
from html.parser import HTMLParser
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
DOCS = HERE.parent
TEMPLATE = HERE / "report.template.html"
OUTPUT = HERE / "ChainCrew_Hackathon_Submission.html"

IMAGES = {
    "IMG_COVER": REPO / "assets/readme/repository-cover.png",
    "IMG_PURCHASE": DOCS / "manual/shots/01-purchase.png",
    "IMG_CONTRACT_UPLOAD": DOCS / "manual/shots/03-contract-upload.png",
    "IMG_CONTRACT_RESULT": DOCS / "manual/shots/04-contract-result.png",
    "IMG_DASHBOARD": DOCS / "manual/shots/05-dashboard-overview.png",
    "IMG_EVIDENCE": DOCS / "manual/shots/06-dashboard-evidence.png",
    "IMG_KOBIS": DOCS / "manual/shots/07-dashboard-kobis.png",
    "IMG_KIFV_ARTICLE": HERE / "evidence/kifv-unpaid-settlement.png",
    "IMG_YONHAP_ARTICLE": HERE / "evidence/yonhap-unpaid-settlement.png",
}


def data_url(path: Path) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


class ReportParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.internal_links: list[str] = []
        self.image_sources: list[str] = []
        self.local_links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"] or "")
        if tag == "img":
            self.image_sources.append(values.get("src") or "")
        if tag == "a":
            href = values.get("href") or ""
            if href.startswith("#"):
                self.internal_links.append(href[1:])
            if href.startswith("file:"):
                self.local_links.append(href)


def main() -> None:
    html = TEMPLATE.read_text(encoding="utf-8")
    for marker, path in IMAGES.items():
        html = html.replace(f"{{{{{marker}}}}}", data_url(path))

    unresolved = [marker for marker in IMAGES if f"{{{{{marker}}}}}" in html]
    if unresolved:
        raise RuntimeError(f"unresolved image placeholders: {unresolved}")
    parser = ReportParser()
    parser.feed(html)
    if parser.local_links:
        raise RuntimeError("shareable report must not contain local file links")
    if len(parser.image_sources) != len(IMAGES):
        raise RuntimeError(
            f"expected {len(IMAGES)} images, found {len(parser.image_sources)}"
        )
    if not all(source.startswith("data:image/png;base64,") for source in parser.image_sources):
        raise RuntimeError("every report image must be an embedded PNG data URL")
    missing_targets = sorted(set(parser.internal_links) - parser.ids)
    if missing_targets:
        raise RuntimeError(f"missing internal link targets: {missing_targets}")

    OUTPUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
