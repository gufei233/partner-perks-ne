import assert from 'node:assert/strict'
import { test } from 'node:test'
import { targetServerEpoch, validateLoginWarmup } from '../src/grant/schedule.ts'

test('本地先跨过午夜时仍选择服务器即将到来的午夜', () => {
  const local = new Date(2026, 9, 12, 0, 0, 2).getTime()
  const offset = -10000
  const target = targetServerEpoch('00:00:00', local + offset)
  assert.equal(target, new Date(2026, 9, 12, 0, 0, 0).getTime())
  assert.equal(target - offset - local, 8000)
})
test('服务器目标已经过去才选择次日；立即模式保留短延迟', () => {
  const now = new Date(2026, 9, 12, 0, 0, 2).getTime()
  assert.equal(targetServerEpoch('00:00', now), new Date(2026, 9, 13, 0, 0, 0).getTime())
  assert.equal(targetServerEpoch('now', now), now + 200)
  assert.throws(() => targetServerEpoch('24:00', now), /非法/)
})
test('定时实时登录拒绝零预热，立即模式和已有会话允许零预热', () => {
  assert.throws(() => validateLoginWarmup('00:00', false, 0), /至少为 1 秒/)
  validateLoginWarmup('00:00', true, 0)
  validateLoginWarmup('now', false, 0)
  validateLoginWarmup('00:00', false, 60)
})
