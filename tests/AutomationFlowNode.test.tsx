/** @vitest-environment jsdom */
import { render, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, test, expect, vi } from 'vitest';

// Mock the rotary knob (it touches DOM/SVG APIs during module init that can break in tests)
vi.mock('react-rotary-knob-react19', () => ({
  Knob: (props: any) => <div data-testid="knob" onClick={() => props.onChange?.(props.value)} />
}));

import AutomationFlowNode, { AutomationPoint } from '../src/nodes/AutomationFlowNode';
import { ReactFlowProvider } from '@xyflow/react';

// Minimal wrapper to capture onChange updates
function setup(initialPoints?: AutomationPoint[]) {
  // Provide a mock 2d context so drawing code in component does not throw inside jsdom
  // Only add once
  if (!(HTMLCanvasElement.prototype as any)._patched) {
    (HTMLCanvasElement.prototype as any)._patched = true;
    HTMLCanvasElement.prototype.getContext = function() {
      return {
        // Minimal API surface used by AutomationFlowNode.draw
        clearRect: () => {},
        fillRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
        arc: () => {},
        set lineWidth(v:number) {},
        set strokeStyle(v:any) {},
        set fillStyle(v:any) {},
        set font(v:any) {},
        fillText: () => {},
      } as any;
    } as any;
  }
  const changes: any[] = [];
  const { container } = render(
    <ReactFlowProvider>
      <AutomationFlowNode data={{ id: 'a1', style: {}, points: initialPoints, onChange: (d: any)=> changes.push(d) }} />
    </ReactFlowProvider>
  );
  const canvas = container.querySelector('canvas') as HTMLCanvasElement;
  if(!canvas) throw new Error('canvas not found');
  // JSDOM returns 0x0 sometimes; mock a size for coordinate math
  (canvas as any).getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 400,
    height: 120,
    right: 400,
    bottom: 120,
    x: 0,
    y: 0,
    toJSON() { return {}; }
  });
  return { canvas, changes };
}

describe('AutomationFlowNode right-click removal', () => {
  test('removes a middle point on right click', async () => {
    const { canvas, changes } = setup([
      { x:0, y:0.5 },
      { x:0.5, y:0.2 },
      { x:1, y:0.5 }
    ]);
    // Simulate contextmenu roughly at middle point position
    // Component maps canvas width/height defaults (e.g., 300x150) before resize observer; simulate coordinates
    // We right-click exactly at x=0.5 * width, y corresponding to y=0.2 (point second) -> middle point
    const width = canvas.width || 400;
    const height = canvas.height || 120;
    const clientX = width * 0.5;
    const clientY = height * 0.2;
    fireEvent.contextMenu(canvas, { button: 2, clientX, clientY });
    await waitFor(()=> {
      const latest = changes[changes.length -1];
      expect(latest.points.length).toBe(2);
    });
  });
});
