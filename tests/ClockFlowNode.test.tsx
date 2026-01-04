// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import ClockFlowNode, { ClockNodeProps } from '../src/nodes/ClockFlowNode';
import { ReactFlowProvider } from '@xyflow/react';

describe('ClockFlowNode OFF section collapsible', () => {
  const make = (override: Partial<ClockNodeProps['data']> = {}) => {
    const changes: any[] = [];
    const props: ClockNodeProps = {
      id: 'clock1',
      data: {
        bpm: 120,
        onChange: (d:any)=>changes.push(d),
        ...override
      }
    };
    const utils = render(<ReactFlowProvider><ClockFlowNode {...props} /></ReactFlowProvider>);
    return { changes, ...utils };
  };

  it('toggles only OFF advanced settings while BPM stays visible', () => {
    const { container } = make();
    // BPM label always present
    expect(screen.getByText('BPM')).toBeTruthy();
    expect(container.textContent).not.toMatch(/send OFF/i);
    // Toggle area: the row containing the caret and OFF events label
    const toggleRow = screen.getByText(/OFF events/i).parentElement as HTMLElement;
    fireEvent.click(toggleRow);
    expect(screen.getByLabelText(/send OFF/i)).toBeTruthy();
    fireEvent.click(toggleRow);
    expect(container.textContent).not.toMatch(/send OFF/i);
    expect(screen.getByText('BPM')).toBeTruthy();
  });
});
