// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import MidiKnobFlowNode from '../src/nodes/MidiKnobFlowNode';

const wrap = (ui: React.ReactElement) =>
  render(<ReactFlowProvider>{ui}</ReactFlowProvider>);

describe('MidiKnobFlowNode', () => {
  afterEach(() => cleanup());

  it('renders the label text input', () => {
    const { container } = wrap(<MidiKnobFlowNode id="node1" data={{ label: 'MyKnob', min: 0, max: 10, value: 5, onChange: vi.fn() }} />);
    const labelInput = container.querySelector('[title*="Module name"]') as HTMLInputElement;
    expect(labelInput).toBeTruthy();
    expect(labelInput.value).toBe('MyKnob');
  });

  it('displays the current value formatted to 4 decimal places', () => {
    const { getByText } = wrap(<MidiKnobFlowNode id="node1" data={{ label: '', min: 0, max: 1, value: 0.5, onChange: vi.fn() }} />);
    expect(getByText('0.5000')).toBeTruthy();
  });

  it('changing the label input updates the displayed value', () => {
    const { container } = wrap(<MidiKnobFlowNode id="node1" data={{ label: 'Old', min: 0, max: 10, value: 0, onChange: vi.fn() }} />);
    const labelInput = container.querySelector('[title*="Module name"]') as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'New' } });
    expect(labelInput.value).toBe('New');
  });

  it('calls onChange when rendered with a value', () => {
    const onChange = vi.fn();
    wrap(<MidiKnobFlowNode id="node1" data={{ label: 'Test', min: 0, max: 10, value: 5, onChange }} />);
    // onChange fires via useEffect on mount
    expect(onChange).toHaveBeenCalled();
  });
});
