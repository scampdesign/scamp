import { jsx as _jsx } from "react/jsx-runtime";
import { selectionPatchers } from '@store/selectionPatch';
import { useMixedFields } from '@store/hooks/useMixedFields';
import { SECTION_FITS } from '@lib/multiEdit';
import { useResolvedElement } from '@store/useResolvedElement';
import { DisplaySelect } from '../controls/DisplaySelect';
import { Row, Section } from './Section';
/**
 * Display for elements that get no Layout section — text and inputs —
 * which is where most `inline` values live.
 */
export const DisplaySection = ({ elementId }) => {
    const element = useResolvedElement(elementId);
    const { patchElement } = selectionPatchers(SECTION_FITS.display);
    const { isMixed } = useMixedFields(SECTION_FITS.display);
    if (!element || element.visibilityMode === 'none')
        return null;
    return (_jsx(Section, { title: "Display", elementId: elementId, fields: ['display', 'displayOuter'], cssProperties: ['display'], children: _jsx(Row, { label: "Display", children: _jsx(DisplaySelect, { display: element.display, outer: element.displayOuter, mixed: isMixed('displayOuter'), onChange: (displayOuter) => patchElement(elementId, { displayOuter }) }) }) }));
};
