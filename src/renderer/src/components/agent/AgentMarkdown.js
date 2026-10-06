import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo } from 'react';
import { parseAgentMarkdown } from '@lib/agentMarkdown';
import styles from './AgentPanel.module.css';
const InlineContent = ({ content }) => (_jsx(_Fragment, { children: content.map((node, i) => {
        switch (node.kind) {
            case 'text':
                return _jsx("span", { children: node.text }, i);
            case 'code':
                return (_jsx("code", { className: styles.code, children: node.text }, i));
            case 'strong':
                return (_jsx("strong", { children: _jsx(InlineContent, { content: node.children }) }, i));
            case 'em':
                return (_jsx("em", { children: _jsx(InlineContent, { content: node.children }) }, i));
        }
    }) }));
const BlockContent = ({ block }) => {
    switch (block.kind) {
        case 'heading': {
            const Tag = block.level === 1 ? 'h3' : block.level === 2 ? 'h4' : 'h5';
            return (_jsx(Tag, { className: styles[`mdHeading${block.level}`], children: _jsx(InlineContent, { content: block.content }) }));
        }
        case 'paragraph':
            return (_jsx("p", { className: styles.replyText, children: _jsx(InlineContent, { content: block.content }) }));
        case 'list': {
            const items = block.items.map((item, i) => (_jsx("li", { children: _jsx(InlineContent, { content: item }) }, i)));
            return block.ordered ? (_jsx("ol", { className: styles.mdList, start: block.start, children: items })) : (_jsx("ul", { className: styles.mdList, children: items }));
        }
        case 'code':
            return _jsx("pre", { className: styles.mdCode, children: block.text });
        case 'rule':
            return _jsx("hr", { className: styles.mdRule });
    }
};
/**
 * An agent reply's Markdown, rendered. Parsed into plain data first and
 * drawn as text nodes, so nothing in a reply becomes HTML.
 * see @lib/agentMarkdown
 */
export const AgentMarkdown = ({ text }) => {
    const blocks = useMemo(() => parseAgentMarkdown(text), [text]);
    return (_jsx("div", { className: styles.markdown, children: blocks.map((block, i) => (_jsx(BlockContent, { block: block }, i))) }));
};
