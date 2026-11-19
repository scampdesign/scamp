import { useState } from 'react';

/** A list kept in state: its order is the app's data, not something written in the code. */
export const Tags = () => {
  const [tags] = useState(['Fast', 'Small', 'Local']);
  return (
    <ol className="tags">
      {tags.map((tag) => (
        <li key={tag} className="tag">
          {tag}
        </li>
      ))}
    </ol>
  );
};
