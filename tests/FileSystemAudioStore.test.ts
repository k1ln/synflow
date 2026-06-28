import { describe, it, expect } from 'vitest';
import { makeFlowDbKey } from '../src/util/FileSystemAudioStore';

describe('makeFlowDbKey', () => {
  it('returns flowName when no folderPath given', () => {
    expect(makeFlowDbKey('keyboard')).toBe('keyboard');
  });

  it('returns flowName when folderPath is empty string', () => {
    expect(makeFlowDbKey('keyboard', '')).toBe('keyboard');
  });

  it('prefixes with folderPath when provided', () => {
    expect(makeFlowDbKey('keyboard', 'examples')).toBe('examples/keyboard');
  });

  it('normalizes leading and trailing slashes in folderPath', () => {
    expect(makeFlowDbKey('bagpipe', '/instruments/')).toBe('instruments/bagpipe');
  });

  it('handles nested folder paths', () => {
    expect(makeFlowDbKey('beat', 'songs/drums')).toBe('songs/drums/beat');
  });

  it('uses empty result when folderPath is only slashes', () => {
    expect(makeFlowDbKey('test', '/')).toBe('test');
  });
});
