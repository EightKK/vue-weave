---
title: エラーと検証
description: コア関数とコンポーネントのプロップ検査に共通の ID ルール、エラーのクラス、メッセージの形式。
---

# エラーと検証

公開されている関数とコンポーネントは、入口で入力を検証します。不正な数値やジオメトリは `RangeError`、不正な参照、不正または重複した ID、循環は `Error` を投げます。循環や実行不可能な計画などのスケジューリングの失敗は、例外ではなく結果として返ります。コンポーネントは不正なプロップを `validation-error` イベントで知らせ、空の状態を描いてからエラーを再送出します。

分岐にはエラーのクラスと、診断の `code` と `id` を使い、メッセージの文面は使わないでください。下の文面はログを読む人のためのもので、マイナーリリースで変わることがあります。

```ts
import { scheduleTasks } from '@eightkk/vue-weave/core'

try {
  const result = scheduleTasks(input)
  if (!result.ok) showDiagnostics(result) // 循環や実行不可能な計画は結果として返る
} catch (error) {
  if (error instanceof RangeError) reportBadNumber(error) // 有限でない時刻、逆転した範囲
  else throw error // 不正な参照、重複した ID
}
```

計画の診断は[計画の診断とスケジュールのトレース](./core/scheduling.md#planning-diagnostics-and-schedule-traces)を、ユーザーの編集を拒否する方法は各コンポーネントの `validateEdit`、`validateConnection`、`validateCellEdit` を参照してください。

::: info 英語の詳細
ここから下の詳細なリファレンスは英語です。
:::

<!--@include: ../../../docs/api.md#validation-->
