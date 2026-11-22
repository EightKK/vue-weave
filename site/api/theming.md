---
title: Theming and CSS variables
description: The --vw-* custom properties, the built-in dark theme, class names, custom slot content and right-to-left layout.
---

# Theming and CSS variables

All components share one stylesheet, `@eightkk/vue-weave/style.css`. Colours, sizes and fonts are `--vw-*` CSS custom properties that you set on the component or any ancestor; the opt-in `vw-theme-dark` class switches to the built-in dark theme and `vw-theme-auto` follows `prefers-color-scheme`. Forced colours, reduced motion and print styles are included. Slots replace the drawing of nodes, bars, cards and events when properties are not enough, and `dir="rtl"` mirrors the layout for right-to-left languages.

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

The documented `--vw-*` properties and the classes you add yourself (`vw-theme-dark`, `vw-theme-auto`) are part of the [compatibility promise](./index.md#compatibility-and-versioning); the `vw-` classes the components emit are not. Every example on this site follows the site's light and dark mode with these classes.

<!--@include: ../../docs/integration.md#custom-content-->

<!--@include: ../../docs/integration.md#themes-->

<!--@include: ../../docs/integration.md#rtl-->

<!--@include: ../../docs/api.md#rtl-->
