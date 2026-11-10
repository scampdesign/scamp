import { describe, expect, it } from 'vitest';

import { classifyContent, freeFileName, type ComponentCall } from '../src/main/embedded/content';

/**
 * Where an element's text, image, or link comes from: written in the
 * code (editable), a prop with a value written where the component is
 * used (editable there), or data (not editable from Scamp).
 */

const files: Record<string, string> = {
  'src/App.jsx': [
    "import logo from './logo.png';", // 1
    "import { Card } from './Card';", // 2
    "import { Button } from './Button';", // 3
    "const TITLE = 'Team';", // 4
    'const PEOPLE = ["Ada", "Grace"];', // 5
    'export const App = () => {', // 6
    "  const [url] = useState('/x');", // 7
    '  return (', // 8
    '    <main>', // 9
    '      <h1>Team</h1>', // 10
    '      <h2>{TITLE}</h2>', // 11
    '      <p>Hi {url}</p>', // 12
    '      <Card name="Ada" />', // 13
    '      {PEOPLE.map((n) => <Card key={n} name={n} />)}', // 14
    '      <Button>Save</Button>', // 15
    '      <img src={logo} />', // 16
    '      <a href={url}>Go</a>', // 17
    '      <a href="/about">About</a>', // 18
    "      <h3>{`Plain`}</h3>", // 19
    '      <div {...rest} />', // 20
    '    </main>', // 21
    '  );', // 22
    '};', // 23
  ].join('\n'),
  'src/Card.jsx': ['export const Card = ({ name }) => (', '  <article>', '    <h2>{name}</h2>', '  </article>', ');'].join('\n'),
  'src/Button.tsx': ['export function Button(props: { children: string }) {', '  return <button>{props.children}</button>;', '}'].join('\n'),
};

const read = async (file: string): Promise<string | null> => files[file] ?? null;

const classify = (source: string, field: 'text' | 'src' | 'alt' | 'href', calls: ComponentCall[] = []) =>
  classifyContent({ source, field, calls, read });

describe('classifyContent: written in the code', () => {
  it('reads text written between the tags', async () => {
    expect(await classify('src/App.jsx:10:7', 'text')).toEqual({ kind: 'literal', value: 'Team', at: 'src/App.jsx:10' });
  });

  it('follows a const written with a string, and a template with no values', async () => {
    expect(await classify('src/App.jsx:11:7', 'text')).toEqual({ kind: 'literal', value: 'Team', at: 'src/App.jsx:4' });
    expect(await classify('src/App.jsx:19:7', 'text')).toMatchObject({ kind: 'literal', value: 'Plain' });
  });

  it('reads a written attribute, and an import for an image', async () => {
    expect(await classify('src/App.jsx:18:7', 'href')).toEqual({ kind: 'literal', value: '/about', at: 'src/App.jsx:18' });
    expect(await classify('src/App.jsx:16:7', 'src')).toEqual({ kind: 'import', value: './logo.png', at: 'src/App.jsx:1' });
  });

  it('treats a missing attribute as one to add where the element is written', async () => {
    expect(await classify('src/App.jsx:16:7', 'alt')).toEqual({ kind: 'literal', value: '', at: 'src/App.jsx:16' });
  });
});

describe('classifyContent: props, followed to where the component is used', () => {
  it('finds a value written where the component is used', async () => {
    expect(await classify('src/Card.jsx:3:5', 'text', [{ name: 'Card', call: 'src/App.jsx:13:7' }, { name: 'App', call: null }])).toEqual({
      kind: 'prop',
      value: 'Ada',
      at: 'src/App.jsx:13',
      prop: 'name',
      component: 'Card',
    });
  });

  it('reads children between the component’s tags, through props.children', async () => {
    expect(await classify('src/Button.tsx:2:10', 'text', [{ name: 'Button', call: 'src/App.jsx:15:7' }])).toMatchObject({
      kind: 'prop',
      value: 'Save',
      prop: 'children',
      component: 'Button',
    });
  });

  it('calls a prop filled from a list data', async () => {
    expect(await classify('src/Card.jsx:3:5', 'text', [{ name: 'Card', call: 'src/App.jsx:14:26' }])).toMatchObject({ kind: 'data' });
  });

  it('can’t tell without knowing where the component is used', async () => {
    expect(await classify('src/Card.jsx:3:5', 'text', [])).toMatchObject({ kind: 'unknown' });
  });
});

describe('classifyContent: data', () => {
  it('calls state, mixed content, and spread props data', async () => {
    expect(await classify('src/App.jsx:17:7', 'href')).toMatchObject({ kind: 'data', reason: 'it comes from a variable' });
    expect(await classify('src/App.jsx:12:7', 'text')).toMatchObject({ kind: 'data', reason: 'it mixes text with other elements or values' });
    expect(await classify('src/App.jsx:20:7', 'href')).toMatchObject({ kind: 'data' });
  });

  it('calls a source it can’t find or read data', async () => {
    expect(await classify('src/Missing.jsx:1:1', 'text')).toMatchObject({ kind: 'data' });
    expect(await classify('src/App.jsx:99:1', 'text')).toMatchObject({ kind: 'data' });
    expect(await classify('not a source', 'text')).toMatchObject({ kind: 'data' });
  });
});

describe('freeFileName', () => {
  it('keeps a name that isn’t taken', () => {
    expect(freeFileName('logo.png', ['hero.jpg'])).toBe('logo.png');
  });

  it('adds a number when the name is taken, ignoring case', () => {
    expect(freeFileName('logo.png', ['Logo.PNG'])).toBe('logo-2.png');
    expect(freeFileName('logo.png', ['logo.png', 'logo-2.png'])).toBe('logo-3.png');
  });

  it('turns spaces into dashes, and names an empty name', () => {
    expect(freeFileName('my photo.jpg', [])).toBe('my-photo.jpg');
    expect(freeFileName('  ', [])).toBe('image');
    expect(freeFileName('README', ['readme'])).toBe('README-2');
  });
});
