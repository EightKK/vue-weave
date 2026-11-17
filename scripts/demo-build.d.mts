// Types for demo-build.mjs, which vite.demo.config.ts imports.

export declare const demoInputs: readonly string[]
export declare function hashDemoInputs(root: string): Promise<string>
export declare function writeDemoStamp(root: string, inputs: string): Promise<void>
export declare function demoBuildState(root: string): Promise<'missing' | 'current' | 'stale'>
export declare function dependenciesInstalled(root: string): Promise<boolean>
export declare function runNpm(args: readonly string[], root: string): Promise<boolean>
export declare function ensureDemoBuild(root: string, options?: {
  npm?: (args: readonly string[], root: string) => Promise<boolean>
  log?: Pick<Console, 'log' | 'warn' | 'error'>
}): Promise<boolean>
