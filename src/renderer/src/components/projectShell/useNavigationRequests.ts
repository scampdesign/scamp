import { useEffect } from 'react';

import type { ComponentKind, ProjectData } from '@shared/types';
import { useCanvasStore } from '@store/canvasSlice';

import { flushPendingPageWrite } from '../../syncBridge';
import type { ActiveComponent } from './types';

type ComponentNavRef = {
  current: {
    openComponent: (
      name: string,
      fromPage: string | null,
      kind?: ComponentKind,
      from?: { name: string; kind: ComponentKind }
    ) => void;
    activePageName: string | null;
    activeComponent: ActiveComponent | null;
    persistActiveSource: () => void;
  };
};

/**
 * Consumes the one-shot canvas → navigation requests the store exposes:
 * the link indicator's page jump, and the page canvas's double-click into
 * a component instance's editor. Both route through the same flows the
 * sidebar uses, then clear the pending field. The component-nav effect
 * reads `openComponent` / `activePageName` via a `useLatest` ref so it
 * fires only when the one-shot request flips, with no stale-closure dep.
 */
export const useNavigationRequests = (
  project: ProjectData,
  setActivePageName: (name: string) => void,
  componentNav: ComponentNavRef
): void => {
  const pendingPageNavigation = useCanvasStore(
    (s) => s.pendingPageNavigation
  );
  useEffect(() => {
    if (pendingPageNavigation === null) return;
    if (project.pages.some((p) => p.name === pendingPageNavigation)) {
      // Save the page being left first, as the sidebar does: a write the
      // quiet window or a pause deferred would otherwise be dropped.
      flushPendingPageWrite();
      componentNav.current.persistActiveSource();
      setActivePageName(pendingPageNavigation);
    }
    useCanvasStore.getState().requestPageNavigation(null);
  }, [pendingPageNavigation, project.pages, setActivePageName, componentNav]);

  const pendingComponentNavigation = useCanvasStore(
    (s) => s.pendingComponentNavigation
  );
  useEffect(() => {
    if (pendingComponentNavigation === null) return;
    const { openComponent, activePageName, activeComponent } = componentNav.current;
    if (
      project.components.some((c) => c.name === pendingComponentNavigation) &&
      activeComponent?.name !== pendingComponentNavigation
    ) {
      // From a view or another component, the way back is that view or
      // component; from a page, the page.
      if (activeComponent !== null) {
        openComponent(pendingComponentNavigation, null, undefined, { name: activeComponent.name, kind: activeComponent.kind });
      } else {
        openComponent(pendingComponentNavigation, activePageName);
      }
    }
    useCanvasStore.getState().requestComponentNavigation(null);
  }, [pendingComponentNavigation, project.components, componentNav]);
};
