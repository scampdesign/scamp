import { Card } from './Card';
import { Menu } from './Menu';

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
  </main>
);
