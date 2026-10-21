import { useCanvasStore } from '@store/canvasSlice';
import {
  DEFAULT_TAG,
  TAG_ATTRIBUTES,
  TAG_OPTIONS,
  type AttributeSpec,
} from '@lib/elementTags';
import type { ScampElement, SelectOption, VariantAxis } from '@lib/element';
import { Button } from '../controls/Button';
import { EnumSelect } from '../controls/EnumSelect';
import { PrefixSuffixInput } from '../controls/PrefixSuffixInput';
import { LinkField } from './LinkField';
import { Section, Row } from './Section';
import styles from './ElementSection.module.css';

type Props = {
  elementId: string;
};

/**
 * Collapsible "Element" section that appears at the top of the
 * properties panel for every element type. Lets the user pick the
 * element's HTML tag and edit tag-specific attributes (href, method,
 * etc.). For `<select>` and `<svg>` the section renders a dedicated
 * editor instead of a plain attribute form.
 */
export const ElementSection = ({ elementId }: Props): JSX.Element | null => {
  const element = useCanvasStore((s) => s.elements[elementId]);
  const patchElement = useCanvasStore((s) => s.patchElement);
  if (!element) return null;

  // A component instance has no tag to pick and no attributes of its
  // own — its identity IS the component it points at, so the section
  // takes the component's name as its title. This is where
  // instance-level component controls will live as they're built.
  if (element.type === 'component-instance') {
    return (
      <Section
        title={element.componentName ?? 'Unknown component'}
        collapsible
        defaultOpen
      >
        <Row label="Instance">
          <code className={styles.instanceId}>{element.instanceId ?? '—'}</code>
        </Row>
        <InstanceVariantFields element={element} />
      </Section>
    );
  }

  const baseTagOptions = TAG_OPTIONS[element.type];
  const currentTag = element.tag ?? DEFAULT_TAG[element.type];
  // Defensive fallback: if the current tag isn't in the predefined
  // options for this element type (e.g. an agent wrote a tag we don't
  // model, or an LinkField conversion landed on a tag this type's
  // dropdown doesn't list), prepend it so the dropdown can render it
  // as the selected value instead of silently falling back to the
  // first option.
  const tagOptions = baseTagOptions.some((opt) => opt.value === currentTag)
    ? baseTagOptions
    : [{ value: currentTag, label: currentTag }, ...baseTagOptions];

  const handleTagChange = (nextTag: string): void => {
    // Storing `undefined` when the user picks the type's default tag
    // keeps the round-trip text-stable — matches parseCode's rule.
    patchElement(elementId, {
      tag: nextTag === DEFAULT_TAG[element.type] ? undefined : nextTag,
    });
  };

  return (
    <Section title="Element" collapsible defaultOpen>
      <Row label="Tag">
        <EnumSelect
          value={currentTag}
          options={tagOptions}
          onChange={handleTagChange}
          title="HTML tag"
        />
      </Row>
      {/* Link controls live alongside Tag so the link affordance is
          discoverable regardless of the current tag. The leading
          chain icon on the destination dropdown is the field's
          visual identity. */}
      <LinkField elementId={elementId} />
      {currentTag === 'select' ? (
        <SelectOptionsEditor elementId={elementId} element={element} />
      ) : currentTag === 'svg' ? (
        <SvgSourceEditor elementId={elementId} element={element} />
      ) : (
        <AttributeFields
          elementId={elementId}
          attributes={element.attributes ?? {}}
          specs={TAG_ATTRIBUTES[currentTag] ?? []}
        />
      )}
    </Section>
  );
};

const EMPTY_AXES: ReadonlyArray<VariantAxis> = [];

/**
 * One select per variant axis of the instance's component. The default
 * clears the prop, so the file only names values that differ.
 * see docs/plans/component-variants-plan.md
 */
const InstanceVariantFields = ({ element }: { element: ScampElement }): JSX.Element | null => {
  const axes = useCanvasStore((s) => {
    const tree = element.componentName === undefined ? undefined : s.componentTrees[element.componentName];
    return tree?.elements[tree.rootId]?.variantAxes ?? EMPTY_AXES;
  });
  const setPropOverride = useCanvasStore((s) => s.setPropOverride);
  const clearPropOverride = useCanvasStore((s) => s.clearPropOverride);
  if (axes.length === 0) return null;
  return (
    <>
      {axes.map((axis) => {
        const value = element.propOverrides?.[axis.prop] ?? axis.defaultValue;
        // A value the component lacks still shows, so the select can say so.
        const values = axis.values.includes(value) ? axis.values : [value, ...axis.values];
        return (
          <Row key={axis.prop} label={axis.prop}>
            <EnumSelect
              value={value}
              options={values.map((v) => ({ value: v, label: v }))}
              onChange={(next) =>
                next === axis.defaultValue
                  ? clearPropOverride(element.id, axis.prop)
                  : setPropOverride(element.id, axis.prop, next)
              }
              title={`${element.componentName ?? 'Component'} ${axis.prop}`}
            />
          </Row>
        );
      })}
    </>
  );
};

type AttributeFieldsProps = {
  elementId: string;
  attributes: Record<string, string>;
  specs: ReadonlyArray<AttributeSpec>;
};

const AttributeFields = ({
  elementId,
  attributes,
  specs,
}: AttributeFieldsProps): JSX.Element | null => {
  const patchElement = useCanvasStore((s) => s.patchElement);

  if (specs.length === 0) return null;

  const setAttr = (name: string, value: string | null): void => {
    const next = { ...attributes };
    if (value === null) delete next[name];
    else next[name] = value;
    patchElement(elementId, {
      attributes: Object.keys(next).length > 0 ? next : undefined,
    });
  };

  return (
    <>
      {specs.map((spec) => {
        const current = attributes[spec.name] ?? '';
        if (spec.kind === 'text') {
          return (
            <Row key={spec.name} label={spec.label}>
              <PrefixSuffixInput
                value={current}
                placeholder={spec.placeholder}
                onCommit={(next) =>
                  setAttr(spec.name, next === '' ? null : next)
                }
              />
            </Row>
          );
        }
        if (spec.kind === 'select') {
          // If the current stored value isn't in the option set, prepend
          // an empty option so the select has something to show.
          return (
            <Row key={spec.name} label={spec.label}>
              <EnumSelect
                value={current}
                options={[{ value: '', label: '(default)' }, ...spec.options]}
                onChange={(value) => setAttr(spec.name, value === '' ? null : value)}
              />
            </Row>
          );
        }
        // boolean — stored as "" when checked, absent when not
        const checked = spec.name in attributes;
        return (
          <Row key={spec.name} label={spec.label}>
            <label className={styles.boolRow}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setAttr(spec.name, e.target.checked ? '' : null)}
              />
              <span>{checked ? 'Yes' : 'No'}</span>
            </label>
          </Row>
        );
      })}
    </>
  );
};

type EditorProps = {
  elementId: string;
  element: ScampElement;
};

const SelectOptionsEditor = ({ elementId, element }: EditorProps): JSX.Element => {
  const patchElement = useCanvasStore((s) => s.patchElement);
  const options: ReadonlyArray<SelectOption> = element.selectOptions ?? [];

  const update = (next: ReadonlyArray<SelectOption>): void => {
    patchElement(elementId, { selectOptions: next.length > 0 ? next : undefined });
  };

  const addOption = (): void => {
    update([...options, { value: '', label: 'New option' }]);
  };

  const patchOption = (idx: number, patch: Partial<SelectOption>): void => {
    const next = options.map((opt, i) => (i === idx ? { ...opt, ...patch } : opt));
    update(next);
  };

  const removeOption = (idx: number): void => {
    update(options.filter((_, i) => i !== idx));
  };

  const toggleSelected = (idx: number): void => {
    const next = options.map((opt, i) => {
      if (i === idx) return { ...opt, selected: !opt.selected };
      if (opt.selected) {
        // Only one option can be initially selected at a time (matches
        // the single-select UI the story describes).
        const clone = { ...opt };
        delete clone.selected;
        return clone;
      }
      return opt;
    });
    update(next);
  };

  return (
    <div className={styles.optionsEditor}>
      <div className={styles.optionsHeader}>Options</div>
      {options.length === 0 && (
        <div className={styles.optionsEmpty}>No options yet.</div>
      )}
      {options.map((opt, idx) => (
        <div key={idx} className={styles.optionRow}>
          <PrefixSuffixInput
            value={opt.value}
            placeholder="value"
            onCommit={(next) => patchOption(idx, { value: next })}
          />
          <PrefixSuffixInput
            value={opt.label}
            placeholder="label"
            onCommit={(next) => patchOption(idx, { label: next })}
          />
          {/* Raw <button>: a toggle pill (selected/unselected), not a
              labeled action — controls/Button has no toggle variant. */}
          <button
            type="button"
            className={`${styles.pill} ${opt.selected ? styles.pillActive : ''}`}
            onClick={() => toggleSelected(idx)}
            title="Initially selected"
          >
            ✓
          </button>
          <Button
            variant="removeRow"
            onClick={() => removeOption(idx)}
            ariaLabel="Remove option"
          >
            ×
          </Button>
        </div>
      ))}
      <Button variant="addRow" onClick={addOption}>
        + Add option
      </Button>
    </div>
  );
};

const SvgSourceEditor = ({ elementId, element }: EditorProps): JSX.Element => {
  const patchElement = useCanvasStore((s) => s.patchElement);
  const source = element.svgSource ?? '';

  const handleChange = (value: string): void => {
    patchElement(elementId, { svgSource: value.length > 0 ? value : undefined });
  };

  return (
    <div className={styles.svgEditor}>
      <div className={styles.optionsHeader}>Inner source</div>
      <textarea
        className={styles.textarea}
        value={source}
        spellCheck={false}
        rows={6}
        placeholder='<circle cx="50" cy="50" r="40" fill="currentColor" />'
        onChange={(e) => handleChange(e.target.value)}
      />
    </div>
  );
};
