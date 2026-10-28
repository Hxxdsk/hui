# 绘 1.0 正式版 · 安装教程

## Windows 便携运行

1. 在 [下载页](https://github.com/Hxxdsk/hui/releases/latest) 获取以 hui-portable 开头的 Windows x64 完整包，可用同页 SHA256SUMS.txt 校验。
2. 完整解压到有写权限的目录，例如 D:\Apps\hui。不要在 ZIP 内运行，也不要只移动 EXE。
3. 双击绘.exe 直接进入网页，无需安装全局 Node、Python、Git 或 npm。
4. 设置 → API 连接：填写第三方 Base URL 和 Key，检测模型或输入模型 ID。API 自动保存，其他设置点击保存。
5. 关闭最后一个绘网页，后台自动结束并释放端口；刷新、切换后台或打开多个页面不会误退出。

支持 Windows 10 / 11 x64；保留同目录 app、runtime、assets。其他系统可尝试源码运行，原生 EXE 面向 Windows。

## 翻译连接

- 跟随对话：复用聊天 API。
- 独立兼容接口：单独填写地址、Key 和模型。
- 火山翻译：填写 AccessKeyId、SecretAccessKey，按需填写 region 和临时 SessionToken；服务端点与签名内置。
- DeepL：填写 API Key，使用内置原生端点。

## 本地提示词技能

文字规范和 T5 精确校验环境随完整包提供。设置 → 提示词技能中可启用 anima-tagger，选择创作、反推或扩写。

本地图像打标可选 CPU 或 NVIDIA 显卡，各自模型约 1.9GB。点击安装后可设置代理，支持取消、续传与 SHA256 校验，已有正确模型直接复用。PixAI 图像辅助不设等待时限；完成后才继续发送，可手动停止。

缺少微软 C++ DLL 时，可在同一设置页点击安装 C++ 运行库；程序使用微软官方安装器，Windows 会显示安装授权。

## 源码部署

安装 Node.js 24.5+：

```powershell
git clone https://github.com/Hxxdsk/hui.git
cd hui
npm ci
npm run assets
npm start
```

浏览器打开 http://127.0.0.1:3210 。assets 命令只补齐缺失或校验不一致的数据。离线部署可从完整包 app/data 复制 CSV、运行索引与 SQLite，并从 app/vendor/anima-tagger/models/t5_tokenizer 复制 tokenizer 到源码对应位置，再运行 assets 检查。

## 备份与迁移

设置备份包含 API、翻译、请求提示词、Tag 和前缀，可密码加密；聊天另行导出。复制完整程序目录到另一台 Windows x64 电脑，导入配置和聊天即可继续使用。本地模型也可随目录复制并经校验复用。

## 打标设备选择与切换

在设置 → 提示词技能中选择本地图像打标设备，再点击安装 / 修复。

- CPU：通用，无需独立显卡；至少保留 3GB 可用内存，速度取决于处理器。
- NVIDIA 显卡：CUDA 加速，通常更快；需要兼容 CUDA 12.8 的 NVIDIA 显卡及 Windows 驱动 570.65 或更高，建议 8GB 及以上显存。Intel / AMD 显卡请选择 CPU。程序自动安装 PyTorch CUDA，无需单独安装 CUDA Toolkit。安装时检查驱动和 CUDA 内核，不支持时显示原因。
- 已安装用户：先点击“卸载打标环境”，再选择另一种设备并安装。旧 CPU 安装会自动识别。卸载保留两种模型文件、下载缓存、T5 校验、API 与聊天设置。再次安装相同路线时校验并复用已有模型。CPU 与显卡版使用不同权重，各约 1.9GB，显卡依赖还需数 GB 空间。
- 图像辅助不限制等待时间，可随时点击停止生成。显卡版按硬件自动选择 BF16 或 FP32；显存不足需关闭其他占用显存的软件，或卸载后改用 CPU。

运行环境依据：[PyTorch 2.8 安装方案](https://pytorch.org/get-started/previous-versions/)、[CUDA 12.8 Windows 驱动说明](https://docs.nvidia.com/cuda/archive/12.8.0/cuda-toolkit-release-notes/index.html)。
