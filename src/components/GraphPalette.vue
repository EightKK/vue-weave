<script setup lang="ts" generic="D = unknown">
// A list of node templates for a diagram editor. Items are HTML5-draggable onto a NetworkGraph with `droppable` (the
// payload is JSON under `graphPaletteMimeType`; read it with `readPaletteDrop`), and Enter or Space on a focused item
// emits `insert`, because HTML drag and drop needs a pointer. The palette never changes the graph itself.
import { computed, nextTick, ref, useId, watch } from 'vue'
import {
  checkPaletteItems, graphPaletteMimeType, palettePayload, paletteSections, type GraphPaletteItem, type GraphPaletteLabels,
} from '../core/diagramEditor.js'
import { graphOutlineElement, graphOutlineShape, graphPolygonPoints } from '../core/graphShapes.js'
import type { ChartDirection } from '../core/types.js'

const props = withDefaults(defineProps<{
  items: readonly GraphPaletteItem<D>[]
  /** Shows a filter box above the list. */
  searchable?: boolean
  labels?: Partial<GraphPaletteLabels>
  /** `rtl` writes `dir="rtl"` and adds `vw-rtl`; `auto` follows the inherited direction. Default `ltr`. */
  dir?: ChartDirection
}>(), { searchable: false, dir: 'ltr' })

const emit = defineEmits<{
  /** Enter or Space on an item: the keyboard alternative to dragging it. The parent adds the node, for example at the viewport centre. */
  insert: [item: GraphPaletteItem<D>]
}>()

defineSlots<{
  /** Replaces the preview, label and detail of an item. */
  item?(props: { item: GraphPaletteItem<D>; active: boolean }): unknown
}>()

const messages = computed<GraphPaletteLabels>(() => ({
  region: 'Shape palette', search: 'Filter shapes', noMatches: 'No shapes match the filter.', ...props.labels,
}))
const base = useId()
const listId = base + '-list'
const query = ref('')
const activeId = ref<string>()
const listElement = ref<HTMLElement>()

const sections = computed(() => {
  checkPaletteItems(props.items)
  return paletteSections(props.items, props.searchable ? query.value : '')
})
const shown = computed(() => sections.value.flatMap(section => section.items))
// The item that takes the tab stop: the last focused one while it is shown, else the first shown item.
const current = computed(() => shown.value.find(item => item.id === activeId.value) ?? shown.value[0])
watch(() => props.searchable, searchable => { if (!searchable) query.value = '' })

const optionId = (index: number) => base + '-item-' + index
const indexOf = computed(() => new Map(props.items.map((item, index) => [item.id, index])))

function preview(item: GraphPaletteItem<D>) {
  const outline = graphOutlineShape(item)
  if (!outline) return { tag: 'rect' as const, rx: item.shape === 'rounded' ? 10 : 4 }
  const element = graphOutlineElement(outline, 48, 30)
  if (element.tag === 'polygon') return { tag: 'polygon' as const, points: graphPolygonPoints(element.points) }
  return element
}

async function focusItem(id?: string) {
  const item = id === undefined ? current.value : shown.value.find(candidate => candidate.id === id)
  if (!item) return false
  activeId.value = item.id
  await nextTick()
  listElement.value?.querySelector<HTMLElement>(`[id="${optionId(indexOf.value.get(item.id)!)}"]`)?.focus()
  return true
}

function move(item: GraphPaletteItem<D>, key: string) {
  const list = shown.value
  const at = list.indexOf(item)
  const next = key === 'Home' ? 0 : key === 'End' ? list.length - 1 : key === 'ArrowDown' ? Math.min(list.length - 1, at + 1) : Math.max(0, at - 1)
  void focusItem(list[next]?.id)
}

function onItemKeydown(event: KeyboardEvent, item: GraphPaletteItem<D>) {
  if (event.altKey || event.ctrlKey || event.metaKey) return
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    move(item, event.key)
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (!event.repeat && !item.disabled) emit('insert', item)
  }
}

function onSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' && shown.value.length) {
    event.preventDefault()
    void focusItem(shown.value[0]!.id)
  } else if (event.key === 'Escape' && query.value) {
    event.preventDefault()
    event.stopPropagation()
    query.value = ''
  }
}

function onDragStart(event: DragEvent, item: GraphPaletteItem<D>) {
  if (item.disabled || !event.dataTransfer) {
    event.preventDefault()
    return
  }
  activeId.value = item.id
  event.dataTransfer.setData(graphPaletteMimeType, palettePayload(item))
  event.dataTransfer.setData('text/plain', item.label)
  event.dataTransfer.effectAllowed = 'copy'
}

defineExpose({
  /** Moves keyboard focus to an item (default: the one with the tab stop). Resolves to false when it is not shown. */
  focusItem,
})
</script>

<template>
  <div class="vw-palette" :class="{ 'vw-rtl': dir === 'rtl' }" :dir="dir === 'rtl' ? 'rtl' : undefined">
    <input v-if="searchable" v-model="query" class="vw-palette-search" type="search" autocomplete="off"
      :aria-label="messages.search" :placeholder="messages.search" :aria-controls="listId" @keydown="onSearchKeydown">
    <div :id="listId" ref="listElement" class="vw-palette-list" role="listbox" :aria-label="messages.region" aria-orientation="vertical">
      <template v-for="(section, sectionIndex) in sections" :key="section.title ?? '\u0000'">
        <div :role="section.title === undefined ? 'presentation' : 'group'" class="vw-palette-section"
          :aria-labelledby="section.title === undefined ? undefined : base + '-section-' + sectionIndex">
          <div v-if="section.title !== undefined" :id="base + '-section-' + sectionIndex" class="vw-palette-heading" role="presentation">{{ section.title }}</div>
          <div v-for="item in section.items" :id="optionId(indexOf.get(item.id)!)" :key="item.id" role="option"
            class="vw-palette-item" :class="{ 'vw-is-active': current?.id === item.id, 'vw-is-disabled': item.disabled }"
            :tabindex="current?.id === item.id ? 0 : -1" :aria-selected="current?.id === item.id"
            :aria-disabled="item.disabled ? 'true' : undefined" :draggable="item.disabled ? 'false' : 'true'"
            @focus="activeId = item.id" @keydown="onItemKeydown($event, item)" @dragstart="onDragStart($event, item)">
            <slot name="item" :item="item" :active="current?.id === item.id">
              <svg class="vw-palette-preview" :class="'vw-tone-' + (item.tone ?? 'blue')" viewBox="0 0 48 30" width="48" height="30" aria-hidden="true" focusable="false">
                <template v-for="shape in [preview(item)]" :key="0">
                  <rect v-if="shape.tag === 'rect'" x="2" y="2" width="44" height="26" :rx="shape.rx" />
                  <ellipse v-else-if="shape.tag === 'ellipse'" :cx="shape.cx" :cy="shape.cy" :rx="shape.rx" :ry="shape.ry" />
                  <polygon v-else-if="shape.tag === 'polygon'" :points="shape.points" />
                  <path v-else :d="shape.d" />
                </template>
              </svg>
              <span class="vw-palette-text">
                <span class="vw-palette-label">{{ item.label }}</span>
                <span v-if="item.detail" class="vw-palette-detail">{{ item.detail }}</span>
              </span>
            </slot>
          </div>
        </div>
      </template>
    </div>
    <p v-if="!shown.length && items.length" class="vw-palette-empty" role="status">{{ messages.noMatches }}</p>
  </div>
</template>
