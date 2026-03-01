// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import ArpeggiatorFlowNode, { ArpeggiatorFlowNodeProps } from '../src/nodes/ArpeggiatorFlowNode';
import { ReactFlowProvider } from '@xyflow/react';
import EventBus from '../src/sys/EventBus';

describe('ArpeggiatorFlowNode', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = EventBus.getInstance();
  });

  const make = (override: Partial<ArpeggiatorFlowNodeProps['data']> = {}) => {
    const changes: any[] = [];
    const props: ArpeggiatorFlowNodeProps = {
      id: 'arp1',
      data: {
        noteCount: 4,
        mode: 'up',
        onChange: (d: any) => changes.push(d),
        ...override
      }
    };
    const utils = render(
      <ReactFlowProvider>
        <ArpeggiatorFlowNode {...props} />
      </ReactFlowProvider>
    );
    return { changes, ...utils };
  };

  it('renders with default values', () => {
    const { container } = make();
    expect(screen.getByText('Arpeggiator')).toBeTruthy();
    expect(container.querySelector('input[type="number"]')).toBeTruthy();
    expect(container.querySelector('select')).toBeTruthy();
  });

  it('updates note count when input changes', () => {
    const { container, changes } = make();
    const input = container.querySelector('input[type="number"]') as HTMLInputElement;
    
    fireEvent.change(input, { target: { value: '7' } });
    
    // Should emit update with new noteCount
    expect(changes.some(c => c.noteCount === 7)).toBe(true);
  });

  it('clamps note count between 1 and 9', () => {
    const { container, changes } = make();
    const input = container.querySelector('input[type="number"]') as HTMLInputElement;
    
    // Try to set above max
    fireEvent.change(input, { target: { value: '15' } });
    expect(changes.some(c => c.noteCount === 9)).toBe(true);
    
    // Try to set below min
    fireEvent.change(input, { target: { value: '0' } });
    expect(changes.some(c => c.noteCount === 1)).toBe(true);
  });

  it('changes arpeggio mode via dropdown', () => {
    const { container, changes } = make();
    const select = container.querySelector('select') as HTMLSelectElement;
    
    fireEvent.change(select, { target: { value: 'random' } });
    
    expect(changes.some(c => c.mode === 'random')).toBe(true);
  });

  it('displays all available modes', () => {
    const { container } = make();
    const select = container.querySelector('select') as HTMLSelectElement;
    const options = Array.from(select.options).map(o => o.value);
    
    expect(options).toContain('up');
    expect(options).toContain('down');
    expect(options).toContain('up-down');
    expect(options).toContain('random');
    expect(options).toContain('chord');
  });

  it('shows current step indicator dots', () => {
    const { container } = make({ noteCount: 5 });
    const dots = container.querySelectorAll('[style*="border-radius"]');
    
    // Should have dots for each note (might be more elements with border-radius)
    expect(dots.length).toBeGreaterThanOrEqual(5);
  });

  it('updates octave spread via slider', () => {
    const { container, changes } = make();
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
    
    fireEvent.change(slider, { target: { value: '2' } });
    
    expect(changes.some(c => c.octaveSpread === 2)).toBe(true);
  });
});
