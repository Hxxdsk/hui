"""Verify the pinned upstream database, never accepting an HTML/error download."""
from pathlib import Path
import hashlib
import json
import sqlite3
import sys

path=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parent.parent/'data/tags.sqlite'
raw=path.read_bytes()
sha=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
if sha!='8b1727009de0a42012a7b7fd50c2f1a524ec45e0':
    raise SystemExit('SQLite 下载校验失败：与固定上游 Git blob 不一致，原文件未被覆盖')
con=sqlite3.connect(path.as_uri()+'?mode=ro',uri=True)
try:
    integrity=con.execute('PRAGMA integrity_check').fetchone()[0]
    rows=con.execute('SELECT count(*) FROM tags').fetchone()[0]
    unique=con.execute('SELECT count(DISTINCT name) FROM tags').fetchone()[0]
finally:
    con.close()
if integrity!='ok' or rows!=334048 or unique!=330744:
    raise SystemExit('SQLite 完整性或记录数量校验失败')
print(json.dumps({'bytes':len(raw),'gitBlob':sha,'integrity':integrity,'rows':rows,'uniqueTags':unique},ensure_ascii=False))
