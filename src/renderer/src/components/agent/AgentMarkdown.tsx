import { useMemo } from 'react';

import { parseAgentMarkdown, type Block, type Inline } from '@lib/agentMarkdown';

import styles from './AgentPanel.module.css';

type Props = {
  text: string;
};

const InlineContent = ({ content }: { content: ReadonlyArray<Inline> }): JSX.Element => (
  <>
    {content.map((node, i) => {
      switch (node.kind) {
        case 'text':
          return <span key={i}>{node.text}</span>;
        case 'code':
          return (
            <code key={i} className={styles.code}>
              {node.text}
            </code>
          );
        case 'strong':
          return (
            <strong key={i}>
              <InlineContent content={node.children} />
            </strong>
          );
        case 'em':
          return (
            <em key={i}>
              <InlineContent content={node.children} />
            </em>
          );
      }
    })}
  </>
);

const BlockContent = ({ block }: { block: Block }): JSX.Element => {
  switch (block.kind) {
    case 'heading': {
      const Tag = block.level === 1 ? 'h3' : block.level === 2 ? 'h4' : 'h5';
      return (
        <Tag className={styles[`mdHeading${block.level}`]}>
          <InlineContent content={block.content} />
        </Tag>
      );
    }
    case 'paragraph':
      return (
        <p className={styles.replyText}>
          <InlineContent content={block.content} />
        </p>
      );
    case 'list': {
      const items = block.items.map((item, i) => (
        <li key={i}>
          <InlineContent content={item} />
        </li>
      ));
      return block.ordered ? (
        <ol className={styles.mdList} start={block.start}>
          {items}
        </ol>
      ) : (
        <ul className={styles.mdList}>{items}</ul>
      );
    }
    case 'code':
      return <pre className={styles.mdCode}>{block.text}</pre>;
    case 'rule':
      return <hr className={styles.mdRule} />;
  }
};

/**
 * An agent reply's Markdown, rendered. Parsed into plain data first and
 * drawn as text nodes, so nothing in a reply becomes HTML.
 * see @lib/agentMarkdown
 */
export const AgentMarkdown = ({ text }: Props): JSX.Element => {
  const blocks = useMemo(() => parseAgentMarkdown(text), [text]);
  return (
    <div className={styles.markdown}>
      {blocks.map((block, i) => (
        <BlockContent key={i} block={block} />
      ))}
    </div>
  );
};
