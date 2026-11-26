import { capitalizePayload, titleCase } from './auto-capitalize';

describe('titleCase', () => {
  it('capitalises words but keeps joining words lower unless first', () => {
    expect(titleCase('fire in the hole')).toBe('Fire In the Hole');
    expect(titleCase('a black cat')).toBe('A Black Cat');
    expect(titleCase('salt and pepper')).toBe('Salt and Pepper');
    expect(titleCase('the end')).toBe('The End');
  });

  it('keeps the rest of each word as typed', () => {
    expect(titleCase('buy iPhone case')).toBe('Buy IPhone Case');
    expect(titleCase('read 20 pages')).toBe('Read 20 Pages');
  });

  it('only touches title-like keys', () => {
    const out = capitalizePayload({
      title: 'write notes',
      notes: 'keep as is',
      subtasks: ['draft chapter', { title: 'edit the draft' }],
      skillWeights: [{ slug: 'knowledge', weight: 10 }],
    });
    expect(out).toEqual({
      title: 'Write Notes',
      notes: 'keep as is',
      subtasks: ['Draft Chapter', { title: 'Edit the Draft' }],
      skillWeights: [{ slug: 'knowledge', weight: 10 }],
    });
  });
});
