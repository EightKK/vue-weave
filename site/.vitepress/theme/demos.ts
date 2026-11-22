// Resolves the demo component that a registry entry names by path. The glob turns every demo into its own chunk, so a
// page loads only the demo it shows. Add a pattern here if a registered demo lives in another directory.
import { defineAsyncComponent, type Component } from 'vue'

const modules = import.meta.glob<{ default: Component }>(['../../../examples/*.vue', '../../../examples/showcase/*.vue'])

const components = new Map<string, Component>()

/** The demo component at a repository-relative path, such as `examples/TreeGridDemo.vue`. */
export function demoComponent(path: string): Component {
  let component = components.get(path)
  if (component) return component
  const load = modules['../../../' + path]
  if (!load) throw new Error(`The demo component is not in the glob of site/.vitepress/theme/demos.ts: ${path}`)
  component = defineAsyncComponent(() => load().then(module => module.default))
  components.set(path, component)
  return component
}
