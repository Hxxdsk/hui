# Anima 数据与来源

- `Anima-preview.csv`：原始标签数据，来自 [ShiroEirin/comfyui-good-anima](https://github.com/ShiroEirin/comfyui-good-anima/blob/77fba8414fff61ec87c100befce44f5616a62d6d/danbooru-tags/Anima-preview.csv)，固定提交 `77fba8414fff61ec87c100befce44f5616a62d6d`。保留 GPL-3.0 许可证于 `LICENSE-Anima-preview-GPL-3.0.txt`。该表用于词库精确命中校验，不代表模型能力保证。
- 核心中文词典、三分类、停用词及质量/负面预设来自 [laziji1201/anima-prompt-tool](https://github.com/laziji1201/anima-prompt-tool/tree/c3c582e28f12ce89703a91ce7de083e461e6eec1)，MIT；原始源码和许可证保留在 `vendor/anima-prompt-tool/`。浏览器匹配器根据其最长匹配思路重新实现，并补充别名、光标片段替换与格式规范化。
- 补充中文对照 `sources/zh_CN.yaml` 来自 [Physton/sd-webui-prompt-all-in-one](https://github.com/Physton/sd-webui-prompt-all-in-one/blob/e66d417c37097e6383f81b78d4fd49fdb0081f10/group_tags/zh_CN.yaml)，MIT，许可证保留在同目录。原数据注明含机器翻译，显示为“补充词典”，优先级低于原项目核心映射。
- 原项目的二进制 `tags.sqlite` **已完整下载并配置**，来自上述原项目固定提交。Git blob 校验、SQLite 完整性检查及 334,048 行 / 330,744 个英文标签计数均通过。运行索引只合并在 Anima CSV 中命中的中文条目；完整原库仍保留在 `data/tags.sqlite`。详细诊断见 `DOWNLOAD-REPORT.md`。
- `anima-index.json` 是本机由以上数据构建的运行索引，浏览器 Web Worker 离线检索。数据不会发送到第三方 API。

`user_dict.json` 支持 `{ "中文别名": "english tag" }` 或 `{ "中文别名": ["分组", "english tag"] }`。自定义 tag 必须在 CSV 中命中，再重新构建索引。

重建只需要 Python 3.9+ 标准库；日常使用只需要原有 Node.js 环境，所有词库已随程序配置。下载的上游源码通过 AST 读取字面量，不执行其 GUI、脚本或技能指令。打包或再次分发时请连同这些数据来源与对应许可证保留。
