import runpy
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

run = runpy.run_path(str(Path(__file__).resolve().parent.parent / 'anima-bridge.py'))['run']

class DeviceDispatch(unittest.TestCase):
    def modules(self, directory, available=True, bf16=True):
        self.kernels = []
        tensor = SimpleNamespace(sum=lambda: SimpleNamespace(item=lambda: self.kernels.append('cuda kernel')))
        torch = SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: available,
            is_bf16_supported=lambda: bf16, get_device_name=lambda index: 'Test NVIDIA'),
            ones=lambda *args, **kwargs: tensor)
        def tag(args):
            self.argv = args
            print('{"general": ["book"], "character": []}')
            return 0
        return {'tokenizers': SimpleNamespace(Tokenizer=SimpleNamespace(from_file=lambda file: object())),
            'pixai_config': SimpleNamespace(CPU_MODEL_DIR=directory, MODEL_DIR=directory, verify_assets=lambda *a, **k: []),
            'torch': torch, 'torchvision': SimpleNamespace(), 'transformers': SimpleNamespace(),
            'timm': SimpleNamespace(), 'accelerate': SimpleNamespace(), 'safetensors': SimpleNamespace(),
            'onnxruntime': SimpleNamespace(), 'numpy': SimpleNamespace(), 'PIL': SimpleNamespace(Image=SimpleNamespace()),
            'pixai_tagger': SimpleNamespace(main=tag)}

    def test_cuda_probe_executes_kernel_and_uses_supported_precision(self):
        with tempfile.TemporaryDirectory() as folder:
            for bf16 in (True, False):
                with patch.dict(sys.modules, self.modules(Path(folder), bf16=bf16)):
                    result = run({'op': 'check', 'device': 'cuda'})
                    self.assertTrue(result['image'])
                    self.assertEqual(self.kernels, ['cuda kernel'])
                    self.assertEqual(result['precision'], 'bf16' if bf16 else 'fp32')
                    self.assertEqual(run({'op': 'tag', 'device': 'cuda', 'paths': ['image.png']})['general'], ['book'])
                    self.assertEqual(self.argv[self.argv.index('--device')+1], 'cuda')
                    self.assertEqual(self.argv[self.argv.index('--precision')+1], result['precision'])

    def test_missing_cuda_stays_unavailable_and_cpu_stays_explicit(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.dict(sys.modules, self.modules(Path(folder), available=False)):
                result = run({'op': 'check', 'device': 'cuda'})
                self.assertFalse(result['image'])
                self.assertIn('CUDA', result['errors'][0])
                self.assertTrue(run({'op': 'check', 'device': 'cpu'})['image'])
                run({'op': 'tag', 'device': 'cpu', 'paths': ['image.png']})
                self.assertEqual(self.argv[self.argv.index('--device')+1], 'cpu')
                self.assertNotIn('--precision', self.argv)

if __name__ == '__main__':
    unittest.main()
