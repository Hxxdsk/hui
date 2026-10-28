# 安装与部署

## Windows 便携版

1. 从 [Releases](https://github.com/Hxxdsk/hui/releases/latest) 下载 `hui-portable-v版本-windows-x64.zip`，可用同页 `SHA256SUMS.txt` 校验。
2. 完整解压到有写权限的目录，例如 `D:\Apps\hui`。不要在 ZIP 内运行，也不要只复制 EXE。
3. 双击 `绘.exe` 直接进入网页，不显示启动器页面。无需安装 Node、Python、Git 或 npm。默认端口 3210，已占用时自动选择空闲端口，不结束其他程序。
4. 设置 → API 连接：输入第三方 Base URL、Key，检测模型或填写 ID。API 自动保存，其他选项点击保存。
5. 关闭最后一个绘网页后自动结束对应后台服务并释放端口；刷新、切换后台与多个页面并用不会误退出。

支持 Windows 10 / 11 x64。保留同目录的 app、runtime、assets。原生 EXE 和自动部署面向 Windows；其他系统可尝试源码运行。

## 翻译连接

- 跟随对话：复用聊天 API。
- 独立兼容接口：单独填写地址、Key、模型。
- 火山翻译：选择原生服务，填写 AccessKeyId、SecretAccessKey，按需填写 region、SessionToken。程序内置官方地址与签名，不需要模型网址。
- DeepL：填写 API Key，使用内置原生端点。

## 本地技能

文字技能、规范与 T5 精确校验环境随完整包提供。可勾选创作、扩写或图片反推分支。

CPU 图像打标按需安装，约 1.9GB 权重不包含在日常发布包内。安装支持代理、取消、续传、SHA256 校验，已有正确文件复用。可选本地辅助超时后，图片交由当前视觉 API 分析。缺少微软 C++ DLL 时可点击安装运行库，官方安装器会请求 Windows 安装授权。

## 源码启动

安装 Node.js 24.5+：

```powershell
git clone https://github.com/Hxxdsk/hui.git
cd hui
npm ci
npm run assets
npm start
```

打开 http://127.0.0.1:3210 。assets 命令只补齐缺失或哈希不一致的词库和 tokenizer；已有正确文件跳过。离线部署可把完整包的 app/data 中三个大数据文件，以及 app/vendor/anima-tagger/models/t5_tokenizer/tokenizer.json 复制到源码对应位置，再运行 assets 校验。

## 迁移

设置备份包含 API 凭据、指令、翻译、Tag 与前缀，可加密；聊天单独导出。复制整个便携目录到新电脑，再导入备份。已下载的模型目录可直接复制并经校验复用。旧版升级请看 [升级教程](UPDATING.md)。
