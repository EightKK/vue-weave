---
title: Errors and validation
description: The ID rule, error classes and message formats shared by the core functions and the component prop checks.
---

# Errors and validation

Every public function and component validates its input at the boundary. Invalid numbers and geometry throw a `RangeError`; bad references, invalid or duplicate IDs and cycles throw an `Error`. Scheduling failures such as cycles and infeasible plans are returned as results instead of thrown. A component reports invalid props through its `validation-error` event, renders its empty state and rethrows the error.

Branch on the error class and on the `code` and `id` fields of diagnostics, never on message text: the texts below help people read logs, but they can change in a minor release.

```ts
import { scheduleTasks } from '@eightkk/vue-weave/core'

try {
  const result = scheduleTasks(input)
  if (!result.ok) showDiagnostics(result) // cycles and infeasible plans are results
} catch (error) {
  if (error instanceof RangeError) reportBadNumber(error) // non-finite times, inverted ranges
  else throw error // bad references, duplicate IDs
}
```

See also [Planning diagnostics and schedule traces](./core/scheduling.md#planning-diagnostics-and-schedule-traces) for the diagnostics of a plan, and the `validateEdit`, `validateConnection` and `validateCellEdit` props of the components for rejecting user edits.

<!--@include: ../../docs/api.md#validation-->
