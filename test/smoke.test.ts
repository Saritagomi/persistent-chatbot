import { describe, expect, it } from 'vitest'
import * as core from '../src/core'

describe('package', () => {
  it('core entry loads', () => {
    expect(core).toBeTypeOf('object')
  })
})
