---
title: テーマと CSS 変数
description: --vw-* カスタムプロパティ、組み込みのダークテーマ、クラス名、スロットによる独自の描画、右から左へのレイアウト。
---

# テーマと CSS 変数

すべてのコンポーネントは 1 つのスタイルシート `@eightkk/vue-weave/style.css` を共有します。色、サイズ、線などは `--vw-*` の CSS カスタムプロパティで、コンポーネントかその祖先要素に設定します。オプトインの `vw-theme-dark` クラスで組み込みのダークテーマに切り替わり、`vw-theme-auto` は `prefers-color-scheme` に従います。強制カラー、動きの軽減、印刷のスタイルも含まれています。プロパティで足りないときはスロットでノード、バー、カード、予定の描画を置き換えられ、`dir="rtl"` で右から左に書く言語向けにレイアウトを反転できます。

```vue
<template>
  <div class="vw-theme-auto plan-view">
    <GanttChart :rows="rows" :bars="bars" :range="range" />
  </div>
</template>

<style>
.plan-view {
  --vw-accent: #0b7a75;
  --vw-surface: #fbfdfc;
}
</style>
```

文書化された `--vw-*` プロパティと、アプリケーションが付けるクラス(`vw-theme-dark`、`vw-theme-auto`)は[互換性の約束](./index.md#compatibility-and-versioning)の対象です。コンポーネントが出力する `vw-` クラスは対象外です。このサイトの例はすべて、これらのクラスでサイトのライト・ダークモードに合わせています。

::: info 英語の詳細
ここから下の詳細なリファレンスは英語です。
:::

<!--@include: ../../../docs/integration.md#custom-content-->

<!--@include: ../../../docs/integration.md#themes-->

<!--@include: ../../../docs/integration.md#rtl-->

<!--@include: ../../../docs/api.md#rtl-->
