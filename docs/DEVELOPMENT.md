# 开发与构建

Node.js 24.5+。本地服务 server.mjs、浏览器 ES modules public/；翻译 translation.mjs；原子设置存储 preferences.mjs；Anima 接入 anima-service.mjs / anima-bridge.py；正式发布检查 updates.mjs。

```powershell
npm ci
npm run assets
npm run check
npm test
```

测试覆盖流式响应、上下文、附件、翻译签名、词库、前缀、配置备份、长历史与升级回滚。Windows 便携 Python 就绪时运行真实 T5 校验；其他环境明确跳过此项。

Windows 便携构建使用系统 .NET Framework C# 编译器与当前 Node x64：

```powershell
npm run prepare:portable
npm run build:portable
```

准备命令将 Python 和校验依赖安装在项目内部，不要求全局 Python。完整包带本地运行环境；可选 1.9GB PixAI 权重、API 设置、聊天、测试与缓存不纳入发布。构建器使用来源白名单，复用发布目录不会把运行后产生的个人设置打包。

HuiDesktop.cs 管理浏览器页面与后台服务，关闭最后一个页面后退出。HuiLauncher.cs 保留图标与预览绘制；Anima 图像处理等待完成并响应用户取消。

不要提交 user-data、.env、配置备份、聊天、模型、运行环境或真实 API Key。上游修改需更新来源和哈希，并保留许可证。

本地打标设备状态保存于 vendor/anima-tagger/.hui-image.json；新图像环境隔离在 .hui-image-python，T5 使用原 .hui-python。两套模型目录均不进入 Git 或发布包；卸载只删除图像运行环境，原有共享 CPU 安装仅卸载 ONNX / NumPy / Pillow。模型和 pip 下载缓存保留。GPU 依赖固定使用上游 PyTorch 2.8.0 cu128 / torchvision 0.23.0，安装前检测 NVIDIA 驱动，安装后执行 CUDA 内核和依赖体检。自动更新清单禁止修改本地图像环境和设备状态。
