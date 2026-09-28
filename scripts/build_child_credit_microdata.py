#!/usr/bin/env python3
"""Build the small age-aware CPS tax-unit snapshot used for reform child credits."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import tempfile
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASELINE_PATH = ROOT / "src" / "tax" / "data" / "baseline_2025.json"
DEFAULT_OUTPUT = ROOT / "src" / "tax" / "data" / "child_credit_microdata_2025.json"
SOURCE_URL = "https://www2.census.gov/programs-surveys/cps/datasets/2025/march/asecpub25csv.zip"
EXPECTED_SOURCE_SHA256 = "318845a2b5e0034eb2973898de1738f4df0025727de38499e7669cb9c0deef0b"
PERSON_MEMBER = "pppub25.csv"


def as_int(value: str) -> int:
    return 0 if value == "" else int(float(value))


def source_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_source(path: Path) -> None:
    request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "tax-reform-simulator/2.0"})
    with urllib.request.urlopen(request, timeout=120) as response, path.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)


def read_units(archive_path: Path) -> list[dict]:
    units: dict[int, dict] = {}
    required = ["TAX_ID", "A_LINENO", "A_AGE", "DEP_STAT", "WSAL_VAL", "MARSUPWT"]
    with zipfile.ZipFile(archive_path) as archive, archive.open(PERSON_MEMBER) as raw:
        reader = csv.reader(io.TextIOWrapper(raw, encoding="utf-8", newline=""))
        header = next(reader)
        index = {name: header.index(name) for name in required}
        for row in reader:
            tax_id = as_int(row[index["TAX_ID"]])
            age = as_int(row[index["A_AGE"]])
            dependent_status = as_int(row[index["DEP_STAT"]])
            line_number = as_int(row[index["A_LINENO"]])
            head_rank = (1 if dependent_status > 0 else 0, line_number)
            unit = units.setdefault(tax_id, {
                "rawCashWage": 0,
                "children": 0,
                "under6": 0,
                "headRank": (2, 999),
                "headWeight": 0.0,
            })
            unit["rawCashWage"] += max(0, as_int(row[index["WSAL_VAL"]]))
            unit["children"] += int(age < 18)
            unit["under6"] += int(age < 6)
            if head_rank < unit["headRank"]:
                unit["headRank"] = head_rank
                unit["headWeight"] = as_int(row[index["MARSUPWT"]]) / 100

    result = []
    for unit in units.values():
        if unit["headWeight"] <= 0:
            raise RuntimeError("CPS tax unit has no usable reference-person weight")
        unit.pop("headRank")
        result.append(unit)
    return result


def aggregate(units: list[dict]) -> list[list[float]]:
    cells: dict[tuple[int, int, int], float] = defaultdict(float)
    for unit in units:
        key = (unit["rawCashWage"], unit["children"], unit["under6"])
        cells[key] += unit["headWeight"]
    return [
        [cash_wage, children, under6, round(weight, 8)]
        for (cash_wage, children, under6), weight in sorted(cells.items())
    ]


def build(archive_path: Path, baseline: dict) -> dict:
    digest = source_sha256(archive_path)
    if digest != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("Census ASEC archive digest changed; review the upstream revision first")

    units = read_units(archive_path)
    weighted_children = sum(row["headWeight"] * row["children"] for row in units)
    weighted_under6 = sum(row["headWeight"] * row["under6"] for row in units)
    if weighted_children <= 0:
        raise RuntimeError("ASEC child population control must be positive")
    census_children = baseline["populationsMillions"]["children"] * 1e6
    child_scale = census_children / weighted_children
    under6_millions = weighted_under6 * child_scale / 1e6

    return {
        "schemaVersion": 1,
        "snapshot": "cps-asec-2025-child-credit-v1",
        "source": {
            "label": "2025 Current Population Survey Annual Social and Economic Supplement",
            "url": SOURCE_URL,
            "archiveSha256": digest,
            "personFile": PERSON_MEMBER,
            "incomeYear": 2024,
            "projectionYear": 2025,
        },
        "method": {
            "taxUnits": "Census TAX_ID with reference-person MARSUPWT",
            "children": "All persons under 18; under-6 supplement uses A_AGE < 6",
            "earnings": "Tax-unit WSAL_VAL; reform scorer applies the same BEA gross-compensation scale as the main CPS snapshot",
            "populationCalibration": "All child-weighted cells scaled to the Census Vintage 2025 under-18 population control",
        },
        "calibration": {
            "childPopulationScaleToCensus2025": child_scale,
        },
        "fallbackUnder6PopulationMillions": under6_millions,
        "distributionColumns": [
            "asecCashWageDollars", "childrenUnder18", "childrenUnder6", "taxUnitWeight"
        ],
        "distribution": aggregate(units),
    }


def verify(snapshot: dict, baseline: dict) -> None:
    distribution = snapshot["distribution"]
    if not distribution:
        raise RuntimeError("Child-credit distribution is empty")
    scale = snapshot["calibration"]["childPopulationScaleToCensus2025"]
    children = sum(row[1] * row[3] * scale for row in distribution) / 1e6
    under6 = sum(row[2] * row[3] * scale for row in distribution) / 1e6
    target = baseline["populationsMillions"]["children"]
    if abs(children - target) > 0.001:
        raise RuntimeError("Child-credit snapshot does not reconcile to the Census child population")
    if not 0 < under6 < children:
        raise RuntimeError("Under-6 population is outside its logical bounds")
    print(f"Child tax units: {len(distribution):,} aggregate cells")
    print(f"Children under 18: {children:.3f}M")
    print(f"Children under 6: {under6:.3f}M")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-zip", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))

    if args.verify_only:
        verify(json.loads(args.output.read_text(encoding="utf-8")), baseline)
        return

    if args.input_zip:
        snapshot = build(args.input_zip, baseline)
    else:
        with tempfile.TemporaryDirectory(prefix="tax-reform-child-credit-") as directory:
            archive_path = Path(directory) / "asecpub25csv.zip"
            download_source(archive_path)
            snapshot = build(archive_path, baseline)
    verify(snapshot, baseline)
    args.output.write_text(json.dumps(snapshot, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
