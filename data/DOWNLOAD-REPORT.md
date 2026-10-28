# SQLite 下载与配置验证（2026-10-27）

## 结论

原项目入口正确。已从固定提交的 Raw 地址下载原始数据库，完成校验并配置到本机；不是从网页 HTML 或替代词典重建的数据库。

- 地址：`https://raw.githubusercontent.com/laziji1201/anima-prompt-tool/c3c582e28f12ce89703a91ce7de083e461e6eec1/data/tags.sqlite`
- 本地文件：`data/tags.sqlite`
- 字节数：36,810,752
- Git blob SHA-1：`8b1727009de0a42012a7b7fd50c2f1a524ec45e0`，与 GitHub 文件元数据一致。
- `PRAGMA integrity_check`：`ok`
- 总行数：334,048；不同英文标签：330,744。
- 已将 82,964 条新增且在 Anima CSV 中命中的中文映射并入运行索引；加上核心和补充词典，共 86,585 条中文别名、111,513 个 Anima 表内标签。原库保留完整，运行时按 Anima 表过滤。

## 之前失败的原因

1. Git 的代理为 `socks5://127.0.0.1:65532`，该端口没有服务监听。
2. 关闭代理后，直连 GitHub / Raw 请求也超时。GitHub 连接器支持文本，不支持直接读取 SQLite 二进制；此前通过连接器读取出现了 UTF-8 解码错误。
3. 本次发现本机已有 `verge-mihomo` 在 `127.0.0.1:7897` 监听。只为此次下载显式指定该代理后成功，**没有修改系统代理或全局 Git 配置**。

## 复验或重新准备

```powershell
python scripts/verify-anima-db.py
npm.cmd run build:anima
```

如文件丢失，可运行 `scripts/prepare-anima.ps1`；需要代理时显式传 `-Proxy http://127.0.0.1:7897`，端口应以你当前代理软件为准。脚本只在文件缺失时下载，并校验后再配置，不覆盖校验失败的已有数据库。日常启动不用再下载或重建。
