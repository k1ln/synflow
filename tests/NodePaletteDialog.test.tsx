// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import NodePaletteDialog from '../src/components/NodePaletteDialog';

describe('NodePaletteDialog', () => {
  const nodeTypes = {
    OscillatorFlowNode: (()=> null) as any,
    GainFlowNode: (()=> null) as any,
    ClockFlowNode: (()=> null) as any,
  };

  it('filters and selects a node type', async () => {
    const onSelect = vi.fn();
    render(<NodePaletteDialog open={true} onOpenChange={()=>{}} nodeTypes={nodeTypes} onSelect={onSelect} />);
    const input = screen.getByPlaceholderText('Search nodes...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'gain' } });
  const gainTile = await screen.findByRole('button', { name: /Gain/i });
  expect(gainTile).toBeTruthy();
  fireEvent.click(gainTile);
    expect(onSelect).toHaveBeenCalledWith('GainFlowNode');
  });
});
