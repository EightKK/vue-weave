// Demo localization. The documentation site provides the page language to every demo (`provideDemoLocale` in the
// example frame); the legacy gallery and the browser tests that do not provide one get English. Demos read the language
// with `useDemoLocale()`, pick their own text with `t({ en, ja })`, and pass `componentLabels(locale).gantt` and so on
// to the components' `labels` props, so a Japanese page shows Japanese buttons, hints and accessible names.
import { computed, inject, provide, ref, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import type {
  EventCalendarLabels, GanttLabels, GraphLabels, GraphPaletteLabels, PropertyInspectorLabels, TaskBoardLabels, TreeGridLabels,
} from '../src'

export type DemoLocale = 'en' | 'ja'

const localeKey: InjectionKey<Readonly<Ref<DemoLocale>>> = Symbol('vw-demo-locale')

/** Makes `locale` the language of every demo below the calling component. */
export function provideDemoLocale(locale: Readonly<Ref<DemoLocale>>) {
  provide(localeKey, locale)
}

/** Text in both languages; `t` picks the one of the current page. */
export interface Localized<T = string> {
  en: T
  ja: T
}

export function useDemoLocale() {
  const locale = inject(localeKey, ref<DemoLocale>('en'))
  const t = <T>(text: Localized<T>): T => text[locale.value]
  const labels: ComputedRef<ComponentLabels> = computed(() => componentLabels(locale.value))
  return {
    locale,
    isJapanese: computed(() => locale.value === 'ja'),
    /** Picks the text of the page language. */
    t,
    /** The components' `labels` for the page language: `{}` (the built-in English) or the Japanese set. */
    labels,
    /** `Intl` locale tag for number and date formatting. */
    intlLocale: computed(() => (locale.value === 'ja' ? 'ja-JP' : 'en-US')),
  }
}

export interface ComponentLabels {
  gantt: Partial<GanttLabels>
  graph: Partial<GraphLabels>
  treeGrid: Partial<TreeGridLabels>
  taskBoard: Partial<TaskBoardLabels>
  eventCalendar: Partial<EventCalendarLabels>
  palette: Partial<GraphPaletteLabels>
  inspector: Partial<PropertyInspectorLabels>
}

const english: ComponentLabels = Object.freeze({
  gantt: {}, graph: {}, treeGrid: {}, taskBoard: {}, eventCalendar: {}, palette: {}, inspector: {},
})

// Japanese text for every built-in label. Labels that a demo also sets itself (such as `region`) are overridden there.
const japanese: ComponentLabels = Object.freeze({
  gantt: {
    region: 'ガントチャート', rows: '行', empty: '表示する行がありません',
    zoom: 'タイムラインの拡大率', zoomIn: '拡大', zoomOut: '縮小',
    editHint: '矢印キーで移動、Shift で終了を、Alt で開始を伸縮します。Escape で取り消します。',
    expandRow: '展開', collapseRow: '折りたたむ', baseline: 'ベースライン',
    baselineStart: '開始', baselineFinish: '終了', baselineDuration: '期間',
    rejected: 'この変更は却下されました。',
    connectFrom: '依存関係の起点:', connectTo: '依存関係の接続先:', startOf: '開始', finishOf: '終了',
    selectDependency: '依存関係を選択', reconnectSource: '起点をつなぎ替え:', reconnectTarget: '接続先をつなぎ替え:',
    connectionRejected: 'この依存関係は却下されました。', zoomPresets: '表示単位', now: '現在',
    loadRegion: '資源負荷', load: '負荷', capacity: '能力', overload: '超過',
    moveRowHint: '上下の矢印キーでバーを別の行へ移動します。',
    critical: 'クリティカル', float: '余裕の期限', deadline: '期限', late: '遅延',
    progressOf: '進捗:', deleteHint: 'Delete または Backspace でバーを削除します。',
    createIn: 'バーを追加:', createRejected: 'この新しいバーは却下されました。',
    moveRow: '行を移動', rowMoveRejected: 'この行の移動は却下されました。', statusDate: '基準日',
    resizeColumn: '列幅を変更', columnResizeRejected: 'この列幅の変更は却下されました。', lag: 'ラグ',
    sortBy: '並べ替え:', sortedAscending: '昇順', sortedDescending: '降順', filterBy: '絞り込み', filtered: '絞り込み中',
    filterContains: '含む文字', filterValues: '表示する値', clearFilter: '絞り込みを解除',
    startNoEarlierThan: '開始日以降に開始', startNoLaterThan: '開始日以前に開始', finishNoEarlierThan: '終了日以降に終了',
    finishNoLaterThan: '終了日以前に終了', fixedStart: '指定日に開始', constraintViolated: '違反',
    constraintHint: '矢印キーで制約を1スナップ分、Shift+矢印と Page キーで1目盛り分動かします。Delete で削除、Escape でドラッグを取り消します。',
    constraintRejected: 'この制約の変更は却下されました。',
    sheetHint: '矢印キーで移動、Shift で選択を広げます。Enter、F2 または文字入力で編集、Delete で消去、Ctrl+D で下へ複写します。',
    sheetReadOnly: '読み取り専用のセルです。',
    sheetRagged: '貼り付ける行のセル数をそろえてください。',
    sheetOutside: '貼り付けるセルが表の外にはみ出します。',
    sheetRejected: 'この表の変更は却下されました。',
    moveRowKeysHint: 'Alt+上下キーで同じ階層の中を移動、Alt+Shift+左右キーでインデント・アウトデントします。ドラッグでも移動でき、Escape で取り消します。',
  },
  graph: {
    region: 'ネットワーク図', empty: '表示するノードがありません', zoom: '図の拡大率',
    zoomIn: '拡大', zoomOut: '縮小', fit: '全体を表示',
    minimap: '図の全体表示で移動', connectFrom: '接続の起点:', connectTo: '接続先:',
    reconnectSource: '起点をつなぎ替え:', reconnectTarget: '接続先をつなぎ替え:', moveGroup: 'グループを移動',
    rejected: 'この接続は却下されました。', selectEdge: '辺を選択', groupWithin: '所属',
    deleteRejected: 'この削除は却下されました。', collapseGroup: 'グループを折りたたむ', expandGroup: 'グループを展開',
    collapsedNode: 'ノード', collapsedNodes: 'ノード', moveWaypoint: '経由点を移動', addWaypoint: '経由点を追加',
    reshapeRejected: 'この辺の変更は却下されました。', resizeNode: 'サイズ変更', topLeft: '左上', topRight: '右上',
    bottomLeft: '左下', bottomRight: '右下', resizeRejected: 'このサイズ変更は却下されました。',
    editLabel: 'ラベルを編集:', labelRejected: 'このラベルの変更は却下されました。', nodeToolbar: 'ノードの操作', edgeToolbar: '辺の操作',
  },
  treeGrid: {
    grid: 'ツリーグリッド', treeColumn: '名前', empty: '表示する行がありません',
    keyboardHint: '矢印キーでセル間を移動、左右キーで行を展開・折りたたみ、Enter で選択します。',
    expand: '展開', collapse: '折りたたむ',
    none: 'なし', unknown: '不明', notApplicable: '対象外', unloaded: '未取得', loading: '読み込み中…', failed: '読み込みに失敗',
    yes: 'はい', no: 'いいえ',
    edit: '編集:', for: '/', editRejected: 'この変更は却下されました。', sheetRejected: 'この変更は却下されました。',
    pasteTooLarge: '貼り付けるセルがグリッドに収まりません。', fillHandle: '下へ複写',
    addBelow: '下に行を追加:', addChild: '子の行を追加:', deleteRow: '削除:', moveRow: '移動:', rowActions: '行の操作:',
    moveBefore: 'の前へ', moveAfter: 'の後へ', moveInto: 'の中へ',
    rowCreateRejected: '新しい行は却下されました。', rowDeleteRejected: 'この削除は却下されました。', rowMoveRejected: 'この行の移動は却下されました。',
    rowMoveHint: 'Alt+上下キーで行を移動、Alt+Shift+矢印でインデント・アウトデントします。Ctrl+Enter で下に行を、Ctrl+Shift+Enter で子の行を追加し、Delete で行を削除します。',
    resizeColumn: '列幅を変更', columnResizeRejected: 'この列幅の変更は却下されました。',
    sortBy: '並べ替え:', sortedAscending: '昇順', sortedDescending: '降順', filterBy: '絞り込み', filtered: '絞り込み中',
    filterContains: '含む文字', filterValues: '表示する値', clearFilter: '絞り込みを解除',
  },
  taskBoard: {
    region: 'タスクボード', empty: '表示する列がありません', emptyCell: 'カードなし', card: '枚', cards: '枚', wipLimit: 'WIP 上限',
    overLimit: 'WIP 上限超過', wipMin: 'WIP 下限', underMinimum: 'WIP 下限未満', collapse: '折りたたむ', expand: '展開',
    moveHint: 'Space でカードを持ち上げ、矢印キーで移動し、Space または Enter で置きます。Escape で取り消します。',
    moveRejected: 'このカードの移動は却下されました。', pickedUp: '持ち上げました', moved: '移動しました', moveCancelled: '移動を取り消しました。',
    position: '位置', of: '/', lane: 'レーン',
  },
  eventCalendar: {
    region: 'イベントカレンダー', previous: '前へ', today: '今日', next: '次へ', views: 'カレンダーの表示',
    day: '日', week: '週', month: '月', allDay: '終日', more: '件', showDay: 'この日を表示',
    editHint: '上下の矢印キーで予定を移動し、Shift で終了を伸縮します。左右キーで別の日や資源へ移動します。Escape でドラッグを取り消します。',
    dayEditHint: '左右の矢印キーで予定を1日ずつ移動し、Shift で終了を伸縮します。Escape でドラッグを取り消します。',
    monthEditHint: '左右の矢印キーで1日、上下キーで1週ずつ移動し、Shift+左右で終日予定の終了を伸縮します。Escape でドラッグを取り消します。',
    rejected: 'この変更は却下されました。', createRejected: 'この新しい予定は却下されました。',
    resources: '資源', now: '現在', empty: '表示する予定がありません', recurring: '繰り返し',
  },
  palette: { region: '図形パレット', search: '図形を絞り込む', noMatches: '一致する図形がありません。' },
  inspector: {
    region: 'プロパティ', empty: '何も選択されていません。', rejected: 'この変更は却下されました。', none: '(なし)',
    resource: '資源', units: '単位数', predecessor: '先行タスク', type: '種類', lag: 'ラグ', for: '/', remove: '削除',
    addAssignment: '割り当てを追加', addDependency: '依存関係を追加', noRows: 'なし',
  },
})

/** The components' `labels` for a language. Spread a demo's own labels after them: `{ ...labels.gantt, region: … }`. */
export function componentLabels(locale: DemoLocale): ComponentLabels {
  return locale === 'ja' ? japanese : english
}
