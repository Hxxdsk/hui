# 绘 · hui

本机运行的 AI 对话、中英翻译与 Anima Tag 编辑器。淡紫色界面，适合绘图提示词和日常对话。使用自己的第三方 API，不内置付费账号或 Key。

[下载正式版](https://github.com/Hxxdsk/hui/releases/latest) · [安装](docs/INSTALL.md) · [功能教程](docs/USAGE.md) · [升级回滚](docs/UPDATING.md) · [开发构建](docs/DEVELOPMENT.md) · [致谢](THIRD_PARTY_NOTICES.md)

## 功能

- **AI 对话**：输入网址和 Key 检测兼容 Chat Completions 的模型；流式回复、停止、续写、上下文预算、多组请求指令及组合预览。支持图片、PDF、DOCX、文本拖放、粘贴图片；聊天可重命名和导入导出。
- **独立翻译**：中英实时或手动翻译、短语对应定位、复制和发送到 Tag / 对话。支持跟随聊天、独立兼容 API、火山原生 AK/SK 和 DeepL。
- **Anima 词库**：111,513 条表内标签、86,585 条中文别名，原项目 334,048 行 SQLite 已校验并随完整包提供。中文悬浮候选、权重、正负向、多组前缀和自然语言补充。
- **Tag 工作台**：多列列表、拉高或展开全部、手柄拖动与自动滚动、键盘排序、全部清空。颜色图例可临时筛选；中文括注仅显示，复制保留原英文与权重；正负向一起插入对话。
- **anima-tagger**：可勾选创作、扩写、反推规范与 T5 精确校验。CPU 图像模型按需安装、代理、取消、续传与哈希复用；本地辅助超时交由视觉 API 分析。
- **保存与备份**：API 输入后自动保存，完整配置备份包含凭据，可密码加密，导入后恢复。聊天单独导出。
- **便携与更新**：双击 EXE 直接打开网页，无启动页；关闭最后一个网页释放端口。网页内确认版本说明后自动下载、按文件哈希更新并重启，保护设置与已有模型，失败回滚。

请求指令和续写用于组织请求及处理长度截断，不能改变服务商权限、审查或模型能力。图片需所选 API 支持视觉。

## 首次使用

1. 在 [Releases](https://github.com/Hxxdsk/hui/releases) 下载 hui-portable-v版本-windows-x64.zip。
2. **完整解压**，双击绘.exe；无需安装 Node、Python 或 npm。支持 Windows 10 / 11 x64。
3. 设置 → API 连接：填写自己的第三方网址、Key、模型。API 自动保存，其他设置点击保存。
4. 按需在提示词技能中安装 CPU 图像模型，约 1.9GB 权重只下载一次，不包含在日常升级包里。

## 网页内更新

有新版本时右上角显示提醒，可点击 × 关闭。以后仍可从设置 → 版本更新进入。点击更新先显示版本说明，此时关闭弹窗或“暂不更新”不会下载。

点击“确认更新并重启”后，程序自动下载升级内容、检查 SHA256、保存当前状态，再退出服务并替换差异文件，完成后重新启动并刷新当前页面。使用原目录和原端口，对话、API 设置、前缀、标签与已下载模型继续保留。更新中可收起弹窗，任务继续；请等完成再发送新消息。

正常更新无需手动下载安装包。2.2–2.4 等尚无网页更新功能的旧版，可一次性使用 Release 中的传统升级包迁移；之后都从网页更新。详细恢复办法见 [UPDATING](docs/UPDATING.md)。

## 源码运行

安装 Node.js 24.5+：

```powershell
git clone https://github.com/Hxxdsk/hui.git
cd hui
npm ci
npm run assets
npm start
```

打开 http://127.0.0.1:3210 。assets 命令从固定 Release 恢复词库和 tokenizer，检查 SHA256；已有正确文件跳过。大数据不塞进 Git 历史，也可从完整包 app 对应目录复制后校验，避免重复下载。Windows 打包见 [开发文档](docs/DEVELOPMENT.md)。

## 本地数据

API 设置在 user-data/settings.json（便携版为 app/user-data/settings.json）；聊天、Tag 和前缀在当前浏览器中。设置备份包括 Key，可加密；聊天另行导出。公开仓库与发布包不包含个人凭据、聊天、附件、下载缓存或模型权重。

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
