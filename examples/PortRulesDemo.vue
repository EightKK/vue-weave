<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  NetworkGraph, graphConnectionViolations, type GraphConnection, type GraphEdge, type GraphPortRules, type GraphReconnect, type NetworkNode,
} from '../src'
import { unusedNumber } from './ids'
import { useDemoLocale } from './i18n'

const { t, labels } = useDemoLocale()

// Opt-in example of NetworkGraph `connectionRules`: each named port declares a type, a direction and a connection
// limit. Broken rules are rejected with their reason, and while a connection is dragged the handles show which ports
// are valid targets.
const nodes: NetworkNode[] = [
  { id: 'sensor', label: t({ en: 'Sensor', ja: 'センサー' }), ports: [{ id: 'reading', side: 'right', label: t({ en: 'Reading', ja: '測定値' }) }] },
  { id: 'backup', label: t({ en: 'Backup sensor', ja: '予備センサー' }), ports: [{ id: 'reading', side: 'right', label: t({ en: 'Reading', ja: '測定値' }) }] },
  { id: 'title', label: t({ en: 'Title', ja: 'タイトル' }), ports: [{ id: 'text', side: 'right', label: t({ en: 'Text', ja: 'テキスト' }) }] },
  {
    id: 'average', label: t({ en: 'Average', ja: '平均' }), ports: [
      { id: 'a', side: 'left', label: t({ en: 'Input A', ja: '入力 A' }), offset: 0.3 }, { id: 'b', side: 'left', label: t({ en: 'Input B', ja: '入力 B' }), offset: 0.7 },
      { id: 'out', side: 'right', label: t({ en: 'Result', ja: '結果' }) },
    ],
  },
  { id: 'display', label: t({ en: 'Display', ja: '表示' }), ports: [{ id: 'in', side: 'left', label: t({ en: 'Show', ja: '表示する値' }) }] },
]
const rules: GraphPortRules = {
  ports: {
    sensor: { reading: { type: 'number', direction: 'out' } },
    backup: { reading: { type: 'number', direction: 'out' } },
    title: { text: { type: 'text', direction: 'out' } },
    average: {
      a: { type: 'number', direction: 'in', maxConnections: 1 },
      b: { type: 'number', direction: 'in', maxConnections: 1 },
      out: { type: 'number', direction: 'out' },
    },
    display: { in: { type: ['number', 'text'], direction: 'in', maxConnections: 2 } },
  },
}
const initialEdges: GraphEdge[] = [{ id: 'reading-a', label: t({ en: 'reading', ja: '測定値' }), from: 'sensor', fromPort: 'reading', to: 'average', toPort: 'a' }]
const edges = ref<GraphEdge[]>(initialEdges)
const status = ref(t({ en: 'Drag from an output port; valid inputs are highlighted.', ja: '出力ポートからドラッグすると、接続できる入力が強調表示されます。' }))
const audit = computed(() => {
  const count = graphConnectionViolations(nodes, edges.value, rules).length
  return count ? t({ en: count + ' rule violations', ja: 'ルール違反 ' + count + ' 件' }) : t({ en: 'No rule violations', ja: 'ルール違反はありません' })
})

function commitConnection(connection: GraphConnection) {
  const number = unusedNumber(edges.value, 'typed-', edges.value.length + 1)
  edges.value = [...edges.value, { id: 'typed-' + number, ...connection }]
  status.value = t({ en: 'Connected ' + connection.from + ' to ' + connection.to + '.', ja: connection.from + ' を ' + connection.to + ' に接続しました。' })
}
function commitReconnect(change: GraphReconnect) {
  edges.value = edges.value.map(edge => edge.id === change.id ? { ...edge, fromPort: undefined, toPort: undefined, ...change.after } : edge)
  status.value = t({ en: 'Reconnected ' + change.id + '.', ja: change.id + ' をつなぎ替えました。' })
}
function reset() {
  edges.value = initialEdges
  status.value = t({ en: 'Example reset.', ja: '例を初期状態に戻しました。' })
}
</script>

<template>
  <div class="port-rules-demo" role="group" :aria-label="t({ en: 'Typed port example', ja: '型付きポートの例' })">
    <p class="hint">{{ t({ en: 'Typed ports: Reading and Result carry numbers, Title carries text. Average inputs accept one number each; Display accepts two numbers or text.', ja: '型付きポート: 測定値と結果は数値、タイトルはテキストを送ります。平均の入力はそれぞれ数値を1つ、表示は数値かテキストを2つまで受け取ります。' }) }} <button type="button" @click="reset">{{ t({ en: 'Reset typed ports', ja: '型付きポートをリセット' }) }}</button></p>
    <NetworkGraph :nodes="nodes" :edges="edges" :height="230" connectable reconnectable :connection-rules="rules"
      :labels="{ ...labels.graph, region: t({ en: 'Typed port graph', ja: '型付きポートのグラフ' }) }" @connect="commitConnection" @reconnect="commitReconnect"
      @connect-rejected="(_connection, reason) => status = t({ en: 'Rejected: ', ja: '却下: ' }) + reason" />
    <p role="status" :aria-label="t({ en: 'Typed port status', ja: '型付きポートの状態' })">{{ status }}</p>
    <p class="hint">{{ audit }}</p>
  </div>
</template>
