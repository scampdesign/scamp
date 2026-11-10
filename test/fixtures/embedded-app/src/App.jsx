import { Badge } from './Badge';
import { Card } from './Card';
import { Menu } from './Menu';
import { Tags } from './Tags';

const PEOPLE = ['Ada Lovelace', 'Grace Hopper', 'Katherine Johnson'];

export const App = () => (
  <main className="page">
    <h1 className="title">Team</h1>
    <a className="about-link" href="/about">About</a>
    <p className="hint">
      Hover for a tip <span className="tip">Shown only on hover</span>
    </p>
    <Menu />
    <section className="cards">
      {PEOPLE.map((name) => (
        <Card key={name} name={name} />
      ))}
    </section>
    <footer className="foot">
      <Badge label="New" />
      <img className="logo" src="/logo.svg" alt="Logo" />
    </footer>
    <Tags />
    {/* Closed, it shows only its summary: a click there can't reach the <details> itself. */}
    <details className="more">
      <summary className="more-summary">More</summary>
      <div className="more-body">Hidden until opened</div>
    </details>
  </main>
);
