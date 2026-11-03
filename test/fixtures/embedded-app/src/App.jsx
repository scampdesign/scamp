import { Card } from './Card';
import { Menu } from './Menu';

const PEOPLE = ['Ada Lovelace', 'Grace Hopper', 'Katherine Johnson'];

export const App = () => (
  <main className="page">
    <h1 className="title">Team</h1>
    <Menu />
    <section className="cards">
      {PEOPLE.map((name) => (
        <Card key={name} name={name} />
      ))}
    </section>
  </main>
);
