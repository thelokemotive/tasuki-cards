import { describe, expect, it } from 'vitest';
import type { Athlete } from '../../types';
import { DEFAULT_CONFIG } from '../config';
import { activityFrom, parseTopUps, soreSpotFrom, topUpParticipation } from './topUps';

// Invented pupils. The header row is a Microsoft Forms "Open in Excel" export, copied and pasted (tabs).
function athlete(id: string, given: string, family: string): Athlete {
  return { id, givenName: given, familyName: family, preferredName: given, aliases: [], sex: 'F', yearGroup: 'Y9', displayMode: 'full', absoluteBoardOptOut: false, avatar: {} as Athlete['avatar'], active: true };
}
const roster = [athlete('aiko', 'Aiko', 'Testfield'), athlete('ben', 'Ben', 'Sampleton')];

const HEADER = ['ID', 'Start time', 'Completion time', 'Email', 'Name', 'Date of the session', 'What did you do?', 'How many minutes?', 'Kilometres (if the treadmill shows them)', 'Did you finish with race-pace surges or strides?', 'Photo of the treadmill screen or watch', 'How sore afterwards? (0 = fine, 10 = very)'].join('\t');
const row = (...cells: string[]) => cells.join('\t');

describe('winter top-ups from a Forms export', () => {
  it('reads each column by its question', () => {
    const text = [
      HEADER,
      row('1', '12/22/26 7:01', '12/22/26 7:03', 'x@school', 'Aiko Testfield', '2026-12-22', 'Treadmill', '25', '5.1', 'Yes', 'https://onedrive/photo1.jpg', '2'),
      row('2', '', '', '', 'Ben Sampleton', '23/12/2026', 'Armour (calf raises and pogo hops)', '10', '', 'No', '', '0'),
    ].join('\n');
    const { rows, problems } = parseTopUps(text, roster, DEFAULT_CONFIG, '2026-12-31');
    expect(problems).toEqual([]);
    expect(rows[0]).toMatchObject({ date: '2026-12-22', responseId: '1', problems: [], topUp: { activity: 'treadmill', minutes: 25, km: 5.1, sharp: true, proof: 'photo', soreness: 2 } });
    expect(rows[0].match.athleteId).toBe('aiko');
    expect(rows[1]).toMatchObject({ date: '2026-12-23', problems: [], topUp: { activity: 'armour', minutes: 10, proof: 'none', soreness: 0 } });
    const parts = topUpParticipation(rows, () => 'new');
    expect(parts.map((p) => [p.id, p.athleteId, p.isoWeek])).toEqual([
      ['topup-form-1', 'aiko', '2026-W52'],
      ['topup-form-2', 'ben', '2026-W52'],
    ]);
  });

  it('flags rows it cannot trust and leaves them out', () => {
    const text = [
      HEADER,
      row('3', '', '', '', 'Nobody Here', '2026-12-22', 'Run', '30', '', '', '', ''),
      row('4', '', '', '', 'Aiko Testfield', '2027-02-01', 'Run', '30', '', '', '', ''),
      row('5', '', '', '', 'Aiko Testfield', '2026-12-22', 'Treadmill', '10', '5', '', '', ''),
      row('6', '', '', '', 'Aiko Testfield', '2026-12-22', 'Swimming', '30', '', '', '', ''),
    ].join('\n');
    const { rows } = parseTopUps(text, roster, DEFAULT_CONFIG, '2026-12-31');
    expect(rows.map((r) => r.problems[0])).toEqual(['Name not recognised', 'Date is in the future', 'Faster than 2:30/km: check the minutes and km', 'Activity “Swimming” not recognised']);
    expect(topUpParticipation(rows, () => 'new')).toEqual([]);
  });

  it('needs the name, activity and minutes questions', () => {
    expect(parseTopUps('Name\tDate\nAiko\t2026-12-22', roster, DEFAULT_CONFIG, '2026-12-31').problems[0]).toMatch(/activity, minutes/);
  });

  it('knows the activities in English and Japanese', () => {
    expect(['Run outdoors', 'トレッドミル', 'スキー', 'Gym (Tuesday)', 'Ankle and calf armour'].map(activityFrom)).toEqual(['run', 'treadmill', 'ski', 'gym', 'armour']);
  });

  it('reads where it is sore', () => {
    expect(['Nowhere', 'Heel', 'Knee or below the kneecap', 'Achilles', 'かかと', '', 'Elbow'].map(soreSpotFrom)).toEqual([undefined, 'heel', 'knee', 'achilles', 'heel', undefined, 'other']);
    const text = [HEADER + '\tWhere is it sore?', row('9', '', '', '', 'Aiko Testfield', '2026-12-22', 'Run', '25', '', 'No', '', '5', 'Heel')].join('\n');
    expect(parseTopUps(text, roster, DEFAULT_CONFIG, '2026-12-31').rows[0].topUp).toMatchObject({ soreness: 5, soreWhere: 'heel' });
  });
});
