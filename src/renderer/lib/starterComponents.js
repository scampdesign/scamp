import { WRITTEN_CONTRACT } from '@shared/projectConfig';
export const STARTERS = [
    { name: 'Button', description: 'A button with variant and size axes' },
    { name: 'Modal', description: 'A button that opens a dialog, which fades in and out' },
    { name: 'Menu', description: 'A menu its trigger opens, which fades in and out' },
];
const TEMPLATES = {
    Button: {
        tsx: `import styles from './Button.module.css';

type ButtonProps = {
  variant?: "default" | "outline" | "secondary";
  size?: "small" | "medium" | "large";
  label?: string;
  onClick?: () => void;
  className?: string;
};

export default function Button({ variant = "default", size = "medium", label = "Button", onClick, className }: ButtonProps) {
  return (
    <button data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`} type="button" data-variant={variant} data-size={size} onClick={onClick}>
      <span data-scamp-id="label_b7e1" className={styles.label_b7e1}>{label}</span>
    </button>
  );
}

export const _scamp = { contract: ${WRITTEN_CONTRACT}, events: ['onClick'] } as const;
`,
        css: `.root {
  width: fit-content;
  height: 40px;
  align-items: center;
  justify-content: center;
  padding: 0px 18px;
  background: #2563eb;
  border-radius: 8px;
  border-width: 1px;
  border-style: solid;
  border-color: #2563eb;
  color: #ffffff;
  position: relative;
  display: inline-flex;
  cursor: pointer;
}

.root:hover {
  background: #1d4ed8;
}

.label_b7e1 {
  font-size: 15px;
  font-weight: 600;
}

.root[data-variant="outline"] {
  background: transparent;
  color: #2563eb;
}

.root[data-variant="outline"]:hover {
  background: #eff6ff;
}

.root[data-variant="secondary"] {
  background: #f1f5f9;
  border-color: #f1f5f9;
  color: #0f172a;
}

.root[data-variant="secondary"]:hover {
  background: #e2e8f0;
}

.root[data-size="small"] {
  height: 32px;
  padding: 0px 12px;
}

.root[data-size="small"] .label_b7e1 {
  font-size: 13px;
}

.root[data-size="large"] {
  height: 48px;
  padding: 0px 24px;
}

.root[data-size="large"] .label_b7e1 {
  font-size: 17px;
}
`,
    },
    Modal: {
        tsx: `import styles from './Modal.module.css';

type ModalProps = {
  state?: "closed" | "open";
  trigger?: string;
  title?: string;
  body?: string;
  closeLabel?: string;
  onClose?: () => void;
  className?: string;
};

export default function Modal({ state = "closed", trigger = "Open dialog", title = "Modal title", body = "Say what this dialog is for in a sentence or two.", closeLabel = "Close", onClose, className }: ModalProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`} data-scamp-escape="state:open=closed" data-state={state}>
      <button data-scamp-id="trigger_d41f" className={styles.trigger_d41f} type="button" data-scamp-click="state:closed=open">{trigger}</button>
      <div data-scamp-id="backdrop_d419" className={styles.backdrop_d419} data-scamp-click="state:open=closed" />
      <div data-scamp-id="dialog_d41a" className={styles.dialog_d41a} role="dialog" aria-modal="true">
        <h2 data-scamp-id="title_d41b" className={styles.title_d41b}>{title}</h2>
        <p data-scamp-id="body_d41c" className={styles.body_d41c}>{body}</p>
        <div data-scamp-id="actions_d41d" className={styles.actions_d41d}>
          <button data-scamp-id="close_d41e" className={styles.close_d41e} type="button" data-scamp-click="state:open=closed" onClick={onClose}>{closeLabel}</button>
        </div>
      </div>
    </div>
  );
}

export const _scamp = { contract: ${WRITTEN_CONTRACT}, events: ['onClose'] } as const;
`,
        css: `.root {
  width: fit-content;
  position: relative;
  display: inline-flex;
}

.trigger_d41f {
  padding: 10px 18px;
  background: #2563eb;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  white-space: nowrap;
}

.backdrop_d419 {
  background: rgba(15, 23, 42, 0.5);
  visibility: hidden;
  opacity: 0;
  transition: all 200ms ease;
  position: fixed;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
}

.dialog_d41a {
  width: 400px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
  background: #ffffff;
  border-radius: 12px;
  visibility: hidden;
  opacity: 0;
  box-shadow: 0px 20px 40px rgba(15, 23, 42, 0.2);
  transform: translate(-50%, -50%);
  transition: all 200ms ease;
  position: fixed;
  left: 50%;
  top: 50%;
}

.title_d41b {
  font-size: 20px;
  font-weight: 600;
  color: #0f172a;
}

.body_d41c {
  font-size: 15px;
  color: #475569;
  line-height: 1.5;
}

.actions_d41d {
  display: flex;
  justify-content: flex-end;
}

.close_d41e {
  padding: 8px 16px;
  background: #2563eb;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
}

.root[data-state="open"] .backdrop_d419 {
  opacity: 1;
  visibility: visible;
}

.root[data-state="open"] .dialog_d41a {
  opacity: 1;
  visibility: visible;
}
`,
    },
    Menu: {
        tsx: `import styles from './Menu.module.css';

type MenuProps = {
  state?: "closed" | "open";
  trigger?: string;
  first?: string;
  second?: string;
  third?: string;
  onToggle?: () => void;
  className?: string;
};

export default function Menu({ state = "closed", trigger = "Options", first = "Edit", second = "Duplicate", third = "Delete", onToggle, className }: MenuProps) {
  return (
    <div data-scamp-id="root" className={\`\${styles.root} \${className ?? ''}\`} data-scamp-outside="state:open=closed" data-scamp-escape="state:open=closed" data-state={state}>
      <button data-scamp-id="trigger_e51a" className={styles.trigger_e51a} type="button" data-scamp-click="state:closed=open,open=closed" onClick={onToggle}>{trigger}</button>
      <div data-scamp-id="panel_e51b" className={styles.panel_e51b} role="menu">
        <button data-scamp-id="item_e51c" className={styles.item_e51c} type="button" role="menuitem">{first}</button>
        <button data-scamp-id="item_e51d" className={styles.item_e51d} type="button" role="menuitem">{second}</button>
        <button data-scamp-id="item_e51e" className={styles.item_e51e} type="button" role="menuitem">{third}</button>
      </div>
    </div>
  );
}

export const _scamp = { contract: ${WRITTEN_CONTRACT}, events: ['onToggle'] } as const;
`,
        css: `.root {
  width: fit-content;
  align-items: flex-start;
  position: relative;
  display: inline-flex;
}

.trigger_e51a {
  padding: 8px 14px;
  background: #ffffff;
  border-radius: 8px;
  border-width: 1px;
  border-style: solid;
  border-color: #e2e8f0;
  font-size: 15px;
  color: #0f172a;
  cursor: pointer;
}

.panel_e51b {
  width: 180px;
  display: flex;
  flex-direction: column;
  padding: 4px;
  background: #ffffff;
  border-radius: 8px;
  border-width: 1px;
  border-style: solid;
  border-color: #e2e8f0;
  visibility: hidden;
  opacity: 0;
  box-shadow: 0px 8px 24px rgba(15, 23, 42, 0.12);
  transition: all 200ms ease;
  position: absolute;
  left: 0px;
  top: 44px;
}

.item_e51c {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 15px;
  color: #0f172a;
  text-align: left;
  cursor: pointer;
}

.item_e51c:hover {
  background: #f1f5f9;
}

.item_e51d {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 15px;
  color: #0f172a;
  text-align: left;
  cursor: pointer;
}

.item_e51d:hover {
  background: #f1f5f9;
}

.item_e51e {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 15px;
  color: #dc2626;
  text-align: left;
  cursor: pointer;
}

.item_e51e:hover {
  background: #fef2f2;
}

.root[data-state="open"] .panel_e51b {
  opacity: 1;
  visibility: visible;
}
`,
    },
};
/**
 * The starter's files, renamed: the name is in the import, the props
 * type, and the function. Outside a Scamp framework project the click,
 * outside, and Escape attributes are left out: only its handler runs
 * them, and a route opens the Modal and Menu instead. CONTRACT.md §1.3.2
 */
export const starterFiles = (starter, componentName, format = 'scamp') => {
    const { tsx: template, css } = TEMPLATES[starter];
    const tsx = format === 'scamp' ? template : template.replace(/ data-scamp-(?:click|outside|escape)="[^"]*"/g, '');
    return {
        tsx: tsx
            .replace(`./${starter}.module.css`, `./${componentName}.module.css`)
            .replaceAll(`${starter}Props`, `${componentName}Props`)
            .replace(`function ${starter}(`, `function ${componentName}(`),
        css,
    };
};
/** `Button`, or `Button2`, `Button3`, … when taken. Case-insensitive, as a macOS disk is. */
export const freeStarterName = (starter, existing) => {
    const taken = new Set(existing.map((n) => n.toLowerCase()));
    if (!taken.has(starter.toLowerCase()))
        return starter;
    for (let n = 2;; n += 1) {
        const name = `${starter}${n}`;
        if (!taken.has(name.toLowerCase()))
            return name;
    }
};
