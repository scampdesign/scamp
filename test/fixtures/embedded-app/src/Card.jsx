import styles from './Card.module.css';

export const Card = ({ name }) => (
  <article className={styles.card}>
    <h2 className={styles.name}>{name}</h2>
  </article>
);
