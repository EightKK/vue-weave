<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  NetworkGraph, graphConnectionViolations, type GraphConnection, type GraphEdge, type GraphPortRules, type GraphReconnect, type NetworkNode,
} from '../src'
import { unusedNumber } from './ids'

// Opt-in example of NetworkGraph `connectionRules`: each named port declares a type, a direction and a connection
// limit. Broken rules are rejected with their reason, and while a connection is dragged the handles show which ports
// are valid targets.
const nodes: NetworkNode[] = [
  { id: 'sensor', label: 'Sensor', ports: [{ id: 'reading', side: 'right', label: 'Reading' }] },
  { id: 'backup', label: 'Backup sensor', ports: [{ id: 'reading', side: 'right', label: 'Reading' }] },
  { id: 'title', label: 'Title', ports: [{ id: 'text', side: 'right', label: 'Text' }] },
  {
    id: 'average', label: 'Average', ports: [
      { id: 'a', side: 'left', label: 'Input A', offset: 0.3 }, { id: 'b', side: 'left', label: 'Input B', offset: 0.7 },
      { id: 'out', side: 'right', label: 'Result' },
    ],
  },
  { id: 'display', label: 'Display', ports: [{ id: 'in', side: 'left', label: 'Show' }] },
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
const initialEdges: GraphEdge[] = [{ id: 'reading-a', label: 'reading', from: 'sensor', fromPort: 'reading', to: 'average', toPort: 'a' }]
const edges = ref<GraphEdge[]>(initialEdges)
const status = ref('Drag from an output port; valid inputs are highlighted.')
const audit = computed(() => {
  const count = graphConnectionViolations(nodes, edges.value, rules).length
  return count ? count + ' rule violations' : 'No rule violations'
})

function commitConnection(connection: GraphConnection) {
  const number = unusedNumber(edges.value, 'typed-', edges.value.length + 1)
  edges.value = [...edges.value, { id: 'typed-' + number, ...connection }]
  status.value = 'Connected ' + connection.from + ' to ' + connection.to + '.'
}
function commitReconnect(change: GraphReconnect) {
  edges.value = edges.value.map(edge => edge.id === change.id ? { ...edge, fromPort: undefined, toPort: undefined, ...change.after } : edge)
  status.value = 'Reconnected ' + change.id + '.'
}
function reset() {
  edges.value = initialEdges
  status.value = 'Example reset.'
}
</script>

<template>
  <div class="port-rules-demo" role="group" aria-label="Typed port example">
    <p class="hint">Typed ports: Reading and Result carry numbers, Title carries text. Average inputs accept one number each; Display accepts two numbers or text. <button type="button" @click="reset">Reset typed ports</button></p>
    <NetworkGraph :nodes="nodes" :edges="edges" :height="230" connectable reconnectable :connection-rules="rules"
      :labels="{ region: 'Typed port graph' }" @connect="commitConnection" @reconnect="commitReconnect"
      @connect-rejected="(_connection, reason) => status = 'Rejected: ' + reason" />
    <p role="status" aria-label="Typed port status">{{ status }}</p>
    <p class="hint">{{ audit }}</p>
  </div>
</template>
