// TypeDoc reads src/ with the plain TypeScript compiler, which cannot read Vue single-file components. This declaration
// gives every .vue import a generic component type so that the two entry files compile. The component pages of the
// site document the props, events, slots and exposed methods instead.
declare module '*.vue' {
  const component: <T = unknown, U = unknown, V = unknown>(...args: unknown[]) => { __ctx?: { props: Record<string, unknown>; slots: Record<string, unknown>; emit: (...args: unknown[]) => void; expose: (exposed: Record<string, unknown>) => void } } & { T?: T; U?: U; V?: V }
  export default component
}
