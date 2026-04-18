import { describe, expect, test } from 'bun:test'
import { planUpdate } from './update'
import type { Task } from '../../kernel/types'

function makeTask(overrides: Partial<Task> & { state: Task['state'] }): Task {
  return {
    id: 'T-1',
    identifier: 'WOR-1',
    title: '',
    description: '',
    labels: [],
    priority: null,
    repo: 'x/y',
    baseBranch: 'main',
    ...overrides,
  } as Task
}

describe('planUpdate', () => {
  test('already-latest when running version >= npm latest', () => {
    const plan = planUpdate({
      current: '0.0.5',
      latest: '0.0.5',
      daemonPid: null,
      activeTasks: [],
    })
    expect(plan.kind).toBe('already-latest')
  })

  test('already-latest even when newer local dev version', () => {
    const plan = planUpdate({
      current: '0.1.0',
      latest: '0.0.9',
      daemonPid: 12345,
      activeTasks: [],
    })
    expect(plan.kind).toBe('already-latest')
  })

  test('no-daemon when update available and no pid', () => {
    const plan = planUpdate({
      current: '0.0.4',
      latest: '0.0.5',
      daemonPid: null,
      activeTasks: [],
    })
    expect(plan.kind).toBe('no-daemon')
    if (plan.kind === 'no-daemon') {
      expect(plan.current).toBe('0.0.4')
      expect(plan.latest).toBe('0.0.5')
    }
  })

  test('idle-daemon when daemon running but no active tasks', () => {
    const plan = planUpdate({
      current: '0.0.4',
      latest: '0.0.5',
      daemonPid: 42,
      activeTasks: [],
    })
    expect(plan.kind).toBe('idle-daemon')
    if (plan.kind === 'idle-daemon') expect(plan.pid).toBe(42)
  })

  test('idle-daemon ignores non-active tasks', () => {
    const plan = planUpdate({
      current: '0.0.4',
      latest: '0.0.5',
      daemonPid: 42,
      activeTasks: [],
    })
    expect(plan.kind).toBe('idle-daemon')
  })

  test('active-daemon when active tasks present', () => {
    const tasks = [
      makeTask({ identifier: 'WOR-42', state: 'active' }),
      makeTask({ id: 'T-2', identifier: 'WOR-43', state: 'active' }),
    ]
    const plan = planUpdate({
      current: '0.0.4',
      latest: '0.0.5',
      daemonPid: 42,
      activeTasks: tasks,
    })
    expect(plan.kind).toBe('active-daemon')
    if (plan.kind === 'active-daemon') {
      expect(plan.pid).toBe(42)
      expect(plan.active).toHaveLength(2)
    }
  })
})
