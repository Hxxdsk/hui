# 第三方工程、数据与致谢

绘 / hui 感谢以下作者与维护者。集成与界面修改不代表上游背书；第三方文件保留各自版权和许可，不全部重新标为 MIT。

| 名称与作者 | 工程地址 | 使用内容及许可 |
|---|---|---|
| anima-prompt-tool · laziji1201（辣子鸡很下饭） | https://github.com/laziji1201/anima-prompt-tool | 中文核心字典、分类、前缀、SQLite；MIT，原源码及许可保留在 vendor/anima-prompt-tool |
| anima-tagger · Vincent54122 | https://github.com/Vincent54122/anima-tagger | 固定技能规范、创作/扩写/反推、T5 校验与 PixAI CPU / NVIDIA CUDA 方案；MIT，模型另依上游许可 |
| comfyui-good-anima · ShiroEirin | https://github.com/ShiroEirin/comfyui-good-anima | Anima-preview.csv；GPL-3.0 许可保留在 data/LICENSE-Anima-preview-GPL-3.0.txt |
| sd-webui-prompt-all-in-one · Physton | https://github.com/Physton/sd-webui-prompt-all-in-one | 补充中文对照；MIT，来源和许可在 data/sources |
| PixAI tagger · pixai-labs | https://huggingface.co/pixai-labs/pixai-tagger-v1.0 | 按需下载原模型，模型卡声明 Apache-2.0 |
| PixAI ONNX · noaione | https://huggingface.co/noaione/pixai-tagger-v1.0-onnx | 按需下载 CPU 转换，模型卡声明 Apache-2.0 |
| T5 · Google | https://huggingface.co/google/t5-v1_1-xxl | 上游技能提供的转换版 tokenizer；Apache-2.0 来源声明 |

## 固定版本与修改范围

- anima-prompt-tool 固定提交 `c3c582e28f12ce89703a91ce7de083e461e6eec1`。浏览器最长匹配器重新实现，扩展光标片段、悬浮候选和格式处理。原 SQLite blob 为 `8b1727009de0a42012a7b7fd50c2f1a524ec45e0`，334,048 行完整性检查见 `data/DOWNLOAD-REPORT.md`。
- anima-tagger 固定提交 `8f8ca10fc63c2f8fa1b345bc8c75b102acfe6d38`，逐文件哈希见 `vendor/anima-tagger/SOURCE.json`。绘增加 API 接入、设置开关、JSON 桥接、便携部署、取消和下载恢复，没有把上游代码声称为原创。
- CSV 固定提交 `77fba8414fff61ec87c100befce44f5616a62d6d`；补充中文固定提交 `e66d417c37097e6383f81b78d4fd49fdb0081f10`。CSV 及派生索引按数据来源许可保留，构建脚本公开，详见 `data/SOURCES.md`。
- tokenizer 原始 revision `3db67ab1af984cf10548a73467f0e5bca2aaaeb2`，转换方式和 SHA256 在上游 `THIRD_PARTY_NOTICES.md`。Git 源码通过固定 Release 资产包恢复文件。
- PixAI 原版 revision `9fe10addf9326e292da8a85a98ea74cd91b41771`；ONNX revision `68e8f4f02dd56a5f40c1b7474489fa0f599dec34`。权重不随 Git、完整包、日常升级包分发；安装后保留模型卡，各文件 SHA256 见 `anima-service.mjs` 与上游 `pixai_config.py`。

## 运行环境与依赖

| 组件 | 用途 | 许可与地址 |
|---|---|---|
| Node.js | 本机服务，便携包内置 | MIT 及所含组件许可保留在 runtime/LICENSE；https://github.com/nodejs/node |
| Python 3.11.9 embeddable | 本地校验和可选推理 | PSF，环境内保留 LICENSE.txt；https://www.python.org/ |
| marked | Markdown 渲染 | MIT；https://github.com/markedjs/marked |
| DOMPurify | HTML 清理 | Apache-2.0 OR MPL-2.0；https://github.com/cure53/DOMPurify |
| JSZip | ZIP 资产、升级包处理 | MIT OR GPL-3.0-or-later；https://github.com/Stuk/jszip |
| mammoth | DOCX 提取 | BSD-2-Clause；https://github.com/mwilliamson/mammoth.js |
| pdf-parse | PDF 提取 | MIT；https://gitlab.com/autokent/pdf-parse |
| tokenizers / huggingface_hub | 精确计数与部署 | Apache-2.0；环境内 dist-info 保留许可 |
| PyTorch / torchvision / transformers / timm / accelerate / safetensors | 可选 NVIDIA CUDA 推理 | 各自 BSD / Apache-2.0 等许可；安装环境保留 dist-info 许可，https://pytorch.org/ 与 https://huggingface.co/docs/transformers/ |
| ONNX Runtime / NumPy / Pillow | 可选 CPU 推理与图像处理 | 各自 MIT / BSD / HPND 等许可，保留环境内文件 |

精确版本由 package-lock.json 和固定部署版本指定。完整包保留依赖许可证。微软 C++ 运行库由官方安装器单独提供，不作为本项目代码重新授权。
