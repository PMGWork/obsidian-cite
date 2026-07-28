# Cite

[English](README.md) | [简体中文](README_zh.md)

Citeは、ノート内のBibTeXを参照し、LaTeX形式またはPandoc形式の引用を表示して文献ノートへリンクするObsidianプラグインです。Live Previewと閲覧ビューに対応し、引用キーの補完と簡易文献一覧を利用できます。

> Cite 0.1.2にはObsidian 1.12.7以降が必要です。デスクトップ、iOS、Androidに対応します。

## 機能

- `\cite{key}` または `[@key]` を番号付き内部リンクとして表示
- キーまたはタイトルによる引用キー補完
- `\bibliography` の位置に文献一覧を表示
- 1つの文献ノートに含まれる複数のBibTeXエントリを解決
- 文献ノートの作成・編集・移動・削除時に索引を自動更新
- Obsidianの表示言語に合わせて設定画面を英語・日本語・簡体字中国語で表示
- コード、frontmatter、数式内の記述は変換対象外

## 設定方法

1. **設定 → Cite** を開き、**Reference folder** に文献ノートのフォルダを指定します。空欄の場合、CiteはVault全体を走査せず、索引を作成しません。
2. 指定したフォルダ内のMarkdownノートに、`bibtex`コードブロックを追加します。

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

3. 別のノートに引用を記述します。

   ```text
   先行研究ではこの問題が議論されている \cite{doe2026}。
   ```

4. 文献一覧を表示する位置に、独立した段落として `\bibliography` を記述します。

設定で **Pandoc** を選ぶと、`[@doe2026]` または `[@doe2026; @smith2025]` を使用できます。ページ指定、prefix、suffix、著者名を抑制するPandoc引用は、このバージョンでは対応していません。

## BibTeX対応範囲

`article`、`book`、`inproceedings`／`conference`、`incollection`、`inbook`、`proceedings`、`misc`と、その他のフォールバック形式に対応します。波括弧または引用符で囲まれた値は、複数行や入れ子の波括弧を含められます。1つのコードブロックに複数のエントリを記述できます。

BibTeXの文字列マクロ、`#`による連結、`crossref`による継承、LaTeXの文字装飾コマンドは評価しません。未対応の記述が外部へ送信されることはありません。

文献スタイルは、**Plain / jplain**、**Abbreviated / jabbrv**、**Unsorted / junsrt**、**Alphabetic label**、**IEEE Transactions**、**ACM**、**SIAM**、**APA-like**に対応しています。Plain系、Alpha、ACM、SIAM、APA-likeは著者順、UnsortedとIEEE Transactionsは引用順に並びます。

引用キーが重複した場合は、ノートパスのアルファベット順で最初のエントリを採用し、重複内容を設定画面に表示します。

## インストール

### コミュニティプラグイン

Obsidian Community directoryへの登録後、**設定 → コミュニティプラグイン** で **Cite** を検索してください。

### BRATまたは手動インストール

ベータテストでは、BRATに `PMGWork/obsidian-cite` を追加します。手動でインストールする場合は、対応するGitHub Releaseから `main.js`、`manifest.json`、`styles.css` をダウンロードし、`.obsidian/plugins/cite/` に配置してください。

## プライバシーとセキュリティ

Citeの処理はすべてVault内で完結します。ネットワーク通信、テレメトリ、広告、アカウント登録はありません。設定した文献フォルダ以外では、現在表示しているノートの引用レンダリングに必要な内容のみを読み取ります。

## 開発

```sh
npm ci
npm run dev
```

リリース前の全チェックは `npm run check` で実行できます。production版の `main.js` はローカルで生成し、レビュー用にコミットしてGitHub Releaseへ添付します。

## ライセンス

[MIT](LICENSE)
