// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import IIRFilterFlowNode, { IIRFilterFlowNodeProps } from '../src/nodes/IIRFilterFlowNode';
import { ReactFlowProvider } from '@xyflow/react';

// Basic smoke test ensuring coefficient parsing and onChange emission.
describe('IIRFilterFlowNode', () => {
  it('changes coefficient via number input and emits onChange', () => {
    const changes: any[] = [];
    const props: IIRFilterFlowNodeProps = {
      data: {
        label: 'IIR Filter',
        feedforward: [0.5, 0.5],
        feedback: [1.0, -0.5],
        onChange: (d: any) => changes.push(d)
      }
    };
    const { container } = render(
      <ReactFlowProvider>
        <IIRFilterFlowNode {...props} />
      </ReactFlowProvider>
    );
    // Find first number input (feedforward[0])
    const numberInputs = container.querySelectorAll('input[type="number"]');
    expect(numberInputs.length).toBeGreaterThan(0);
    const first = numberInputs[0] as HTMLInputElement;
    fireEvent.change(first, { target: { value: '0.75' } });
    // Last change should reflect updated coefficient
    const last = changes[changes.length - 1];
    expect(last.feedforward[0]).toBeCloseTo(0.75, 5);
  });
});
