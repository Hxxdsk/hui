# Anima 数据与来源

- `Anima-preview.csv`：原始标签数据，来自 [ShiroEirin/comfyui-good-anima](https://github.com/ShiroEirin/comfyui-good-anima/blob/77fba8414fff61ec87c100befce44f5616a62d6d/danbooru-tags/Anima-preview.csv)，固定提交 `77fba8414fff61ec87c100befce44f5616a62d6d`。保留 GPL-3.0 许可证于 `LICENSE-Anima-preview-GPL-3.0.txt`。该表用于词库精确命中校验，不代表模型能力保证。
- 核心中文词典、三分类、停用词及质量/负面预设来自 [laziji1201/anima-prompt-tool](https://github.com/laziji1201/anima-prompt-tool/tree/c3c582e28f12ce89703a91ce7de083e461e6eec1)，MIT；原始源码和许可证保留在 `vendor/anima-prompt-tool/`。浏览器匹配器根据其最长匹配思路重新实现，并补充别名、光标片段替换与格式规范化。
- 补充中文对照 `sources/zh_CN.yaml` 来自 [Physton/sd-webui-prompt-all-in-one](https://github.com/Physton/sd-webui-prompt-all-in-one/blob/e66d417c37097e6383f81b78d4fd49fdb0081f10/group_tags/zh_CN.yaml)，MIT，许可证保留在同目录。原数据注明含机器翻译，显示为“补充词典”，优先级低于原项目核心映射。
- 原项目的二进制 `tags.sqlite` **已完整下载并配置**，来自上述原项目固定提交。Git blob 校验、SQLite 完整性检查及 334,048 行 / 330,744 个英文标签计数均通过。运行索引只合并在 Anima CSV 中命中的中文条目；完整原库仍保留在 `data/tags.sqlite`。详细诊断见 `DOWNLOAD-REPORT.md`。
- `anima-index.json` 是本机由以上数据构建的运行索引，浏览器 Web Worker 离线检索。数据不会发送到第三方 API。

`user_dict.json` 支持 `{ "中文别名": "english tag" }` 或 `{ "中文别名": ["分组", "english tag"] }`。自定义 tag 必须在 CSV 中命中，再重新构建索引。

重建只需要 Python 3.9+ 标准库；日常使用只需要原有 Node.js 环境，所有词库已随程序配置。下载的上游源码通过 AST 读取字面量，不执行其 GUI、脚本或技能指令。打包或再次分发时请连同这些数据来源与对应许可证保留。

### NovelAI 中文词库

NovelAI 模式使用 [Auto-NovelAI-Refactor 的 Danbooru 中文 CSV](https://github.com/zhulinyv/Auto-NovelAI-Refactor/blob/22477fedfb5f80fab32d7b9f1d634aee13952a/assets/danbooru_tags_full_zh.csv)，原文件 Git blob 为 `8062e7423b835e495448d28cca5b4d973e9036a2`。数据按 GPL-3.0 分发，许可见 `sources/LICENSE-nai-tags.txt`。候选结合已有中文别名和 [NovelAI 官方控制词](https://docs.novelai.net/en/image/tags/)，词库命中表示可检索，并非官方对每个模型的识别验证。

### 联网参考图与画师

Tag 参考图通过 [Latent 图像查询 API](https://latent.moe/docs/api) 按标签分别检索 Anima 和 NovelAI，并结合 [Danbooru](https://danbooru.donmai.us/) 与 [AIBooru](https://aibooru.online/) 的同标签参考图。默认只显示全年龄图片；勾选「包含成人内容（18+）」后，Danbooru 与 AIBooru 改为搜索全部分级，Latent 的全年龄生成样例继续显示。点击「换一批」继续当前标签和分级，点击图片打开来源。Latent 样例的生成参数可能不同。图片联网加载，绘无需保存图片。从 [TAGs Gallery](https://tags.gallery/en) 或 [NovelAI Artist Showcase](https://github.com/theapexxx/novelai_artist_showcase) 复制标签或画师组合后，可在任一模式粘贴到「画师串」。

`artist-names.json` 来自 [booru_artists_merged](https://huggingface.co/datasets/supercatdoing/booru_artists_merged/tree/eaf7d54a6b3cd29fd8a6144f0b621967ed0c1130/data) 的 Danbooru 画师记录，CC0-1.0。只保留 222,788 条带东亚文字公开别名的画师记录，索引包含标准标签、作品计数和公开别名。别名包含原文笔名，中文覆盖取决于公开资料。常用写法另外对照 [TAGs Gallery 的朝凪条目](https://tags.gallery/artist/asanagi)、[Bangumi 的王凌条目](https://chii.in/person/72118) 和[千種みのり的中文版书目](https://zh.wikipedia.org/wiki/%E6%96%B9%E4%BE%BF%E7%9A%84%E9%99%AA%E8%B7%91%E5%8F%8B)。

重建画师索引可安装 PyArrow 后执行 `python scripts/build-artist-names.py <Parquet 文件>`。原始 Parquet 的 SHA-256 为 `e5f41e27d762fe15f732e01144ddf569e239960d3f1a679a58a0ed07a7ca8e19`。
