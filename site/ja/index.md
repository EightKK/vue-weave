---
layout: home
title: Vue Weave
titleTemplate: Vue 3 のネットワークグラフとガントチャート

hero:
  name: Vue Weave
  text: Vue 3 のためのネットワークグラフとガントチャート
  tagline: 関係の探索、工程フロー、プロジェクト日程、リソースのタイムラインを、型付きの制御コンポーネントで作れます。グラフ・日程・リソースの計算はヘッドレスなコアで行えます。
  actions:
    - theme: brand
      text: はじめる
      link: /ja/learn/
    - theme: alt
      text: 例を見る
      link: /ja/examples/
    - theme: alt
      text: GitHub
      link: https://github.com/EightKK/vue-weave

features:
  - title: 制御コンポーネント
    details: NetworkGraph、GanttChart、TreeGrid、TaskBoard、EventCalendar はデータを書き換えません。ユーザーの編集は提案イベントになり、適用するかどうかはアプリが決めます。
  - title: 計画機能を内蔵
    details: 稼働カレンダー、依存関係、クリティカルパス、リソース負荷と平準化、実績、アーンドバリュー、計画比較。すべての日付に理由の説明が付きます。
  - title: ヘッドレスなコア
    details: レイアウト、日程計算、相互変換、SVG 出力は @eightkk/vue-weave/core から Vue なしで、Node.js、Worker、サーバーで動きます。
  - title: 連動ビュー
    details: グラフ、ガントチャート、ツリーグリッド、負荷行のどこで選択しても、エンティティの対応付けを通じて他のビューが同じ項目を強調表示します。
  - title: インポートとエクスポート
    details: Microsoft Project XML、iCalendar、CSV、Mermaid、GraphML、draw.io の相互変換と、2つの主要コンポーネントの SVG・PNG 出力。
  - title: オプトイン、アクセシブル、SSR 対応
    details: 既定はシンプルなまま、他の機能はすべてプロップで有効にします。キーボード操作と ARIA 名、ダークテーマ、右から左のレイアウト、サーバーレンダリングに対応しています。
---

<div class="vw-site-install">

## インストール

```sh
npm install @eightkk/vue-weave
```

```ts
import '@eightkk/vue-weave/style.css'
import { NetworkGraph, GanttChart } from '@eightkk/vue-weave'
```

ピア依存は Vue `^3.5.0` だけで、実行時の依存パッケージはありません。続きは[はじめに](./learn/)をご覧ください。[例](./examples/)、[ショーケース](./showcase/)、[API リファレンス](./api/)もあります。

</div>
