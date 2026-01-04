// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MidiKnobFlowNode from '../src/nodes/MidiKnobFlowNode';

describe('MidiKnobFlowNode', () => {
  it('renders with compact inputs and updates value', () => {
    const onChange = vi.fn();
    render(<MidiKnobFlowNode id="node1" data={{ label: 'Test', min: 0, max: 10, value: 5, onChange }} />);
    // label input
    const labelInput = screen.getByTitle(/Knob label/i) as HTMLInputElement;
    expect(labelInput).toBeTruthy();
    // value input
    const valLabel = screen.getByText('Val');
    expect(valLabel).toBeTruthy();
    const valueInput = valLabel.parentElement!.querySelector('input[type="number"]') as HTMLInputElement;
    expect(valueInput).toBeTruthy();
    // ensure compact width
    expect(parseInt(getComputedStyle(valueInput).width)).toBeLessThanOrEqual(65);
    // change value
    fireEvent.change(valueInput, { target: { value: '7' } });
    expect(valueInput.value).toBe('7');
  });
});
