---
title: インターチェンジとエクスポート
description: Microsoft Project XML、iCalendar、CSV、Mermaid、GraphML、draw.io の読み込みと書き出し、バージョン付き JSON スナップショット、SVG と PNG のエクスポート。
---

# インターチェンジとエクスポート

コアは、計画ツールや作図ツールがやり取りするファイル形式を読み書きします。Microsoft Project XML(タスク、リンク、カレンダー、リソース、割り当て)、iCalendar(繰り返しを含む)、CSV、Mermaid のフローチャート、GraphML(yEd を含む)、draw.io に対応しています。読み込みはコンポーネントのプロップと、読めなかった内容の警告リストを返すので、取り込む前にユーザーに示せます。バージョン付きの JSON スナップショットはチャートのデータと表示状態を保存し、`renderGraphSvg` と `renderTimelineSvg` はサーバーで SVG を作ります。コンポーネントにも `exportSvg` と `exportPng` があります。

どれも純粋で依存関係がありません。XML パーサー、DOM、ネットワークは使いません。

## 最小の例

```ts
import { fromMsProjectXml, timelineFromMsProject, toMermaid } from '@eightkk/vue-weave/core'

// Microsoft Project XML から GanttChart のプロップへ
const project = fromMsProjectXml(xmlText)
const { rows, bars, dependencies } = timelineFromMsProject(project)
if (project.warnings.length) console.warn(project.warnings)

// NetworkGraph のプロップから Mermaid のフローチャートへ
const mermaid = toMermaid({ nodes, edges })
```

**例:** インポートとエクスポートのデモは[例の一覧](/ja/examples/)にあります。**ガイド:** [ダイアグラムのファイル](../guides/graph.md#diagram-files-mermaid-graphml-and-draw-io)、[表示状態の保存と復元](../guides/data.md#saving-and-restoring-a-view)、[SVG と PNG へのエクスポート](../guides/data.md#export-to-svg-and-png)。**型:** [`fromMsProjectXml`](/ja/api/reference/core/functions/fromMsProjectXml.md)、[`toICalendar`](/ja/api/reference/core/functions/toICalendar.md)、[`fromDrawio`](/ja/api/reference/core/functions/fromDrawio.md)、[`serializeWeaveSnapshot`](/ja/api/reference/core/functions/serializeWeaveSnapshot.md)。

::: info 英語の詳細
ここから下の詳細なリファレンスは英語です。
:::

<!--@include: ../../../../docs/api.md#interchange-->

<!--@include: ../../../../docs/api.md#snapshots-->

<!--@include: ../../../../docs/api.md#export-->
