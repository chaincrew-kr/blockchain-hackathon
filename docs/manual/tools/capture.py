#!/usr/bin/env python3
"""ChainCrew 라이브 웹을 실제로 조작해 사용자 매뉴얼 캡처를 만든다.

필수 환경변수:
  MANUAL_BASIC_PASSWORD  Cloud Run 웹 Basic Auth 비밀번호

선택 환경변수:
  MANUAL_BASE_URL        기본값: 공개 Cloud Run 웹 URL
  MANUAL_BASIC_USER      기본값: chaincrew
  MANUAL_ALLOW_PAID_API  true일 때만 Gemini 계약서 추출 1회를 실행

안전 규칙:
- Phantom 개인키나 서비스 계정 키를 브라우저에 심지 않는다.
- settle_batch/reset 같은 온체인 변경 API는 호출하지 않는다.
- 표시 좌표는 브라우저의 getBoundingClientRect()로만 구한다.
- 요소를 못 찾으면 임의 좌표를 넣지 않고 경고를 남긴다.
"""

from __future__ import annotations

import base64
import io
import os
import sys
import time
from pathlib import Path
from typing import Iterable, Sequence

from PIL import Image, ImageDraw, ImageFont
from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


ROOT = Path(__file__).resolve().parents[3]
SHOTS = ROOT / "docs" / "manual" / "shots"
DEMO_PDF = ROOT / "apps" / "web" / "server" / "영화_상영계약서_데모_초안.pdf"
BASE_URL = os.environ.get(
    "MANUAL_BASE_URL",
    "https://chaincrew-web-612802760361.asia-northeast3.run.app",
).rstrip("/")
AUTH_USER = os.environ.get("MANUAL_BASIC_USER", "chaincrew")
AUTH_PASSWORD = os.environ.get("MANUAL_BASIC_PASSWORD", "")
ALLOW_PAID_API = os.environ.get("MANUAL_ALLOW_PAID_API", "").lower() == "true"
RED = "#e61e2d"


def browser() -> WebDriver:
    if not AUTH_PASSWORD:
        raise RuntimeError("MANUAL_BASIC_PASSWORD가 필요합니다")

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--window-size=1440,1000")
    options.add_argument("--force-device-scale-factor=1")
    options.add_argument("--hide-scrollbars")
    options.add_argument("--lang=ko-KR")
    options.add_argument("--disable-notifications")
    options.add_argument("--disable-search-engine-choice-screen")
    driver = webdriver.Chrome(options=options)

    token = base64.b64encode(f"{AUTH_USER}:{AUTH_PASSWORD}".encode()).decode()
    driver.execute_cdp_cmd("Network.enable", {})
    driver.execute_cdp_cmd(
        "Network.setExtraHTTPHeaders",
        {"headers": {"Authorization": f"Basic {token}"}},
    )
    return driver


def _by(selector: str) -> tuple[str, str]:
    if selector.startswith("xpath="):
        return By.XPATH, selector.removeprefix("xpath=")
    return By.CSS_SELECTOR, selector


def find(driver: WebDriver, selector: str, timeout: float = 10) -> WebElement:
    by, value = _by(selector)
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((by, value))
    )


def click(driver: WebDriver, selector: str, timeout: float = 10) -> None:
    by, value = _by(selector)
    element = WebDriverWait(driver, timeout).until(
        EC.element_to_be_clickable((by, value))
    )
    driver.execute_script("arguments[0].click()", element)


def click_text(driver: WebDriver, text: str, timeout: float = 10) -> None:
    click(
        driver,
        f"xpath=//*[self::button or self::a][contains(normalize-space(.), {text!r})]",
        timeout,
    )


def wait_text(driver: WebDriver, text: str, timeout: float = 10) -> None:
    WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located(
            (By.XPATH, f"//*[contains(normalize-space(.), {text!r})]")
        )
    )


def scroll_to(driver: WebDriver, selector: str, offset: int = -120) -> None:
    element = find(driver, selector)
    driver.execute_script(
        "window.scrollTo(0, arguments[0].getBoundingClientRect().top + "
        "window.scrollY + arguments[1]);",
        element,
        offset,
    )
    time.sleep(0.4)


def _elements(driver: WebDriver, selectors: str | Sequence[str]) -> list[WebElement]:
    values = [selectors] if isinstance(selectors, str) else selectors
    found: list[WebElement] = []
    for selector in values:
        by, value = _by(selector)
        found.extend(driver.find_elements(by, value))
    return [element for element in found if element.is_displayed()]


def _rect(
    driver: WebDriver, selectors: str | Sequence[str]
) -> tuple[int, int, int, int] | None:
    elements = _elements(driver, selectors)
    if not elements:
        return None
    rects = [
        driver.execute_script(
            "const r=arguments[0].getBoundingClientRect();"
            "return {x:r.x,y:r.y,w:r.width,h:r.height};",
            element,
        )
        for element in elements
    ]
    left = min(rect["x"] for rect in rects)
    top = min(rect["y"] for rect in rects)
    right = max(rect["x"] + rect["w"] for rect in rects)
    bottom = max(rect["y"] + rect["h"] for rect in rects)
    pad = 6
    return (
        max(0, round(left) - pad),
        max(0, round(top) - pad),
        round(right) + pad,
        round(bottom) + pad,
    )


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def shot(
    driver: WebDriver,
    name: str,
    marks: Iterable[tuple[str, str | Sequence[str]]],
) -> Path:
    coordinates: list[tuple[str, tuple[int, int, int, int]]] = []
    for label, selectors in marks:
        rect = _rect(driver, selectors)
        if rect is None:
            print(f"[warn] {name}: 표시 요소를 못 찾음: {selectors}", file=sys.stderr)
            continue
        coordinates.append((label, rect))

    image = Image.open(io.BytesIO(driver.get_screenshot_as_png())).convert("RGB")
    draw = ImageDraw.Draw(image)
    font = _font(22)
    for label, (left, top, right, bottom) in coordinates:
        draw.rounded_rectangle(
            (left, top, right, bottom), radius=6, outline=RED, width=5
        )
        badge_left = left
        badge_top = max(2, top - 32)
        badge_right = badge_left + 32
        badge_bottom = badge_top + 30
        draw.rounded_rectangle(
            (badge_left, badge_top, badge_right, badge_bottom),
            radius=7,
            fill=RED,
        )
        box = draw.textbbox((0, 0), label, font=font)
        text_width = box[2] - box[0]
        text_height = box[3] - box[1]
        draw.text(
            (
                badge_left + (32 - text_width) / 2,
                badge_top + (30 - text_height) / 2 - 2,
            ),
            label,
            fill="white",
            font=font,
        )

    SHOTS.mkdir(parents=True, exist_ok=True)
    path = SHOTS / f"{name}.png"
    image.save(path, optimize=True)
    print(f"[ok] {path.relative_to(ROOT)} ({len(coordinates)} marks)")
    return path


def wants(name: str, requested: set[str]) -> bool:
    return not requested or name in requested


def main() -> int:
    requested = set(sys.argv[1:])
    driver = browser()
    driver.set_page_load_timeout(60)
    try:
        driver.get(BASE_URL)
        wait_text(driver, "티켓 예매", 30)

        if wants("01-purchase", requested):
            shot(
                driver,
                "01-purchase",
                [
                    ("1", ".choices"),
                    ("2", ".qty"),
                    ("3", "xpath=//button[contains(., 'Phantom 연결')]"),
                    ("4", "xpath=//button[normalize-space()='결제하기']"),
                ],
            )

        click_text(driver, "Phantom 연결")
        wait_text(driver, "Phantom 지갑이 설치되어 있지 않습니다")
        if wants("02-wallet-required", requested):
            shot(
                driver,
                "02-wallet-required",
                [
                    ("1", "xpath=//button[contains(., 'Phantom 연결')]"),
                    ("2", ".error-text"),
                ],
            )

        click_text(driver, "백오피스")
        wait_text(driver, "계약 온보딩")
        file_input = find(driver, "input[type='file']")
        file_input.send_keys(str(DEMO_PDF))
        if wants("03-contract-upload", requested):
            shot(
                driver,
                "03-contract-upload",
                [
                    ("1", ".steps"),
                    ("2", "input[type='file']"),
                    ("3", "xpath=//button[contains(., 'Gemini로 추출')]"),
                ],
            )

        if ALLOW_PAID_API:
            click_text(driver, "Gemini로 추출")
            try:
                find(driver, ".table-scroll", 180)
                scroll_to(driver, ".table-scroll", -150)
                if wants("04-contract-result", requested):
                    shot(
                        driver,
                        "04-contract-result",
                        [
                            ("1", ".table-scroll"),
                            ("2", ".table-scroll + .chart-caption"),
                        ],
                    )
            except TimeoutException:
                print("[warn] Gemini 결과가 180초 안에 표시되지 않음", file=sys.stderr)
        else:
            print(
                "[skip] 04-contract-result: MANUAL_ALLOW_PAID_API=true가 아님",
                file=sys.stderr,
            )

        click_text(driver, "대시보드")
        wait_text(driver, "정산 현황")
        try:
            wait_text(driver, "어떻게 해야 했을까?", 30)
        except TimeoutException:
            print("[warn] KOBIS 설명이 30초 안에 표시되지 않음", file=sys.stderr)

        driver.execute_script("window.scrollTo(0, 0)")
        time.sleep(0.4)
        if wants("05-dashboard-overview", requested):
            shot(
                driver,
                "05-dashboard-overview",
                [
                    ("1", ".flow"),
                    ("2", ".stats"),
                    ("3", ".invariant"),
                ],
            )

        scroll_to(driver, ".two-col", -125)
        if wants("06-dashboard-evidence", requested):
            shot(
                driver,
                "06-dashboard-evidence",
                [
                    ("1", ".two-col > .card:nth-child(1)"),
                    ("2", ".two-col > .card:nth-child(2)"),
                ],
            )

        scroll_to(driver, ".chart-pair", -125)
        if wants("07-dashboard-kobis", requested):
            shot(
                driver,
                "07-dashboard-kobis",
                [
                    ("1", ".chart-pair > .card:nth-child(1)"),
                    ("2", ".chart-pair > .card:nth-child(2)"),
                ],
            )
    finally:
        driver.quit()

    expected = {
        "01-purchase",
        "02-wallet-required",
        "03-contract-upload",
        "05-dashboard-overview",
        "06-dashboard-evidence",
        "07-dashboard-kobis",
    }
    if ALLOW_PAID_API:
        expected.add("04-contract-result")
    missing = [name for name in sorted(expected) if not (SHOTS / f"{name}.png").exists()]
    if missing:
        print(f"[error] 생성되지 않은 컷: {', '.join(missing)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
