# Cite

[English](README.md) | [日本語](README_ja.md)

Cite 是一款 Obsidian 插件，可读取笔记中的 BibTeX 条目，渲染 LaTeX 或 Pandoc 格式的引用，并将引用链接到对应的文献笔记。插件支持实时预览和阅读视图，并提供引用键补全及轻量级参考文献列表。

> Cite 0.1.0 需要 Obsidian 1.12.7 或更高版本，支持桌面端、iOS 和 Android。

## 功能

- 将 `\cite{key}` 或 `[@key]` 渲染为带编号的内部链接
- 输入时根据引用键或标题提供补全
- 在 `\bibliography` 所在位置生成参考文献列表
- 从一篇文献笔记中解析一个或多个 BibTeX 条目
- 在文献笔记被创建、编辑、移动或删除时自动重建索引
- 不转换代码、frontmatter 和数学公式中的示例

## 设置方法

1. 打开 **设置 → Cite**，在 **Reference folder** 中指定存放文献笔记的文件夹。此设置为空时，Cite 不会扫描整个仓库，也不会创建索引。
2. 在指定文件夹内的 Markdown 笔记中添加 `bibtex` 代码块：

   ```bibtex
   @article{doe2026,
     author  = {Doe, Jane and Yamada, Taro},
     title   = {An Example Paper},
     journal = {Journal of Examples},
     year    = {2026},
     volume  = {4},
     number  = {2},
     pages   = {10--20}
   }
   ```

3. 在另一篇笔记中输入引用：

   ```text
   既有研究讨论了这一问题 \cite{doe2026}。
   ```

4. 在需要显示参考文献列表的位置，使用单独一段写入 `\bibliography`。

在设置中选择 **Pandoc** 后，可以使用 `[@doe2026]` 或 `[@doe2026; @smith2025]`。当前版本不支持页码定位符、前缀、后缀以及隐藏作者名的 Pandoc 引用语法。

## BibTeX 支持范围

Cite 支持常见的 `article`、`book`、`inproceedings`／`conference`、`incollection`、`inbook`、`proceedings`、`misc` 类型，以及其他类型的回退格式。花括号或引号包围的值可以跨行，也可以包含嵌套花括号。一个代码块中可以放置多个条目。

解析器不会计算 BibTeX 字符串宏、`#` 拼接、`crossref` 继承或 LaTeX 文本格式命令。不受支持的内容不会被发送到外部服务。

参考文献样式是以可读性为目标的轻量近似格式。**Plain**、**Abbreviated**、**Unsorted**、**Alphabetic label**、**IEEE-like** 和 **ACM-like** 并不是完整的 BibTeX 或 CSL 实现，不适合需要严格符合出版格式的场景。

当引用键重复时，Cite 会按照笔记路径的字母顺序采用第一条记录，并在设置页面中显示重复项。

## 安装

### 社区插件

Cite 被收录到 Obsidian Community directory 后，可在 **设置 → 第三方插件** 中搜索 **Cite**。

### BRAT 或手动安装

参与测试时，可在 BRAT 中添加 `PMGWork/obsidian-cite`。手动安装时，请从对应的 GitHub Release 下载 `main.js`、`manifest.json` 和 `styles.css`，并放入 `.obsidian/plugins/cite/`。

## 隐私与安全

Cite 的所有处理都在仓库内部完成。插件不会发起网络请求，不收集遥测数据，不显示广告，也不要求注册账户。除配置的文献文件夹外，插件只会读取渲染当前笔记引用所需的内容。

## 开发

```sh
npm ci
npm run dev
```

使用 `npm run check` 执行完整的发布前检查。生产版 `main.js` 在本地生成并附加到 GitHub Release，不提交到代码仓库。

## 许可证

[MIT](LICENSE)
