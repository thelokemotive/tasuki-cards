// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ArmMeasures } from '../../types';
import { DEFAULT_CONFIG } from '../../engine/config';
import { ArmLegsInput, tidyArm } from './ArmLegsInput';

function Harness({ start = {} }: { start?: ArmMeasures }) {
  const [arm, setArm] = useState<ArmMeasures>(start);
  return (
    <>
      <ArmLegsInput value={arm} config={DEFAULT_CONFIG} onChange={setArm} />
      <output data-testid="json">{JSON.stringify(tidyArm(arm))}</output>
    </>
  );
}

describe('ArmLegsInput: the coach enters each leg, the app works out the weaker side', () => {
  it('stores left/right and shows the weaker side and levels live', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Ankle: the Lunge (cm), left'), { target: { value: '9.5' } });
    fireEvent.change(screen.getByLabelText('Ankle: the Lunge (cm), right'), { target: { value: '11' } });
    fireEvent.change(screen.getByLabelText('Calf: the Wall (reps), left'), { target: { value: '31' } });
    fireEvent.change(screen.getByLabelText('Calf: the Wall (reps), right'), { target: { value: '33' } });
    fireEvent.change(screen.getByLabelText('Balance: the Stork (s), left'), { target: { value: '16' } });
    fireEvent.change(screen.getByLabelText('Balance: the Stork (s), right'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Hop & Freeze (furthest line), left'), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('Hop & Freeze (furthest line), right'), { target: { value: '140' } });
    expect(JSON.parse(screen.getByTestId('json').textContent!)).toEqual({
      left: { ankleCm: 9.5, calfReps: 31, storkSec: 16, hopLineCm: 120 },
      right: { ankleCm: 11, calfReps: 33, storkSec: 20, hopLineCm: 140 },
    });
    expect(screen.getByText('A2 · C4 · B5')).toBeTruthy();
    expect(screen.getByText('yes')).toBeTruthy();
  });

  it('notes an older single-value record', () => {
    render(<Harness start={{ ankleCm: 11, calfReps: 23, storkSec: 12 }} />);
    expect(screen.getByText('A3 · C2 · B3')).toBeTruthy();
    expect(screen.getByText(/Older record: one weaker-side value per test/)).toBeTruthy();
  });

  it('tidyArm drops cleared values and empty legs', () => {
    expect(tidyArm({ ankleCm: undefined, left: { ankleCm: undefined }, right: { calfReps: 20 } })).toEqual({ right: { calfReps: 20 } });
  });
});
