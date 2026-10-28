"""JSON-only adapter around the pinned anima-tagger project. No user code execution."""
import contextlib
import importlib
import io
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent / 'vendor' / 'anima-tagger'
sys.path.insert(0, str(ROOT / 'tools'))

def split_prompt(text):
    blocks = re.findall(r'```(?:text|plaintext)?\s*\n([\s\S]*?)```', text, flags=re.I)
    content = (blocks[0] if blocks else text).strip()
    tags, nl = [], []
    natural = False
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        if not natural and (re.match(r'^[A-Z][a-z]+\s', line) or re.search(r'[.!?]$', line) or re.match(r'^(Composition|Hair &|Face &|Master)', line)):
            natural = True
        (nl if natural else tags).append(line)
    return ', '.join(s.rstrip(', ') for s in tags), '\n'.join(nl)

def run(data):
    op = data.get('op')
    if op == 'check':
        result = {'validator':False, 'image':False, 'errors':[]}
        try:
            from tokenizers import Tokenizer
            Tokenizer.from_file(str(ROOT / 'models/t5_tokenizer/tokenizer.json'))
            result['validator'] = True
        except Exception as error:
            result['errors'].append('精确校验环境：' + str(error))
        from pixai_config import CPU_MODEL_DIR, verify_assets
        if not verify_assets(CPU_MODEL_DIR, cpu=True):
            try:
                for name in ['onnxruntime','numpy','PIL']:
                    importlib.import_module(name)
                result['image'] = True
            except Exception as error:
                result['errors'].append('本地图像打标：' + str(error))
        return result
    if op == 'validate':
        from anima_validate import main
        tags, nl = split_prompt(data['text'])
        if not tags:
            return {'parsed':False, 'problems':['没有识别到标签段，请使用英文逗号分隔的 Tag，再另起段落写英文描述。']}
        sys.argv = ['anima_validate.py','--tags',tags,'--nl',nl,'--json']
        if data.get('mode') == 'expand':
            sys.argv.append('--no-token-limit')
        captured = io.StringIO()
        with contextlib.redirect_stdout(captured):
            code = main()
        result = json.loads(captured.getvalue())
        result.update(parsed=True, passed=code == 0, tags=tags, nl=nl)
        return result
    if op == 'tag':
        from PIL import Image
        Image.MAX_IMAGE_PIXELS = 36_000_000
        from pixai_tagger import main
        sys.argv = ['pixai_tagger.py',*data['paths'],'--device','cpu','--json']
        captured = io.StringIO()
        with contextlib.redirect_stdout(captured):
            code = main(sys.argv[1:])
        if code:
            raise RuntimeError('本地图像打标失败')
        return json.loads(captured.getvalue())
    raise ValueError('未知操作')

if __name__ == '__main__':
    try:
        data = json.load(sys.stdin)
        print(json.dumps(run(data),ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'error':str(error)},ensure_ascii=False))
        sys.exit(1)
