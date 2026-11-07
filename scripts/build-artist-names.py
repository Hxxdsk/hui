"""Build the compact artist index from the pinned Parquet in data/SOURCES.md."""
import json
from pathlib import Path
import re
import sys
import unicodedata

from pyarrow.parquet import ParquetFile


ROOT = Path(__file__).resolve().parents[1]
CJK = re.compile(r"[\u3040-\u30ff\u3400-\u9fff]")
SUPPLEMENT = {
    "asanagi": ["朝凪", "朝凪久遠", "朝凪久远"],
    "wlop": ["王凌"],
    "chigusa_minori": ["千种实里", "千種實里"],
}


def public_names(record):
    names = SUPPLEMENT.get(record["name"], []) + (record["other_names"] or [])
    aliases = []
    for value in names:
        alias = unicodedata.normalize("NFKC", value or "").strip()
        if not alias or len(alias) > 80 or re.search(r"[@/\x00-\x1f\ufffd]", alias):
            continue
        aliases.append(alias)
    return list(dict.fromkeys(aliases))


columns = ["name", "other_names", "post_count", "is_banned", "is_deleted"]
rows = []
for batch in ParquetFile(sys.argv[1]).iter_batches(columns=columns):
    for record in batch.to_pylist():
        if not record["name"] or record["is_banned"] or record["is_deleted"]:
            continue
        aliases = public_names(record)
        if any(CJK.search(name) for name in aliases):
            rows.append([record["name"], max(0, record["post_count"] or 0), aliases])

rows.sort(key=lambda row: row[0])
with (ROOT / "data/artist-names.json").open("w", encoding="utf-8", newline="\n") as output:
    output.write("[\n")
    output.write(",\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in rows))
    output.write("\n]\n")
print(f"Exported {len(rows):,} artist entries")
