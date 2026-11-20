import { describe, expect, it } from 'vitest';

import { erbContentAt } from '../src/main/embedded/content';

/** Where an element's text, image or link comes from in an ERB template. see docs/plans/embedded-rails-plan.md */

const ERB = [
  '<section class="card">',
  '  <h2 class="card__title">Upcoming visits</h2>',
  '  <p class="card__name"><%= patient.name %></p>',
  '  <a class="card__link" href="/patients" data-turbo="<%= turbo? %>">All patients</a>',
  '  <img class="card__photo" src="<%= patient.photo_url %>" alt="Photo">',
  '  <p class="card__mixed">Hi <strong>there</strong></p>',
  '</section>',
].join('\n');

const at = (line: number, field: 'text' | 'src' | 'alt' | 'href'): ReturnType<typeof erbContentAt> =>
  erbContentAt(ERB, 'app/views/patients/_card.html.erb', line, 3, field);

describe('erbContentAt', () => {
  it('reads text and attributes written in the template', () => {
    expect(at(2, 'text')).toEqual({ kind: 'literal', value: 'Upcoming visits', at: 'app/views/patients/_card.html.erb:2' });
    expect(at(4, 'href')).toEqual({ kind: 'literal', value: '/patients', at: 'app/views/patients/_card.html.erb:4' });
    expect(at(4, 'text')).toMatchObject({ kind: 'literal', value: 'All patients' });
    expect(at(5, 'alt')).toMatchObject({ kind: 'literal', value: 'Photo' });
  });

  it('leaves content Ruby writes, or text mixed with elements, to the code', () => {
    expect(at(3, 'text')).toEqual({ kind: 'data', reason: 'it comes from Ruby code in the template' });
    expect(at(5, 'src')).toEqual({ kind: 'data', reason: 'it comes from Ruby code in the template' });
    expect(at(6, 'text')).toEqual({ kind: 'data', reason: 'it mixes text with other elements' });
  });

  it('reads past `<% %>` inside the opening tag, and says when the line isn’t an element', () => {
    expect(at(4, 'text')).toMatchObject({ kind: 'literal', value: 'All patients' });
    expect(erbContentAt(ERB, 'x.html.erb', 1, 1, 'href')).toMatchObject({ kind: 'literal', value: '' });
    expect(erbContentAt(ERB, 'x.html.erb', 2, 1, 'text')).toEqual({ kind: 'data', reason: 'Scamp couldn’t find the element in its template' });
  });
});
