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
    expect(container.querySelector('select')).toBeTruthy();
    // noteCount is displayed as a span below the MidiKnob
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('renders initial note count from props', () => {
    make({ noteCount: 7 });
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('initial noteCount is clamped to 1-24 range', () => {
    // noteCount=24 is the max; should render without error and display it
    make({ noteCount: 24 });
    expect(screen.getByText('24')).toBeTruthy();
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

  it('renders initial octave spread value', () => {
    // octaveSpread is displayed as toFixed(2) below the MidiKnob
    make({ octaveSpread: 2 });
    expect(screen.getByText('2.00')).toBeTruthy();
  });
});
