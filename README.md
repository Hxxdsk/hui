# 绘 · hui 1.0 正式版

绘是一款在本机运行的 AI 对话、中英翻译与 Anima Tag 编辑器。淡紫色界面，面向日常对话、图片理解和绘图提示词编写。使用你自己的第三方 API，支持在不同工作区之间复制、翻译和整理提示词。

[下载 Windows 便携版](https://github.com/Hxxdsk/hui/releases/latest) · [安装教程](docs/INSTALL.md) · [使用教程](docs/USAGE.md) · [源码构建](docs/DEVELOPMENT.md) · [工程致谢](THIRD_PARTY_NOTICES.md)

## 功能

### AI 对话

填写 API 地址和 Key 后检测可用模型，也可手动指定兼容 Chat Completions 的模型。支持流式回复、停止、续写、上下文预算、生成参数、多组请求提示词与组合预览。

图片、PDF、DOCX 和文本可直接拖入网页，支持粘贴图片。输入框可上下拉伸或收起，保留草稿；聊天记录可搜索、重命名、导入和导出。

### 中英翻译

独立翻译工作区支持中英互译、实时翻译和短语对应定位。结果可复制、发送到 Tag 编辑器或插入对话。

支持跟随对话 API、独立兼容接口、火山翻译原生 AK/SK 和 DeepL。原生翻译服务使用内置端点，不需要填写模型网址。

### Anima Tag 工作台

- 离线检索 111,513 条表内标签、86,585 条中文别名，完整保存并校验原项目 334,048 行 SQLite 扩展词库。
- 中文输入显示悬浮候选，支持整段 Prompt 转换、权重、正负向标签和自然语言补充。
- 多列标签列表可拉高或展开全部；手柄拖动显示插入位置，支持边缘自动滚动和键盘排序。
- 正负向 Prompt 用柔和底色与颜色图例区分用途；类别筛选只影响预览，保留原始顺序。
- 可勾选中文括注，复制仅保留英文原文和权重；插入对话时同时区分正负向内容。
- 用户可配置多组正负向前缀，勾选只增减前缀层。全部清空可清除当前两侧内容并取消前缀勾选，方便下一张图编写。

### 本地图片辅助与提示词技能

可在设置中启用 anima-tagger，选择创作、图片反推或扩写分支，使用固定上游规范并进行 T5 精确校验。

PixAI CPU 图像辅助按需安装，**不设等待时限**，处理完成后继续发送到对话模型；需要中断时点击停止生成。图像模型约 1.9GB，安装支持代理、续传和完整性校验，已有正确文件直接复用。未安装本地模型时，仍可使用支持视觉的 API 分析图片。

### 设置保存与备份

API 地址、模型和密钥输入后自动保存在本机。配置备份包含 API 凭据、翻译设置、请求方案、Tag 与前缀，可用密码加密；导入后恢复使用。聊天可单独导出。

## 安装与开始使用

1. 从下载页选择以 **hui-portable** 开头的 Windows x64 完整便携包。
2. 完整解压到有写入权限的目录，双击 **绘.exe**，直接进入网页。无需安装全局 Node、Python 或 npm。
3. 打开设置 → API 连接，填写自己的地址、Key 和模型。API 自动保存，其他选项点击保存。
4. 从左侧选择对话、翻译或 Tag 编辑工作区。图片理解需要所选模型支持视觉。
5. 按需在设置 → 提示词技能中安装本地 CPU 图像模型。关闭最后一个绘网页后，后台自动结束并释放端口。

支持 Windows 10 / 11 x64。运行时保留 app、runtime、assets 等完整目录，不要只复制 EXE。

## 常用按键

| 操作 | 按键 |
|---|---|
| 发送对话 / 换行 | Enter / Shift+Enter |
| 新建对话 | Alt+N |
| 候选词选择 | ↑↓，Enter 或 Tab |
| 转换整段 Tag 输入 | Ctrl+Enter |
| 收起候选 / 取消拖动 | Esc |
| 手柄键盘排序 | 方向键，Home / End |

## 源码运行

安装 Node.js 24.5+，执行：

```powershell
git clone https://github.com/Hxxdsk/hui.git
cd hui
npm ci
npm run assets
npm start
```

打开 http://127.0.0.1:3210 。assets 命令从固定数据资产包恢复词库和 tokenizer 并核对 SHA256；已有正确文件跳过。也可从完整便携包的 app 对应目录复制这些数据，再执行校验。

## 本地数据

API 设置在 user-data/settings.json（便携版为 app/user-data/settings.json）；聊天、Tag 和前缀保存在当前浏览器中。备份包含密钥，请按需设置加密密码并妥善保管。

公开源码和安装包不包含个人 API 凭据、聊天、附件或本地图像权重。离线词库检索无需联网；使用第三方 API 时，相应对话或翻译内容会发送给所配置服务。

## 感谢与许可

特别感谢：

| 工程 | 使用内容 |
|---|---|
| [laziji1201/anima-prompt-tool](https://github.com/laziji1201/anima-prompt-tool) | 中文字典、SQLite、分组与前缀思路；MIT |
| [Vincent54122/anima-tagger](https://github.com/Vincent54122/anima-tagger) | 创作/扩写/反推技能、T5 校验、PixAI CPU 方案；MIT，模型另依许可 |
| [ShiroEirin/comfyui-good-anima](https://github.com/ShiroEirin/comfyui-good-anima) | Anima-preview.csv；随附 GPL-3.0 许可 |
| [Physton/sd-webui-prompt-all-in-one](https://github.com/Physton/sd-webui-prompt-all-in-one) | 补充中文对照；MIT |
| [pixai-labs/pixai-tagger-v1.0](https://huggingface.co/pixai-labs/pixai-tagger-v1.0) / [noaione/PixAI ONNX](https://huggingface.co/noaione/pixai-tagger-v1.0-onnx) | 按需图像模型，模型卡 Apache-2.0 |
| [Google T5](https://huggingface.co/google/t5-v1_1-xxl) | 上游技能的转换 tokenizer，Apache-2.0 来源声明 |

原创代码采用 [MIT](LICENSE)。第三方工程、数据、模型维持各自许可，不全部重标为 MIT。固定提交、归属、版本和许可证位置见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)、[数据来源](data/SOURCES.md) 与各 LICENSE。
