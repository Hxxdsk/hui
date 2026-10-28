"""Build a browser-ready Anima index using only the Python standard library.

The upstream code is parsed with ast.literal_eval, never executed. An optional
original tags.sqlite can be placed in data/ to enable the full upstream lexicon.
"""
from pathlib import Path
import ast
import csv
import hashlib
import json
import re
import sqlite3

ROOT = Path(__file__).resolve().parent.parent
UPSTREAM = ROOT / 'vendor' / 'anima-prompt-tool'

def literals(file):
    out = {}
    groups = {}
    for node in ast.parse(file.read_text(encoding='utf-8')).body:
        if isinstance(node,ast.AnnAssign) and isinstance(node.target,ast.Name):
            try: out[node.target.id] = ast.literal_eval(node.value)
            except (ValueError,TypeError): pass
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    try: out[target.id] = ast.literal_eval(node.value)
                    except (ValueError, TypeError): pass
                elif isinstance(target, ast.Subscript) and isinstance(target.value, ast.Name) and target.value.id == 'TAG_MAP':
                    groups[ast.literal_eval(target.slice)] = ast.literal_eval(node.value)
    out['TAG_MAP'] = groups
    return out

def norm(tag):
    tag = re.sub(r'\s+', ' ', str(tag).strip().lower())
    return tag if re.fullmatch(r'score_\d+', tag) else tag.replace('_', ' ')

def main():
    core = literals(UPSTREAM / 'anima_prompt.py')
    patterns = literals(UPSTREAM / 'tagdb.py')['_PATTERNS']
    core_groups = {norm(tag): group for group, items in core['TAG_MAP'].items() for _,tag,*_ in items}
    def classify(name, category):
        if category == 1: return '画师'
        if category == 4: return '角色'
        if category == 3: return '作品'
        if category == 5: return '画质控制'
        if norm(name) in core_groups: return core_groups[norm(name)]
        for group, keys in patterns:
            if any(key in name.replace('-', '_') for key in keys): return group
        return '补充细节'
    entries = {}
    csv_path = ROOT / 'data' / 'Anima-preview.csv'
    with csv_path.open(encoding='utf-8-sig', newline='') as f:
        for row in csv.reader(f):
            if len(row) < 3: continue
            try: category,count = int(row[1]),int(row[2])
            except ValueError: continue
            tag = norm(row[0])
            # [canonical, category, frequency, English aliases, Chinese aliases, group]
            entries[tag] = [tag,category,count,[norm(a) for a in (row[3] if len(row)>3 else '').split(',') if a.strip()],[],classify(row[0],category)]
    def resolve(tag):
        normal = norm(tag)
        if normal in entries: return normal
        if '@'+normal in entries: return '@'+normal
        return alias_map.get(normal)
    alias_map = {a:tag for tag,e in entries.items() for a in e[3]}
    core_aliases = []
    for group, items in core['TAG_MAP'].items():
        for raw,tag,weight,*_ in items:
            canonical = resolve(tag)
            if canonical:
                for cn in raw.split('|'):
                    if cn:
                        entries[canonical][4].append(cn)
                        core_aliases.append([cn,canonical,group,weight])
    supplement_count = 0
    supplement = ROOT / 'data' / 'sources' / 'zh_CN.yaml'
    if supplement.is_file():
        for line in supplement.read_text(encoding='utf-8').splitlines():
            # This source uses 8 spaces for the flat tag: translation pairs.
            match = re.match(r'^ {8}(\S.*?):\s+(.+?)\s*$',line)
            if not match: continue
            tag,cn = (x.strip().strip('"\'') for x in match.groups())
            canonical = resolve(tag)
            if canonical and re.search(r'[\u3400-\u9fff]',cn):
                for alias in re.split(r'[|｜、/]',cn):
                    alias = alias.strip()
                    if alias and alias not in entries[canonical][4]:
                        entries[canonical][4].append(alias)
                        supplement_count += 1
    for entry in entries.values():
        entry[4] = list(dict.fromkeys(entry[4]))
        entry.append(len(entry[4]))  # aliases before this offset are core/supplement
    sqlite_count = 0
    sqlite_rows = 0
    sqlite_unique = 0
    sqlite_sha = None
    original_db = ROOT / 'data' / 'tags.sqlite'
    if original_db.is_file():
        with sqlite3.connect(original_db.as_uri()+'?mode=ro',uri=True) as conn:
            if conn.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('原始 SQLite 完整性检查失败')
            sqlite_rows = conn.execute('SELECT count(*) FROM tags').fetchone()[0]
            sqlite_unique = conn.execute('SELECT count(DISTINCT name) FROM tags').fetchone()[0]
            for cn,name in conn.execute('SELECT cn, name FROM tags'):
                canonical = resolve(name)
                if canonical and cn and re.search(r'[\u3400-\u9fff]',cn) and cn not in entries[canonical][4]:
                    entries[canonical][4].append(cn)
                    sqlite_count += 1
        conn.close()
        db_bytes = original_db.read_bytes()
        sqlite_sha = hashlib.sha1(b'blob '+str(len(db_bytes)).encode()+b'\0'+db_bytes).hexdigest()
    custom = ROOT / 'data' / 'user_dict.json'
    if custom.is_file():
        for cn,value in json.loads(custom.read_text(encoding='utf-8')).items():
            tag = value if isinstance(value,str) else value[1]
            canonical = resolve(tag)
            if not canonical: raise ValueError(f'自定义映射不在 Anima-preview.csv 中：{cn} → {tag}')
            group = entries[canonical][5] if isinstance(value,str) else value[0]
            row = entries[canonical]
            if cn in row[4]:
                previous = row[4].index(cn)
                row[4].remove(cn)
                if previous < row[6]: row[6] -= 1
            row[4].insert(0,cn)
            row[6] += 1
            core_aliases.insert(0,[cn,canonical,group,1])
    values = sorted(entries.values(),key=lambda e:-e[2])
    for entry in values: entry[4] = list(dict.fromkeys(entry[4]))
    raw = csv_path.read_bytes()
    meta = {'version':2,'tags':len(values),'translatedTags':sum(bool(e[4]) for e in values), 'chineseAliases':sum(len(e[4]) for e in values),'coreTags':len({r[1] for r in core_aliases}),'supplementAliases':supplement_count,'originalSqliteAliases':sqlite_count,'originalSqliteRows':sqlite_rows,'originalSqliteUniqueTags':sqlite_unique,'originalSqliteGitBlob':sqlite_sha,'csvSha256':hashlib.sha256(raw).hexdigest(),'upstreamCommit':'c3c582e28f12ce89703a91ce7de083e461e6eec1','csvCommit':'77fba8414fff61ec87c100befce44f5616a62d6d'}
    result = {'meta':meta,'entries':values,'core':core_aliases,'stopwords':sorted(core['STOPWORDS'],key=lambda s:-len(s)),'quality':core['QUALITY_PREFIX'],'negative':core['NEGATIVE_PROMPT']}
    target = ROOT / 'data' / 'anima-index.json'
    target.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps(meta,ensure_ascii=False))
    print(f'Index: {target} ({target.stat().st_size:,} bytes)')

if __name__ == '__main__': main()
