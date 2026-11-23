<script setup lang="ts">
// A network graph and a Gantt chart on one data set, with a switch between the four data sets of data.ts. The view
// itself is in components/GraphGanttView.vue.
import GraphGanttView from './components/GraphGanttView.vue'

const datasets = ['manufacturing', 'project', 'scale', 'large']
</script>

<template>
  <GraphGanttView :datasets="datasets" theme-switch />
</template>
