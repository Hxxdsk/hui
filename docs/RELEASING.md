# 发布维护

1. 更新 package.json、锁文件版本和 CHANGELOG，执行检查与测试。
2. npm run assets 恢复公共数据；npm run prepare:portable 准备便携校验环境。
3. npm run build:portable 生成完整包、升级包、数据资产、release-manifest.json 和 SHA256SUMS.txt。
4. 后续版本使用前一正式版清单再次执行带 --baseline 的 build-releases.mjs，使变化的资源进入更新包。
5. 在旧安装副本测试检查差异、更新、回滚，并核对设置、模型和用户词典未改。
6. 创建与源码一致的 tag。先创建草稿 Release，上传以下内容，再公开：
   - hui-portable-v版本-windows-x64.zip：完整安装。
   - hui-upgrade-v版本-windows-x64.zip：升级助手与差异数据。
   - hui-data-v版本.zip：源码部署的固定词库与 tokenizer。
   - release-manifest.json：下次打包基准。
   - SHA256SUMS.txt：校验值。
7. assets/data-manifest.json 的固定 URL 和 SHA256 必须与本次数据资产一致。

GitHub Actions 提供手动 Windows 发布流程。构建后全部附件上传到草稿，再公开；GitHub token 不进入程序。源码在 Git，安装包在 Releases，大模型按需从上游安装，不进入 Git 历史。
