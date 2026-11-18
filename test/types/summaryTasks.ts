// Type-level checks for summary tasks. Checked by `npm run typecheck`.
import { scheduleTasks, type ScheduleInput, type ScheduleTask } from '../../src/core/index'

declare const input: ScheduleInput

const subtask: ScheduleTask = { id: 'a', duration: 1, parentId: 'S' }
// @ts-expect-error parentId is a task ID
const numbered: ScheduleTask = { id: 'b', duration: 1, parentId: 1 }
void subtask
void numbered

const result = scheduleTasks(input)
if (result.ok) {
  const summary: true | undefined = result.tasks[0]?.summary
  const parentId: string | undefined = result.tasks[0]?.parentId
  void summary
  void parentId
}
