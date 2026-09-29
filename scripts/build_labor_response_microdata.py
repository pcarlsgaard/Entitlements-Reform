#!/usr/bin/env python3
"""Build the compressed CPS tax-unit snapshot used for dynamic labor scoring."""

from __future__ import annotations

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
OUTPUT = ROOT / "src" / "tax" / "data" / "labor_response_microdata_2025.json"
SOURCE_URL = "https://www2.census.gov/programs-surveys/cps/datasets/2025/march/asecpub25csv.zip"
EXPECTED_SOURCE_SHA256 = "318845a2b5e0034eb2973898de1738f4df0025727de38499e7669cb9c0deef0b"
PERSON_MEMBER = "pppub25.csv"

def as_int(value: str) -> int:
    return 0 if value == "" else int(float(value))

def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def download(path: Path) -> None:
    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent":"entitlements-reform-simulator/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, path.open("wb") as out:
        while chunk := r.read(1024 * 1024):
            out.write(chunk)

def read_units(path: Path) -> list[dict]:
    units: dict[int, dict] = {}
    required = ["TAX_ID","A_LINENO","A_AGE","DEP_STAT","WSAL_VAL","MARSUPWT","FILESTAT"]
    with zipfile.ZipFile(path) as archive, archive.open(PERSON_MEMBER) as raw:
        reader = csv.reader(io.TextIOWrapper(raw, encoding="utf-8", newline=""))
        header = next(reader)
        index = {name: header.index(name) for name in required}
        for row in reader:
            tax_id = as_int(row[index["TAX_ID"]])
            age = as_int(row[index["A_AGE"]])
            wage = max(0, as_int(row[index["WSAL_VAL"]]))
            dependent = as_int(row[index["DEP_STAT"]])
            line = as_int(row[index["A_LINENO"]])
            rank = (1 if dependent > 0 else 0, line)
            unit = units.setdefault(tax_id, {
                "totalWage": 0, "adultWages": [], "creditAdults": 0,
                "children": 0, "under6": 0, "headRank": (2,999),
                "weight": 0.0, "fileStat": 0,
            })
            unit["totalWage"] += wage
            if age >= 18:
                unit["creditAdults"] += 1
                unit["adultWages"].append(wage)
            if age < 18:
                unit["children"] += 1
                if age < 6: unit["under6"] += 1
            if rank < unit["headRank"]:
                unit["headRank"] = rank
                unit["weight"] = as_int(row[index["MARSUPWT"]]) / 100
                unit["fileStat"] = as_int(row[index["FILESTAT"]])
    result = []
    for unit in units.values():
        if unit["weight"] <= 0:
            raise RuntimeError("Tax unit missing reference-person weight")
        married = unit["fileStat"] in (1,2,3)
        adult_wages = sorted(unit["adultWages"], reverse=True)
        if married:
            primary = adult_wages[0] if adult_wages else 0
            secondary = max(0, unit["totalWage"] - primary)
        else:
            primary = unit["totalWage"]
            secondary = 0
        result.append({
            "primary": primary, "secondary": secondary,
            "scheduleAdults": 2 if married else 1,
            "creditAdults": unit["creditAdults"],
            "children": unit["children"], "under6": unit["under6"],
            "weight": unit["weight"],
        })
    return result

def aggregate(units: list[dict]) -> list[list[float]]:
    cells: dict[tuple[int,int,int,int,int,int], float] = defaultdict(float)
    for u in units:
        key=(u["primary"],u["secondary"],u["scheduleAdults"],u["creditAdults"],u["children"],u["under6"])
        cells[key] += u["weight"]
    return [[*key, round(weight,8)] for key,weight in sorted(cells.items())]

def main() -> None:
    with tempfile.TemporaryDirectory(prefix="labor-response-") as directory:
        path=Path(directory)/"asecpub25csv.zip"
        download(path)
        actual=digest(path)
        if actual != EXPECTED_SOURCE_SHA256:
            raise RuntimeError(f"CPS archive digest changed: {actual}")
        units=read_units(path)
    cells=aggregate(units)
    snapshot={
        "schemaVersion":1,
        "snapshot":"cps-asec-2025-labor-response-v1",
        "source":{"label":"2025 Current Population Survey Annual Social and Economic Supplement",
                  "url":SOURCE_URL,"archiveSha256":EXPECTED_SOURCE_SHA256,
                  "personFile":PERSON_MEMBER,"incomeYear":2024,"projectionYear":2025},
        "method":{
            "taxUnits":"Census TAX_ID; reference-person MARSUPWT; joint schedule from FILESTAT 1-3",
            "earnings":"Tax-unit WSAL_VAL. Married units retain the highest adult wage as the primary earner and assign remaining unit wages to the secondary side; non-joint units use total tax-unit wages as primary.",
            "children":"All persons under 18; under-6 uses A_AGE < 6",
            "adultCredits":"All persons age 18+ assigned to the tax unit",
            "runtime":"Cells are frequency-compressed exact tax-unit states; no behavioral response is baked into the snapshot."
        },
        "sample":{"taxUnits":len(units)},
        "distributionColumns":["primaryCashWage","secondaryCashWage","scheduleAdults","creditAdults","childrenUnder18","childrenUnder6","taxUnitWeight"],
        "distribution":cells,
    }
    OUTPUT.write_text(json.dumps(snapshot,separators=(",",":"))+"\n",encoding="utf-8")
    print(f"Wrote {OUTPUT} with {len(cells):,} cells from {len(units):,} tax units")

if __name__ == "__main__":
    main()
