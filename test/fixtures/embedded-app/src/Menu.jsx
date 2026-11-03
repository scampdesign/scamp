import { useState } from 'react';

/** A menu that closes the moment the pointer leaves it, as most do. */
export const Menu = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="menu" onMouseLeave={() => setOpen(false)}>
      <button type="button" className="menu-button" onClick={() => setOpen(true)}>
        Menu
      </button>
      {open && (
        <ul className="menu-list">
          <li className="menu-item">Settings</li>
        </ul>
      )}
    </div>
  );
};
