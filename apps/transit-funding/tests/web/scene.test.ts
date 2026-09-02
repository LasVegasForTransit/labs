import { describe, expect, it } from 'vitest';
import { sceneFromRatios } from '../../src/story/useSceneState.ts';

describe('sceneFromRatios()', () => {
  it('selects the scene with the greatest visible share', () => {
    expect(sceneFromRatios([0.1, 0.8, 0.0])).toBe(1);
  });

  it('holds the previous scene when nothing is visible', () => {
    expect(sceneFromRatios([0, 0, 0], 2)).toBe(2);
  });

  it('starts at the first scene when nothing is visible and there is no previous', () => {
    expect(sceneFromRatios([0, 0, 0])).toBe(0);
  });

  it('breaks a tie towards the earlier scene, so scrolling back is stable', () => {
    expect(sceneFromRatios([0.5, 0.5])).toBe(0);
  });

  it('ignores a previous scene when something is visible', () => {
    expect(sceneFromRatios([0.9, 0, 0], 2)).toBe(0);
  });
});
