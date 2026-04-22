import {
  type CSSProperties,
  type Key,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

type EndAnchor = {
  mode: 'end';
};

type ItemAnchor = {
  mode: 'item';
  index: number;
  itemKey: Key;
  bottomOffsetPx: number;
};

type Anchor = EndAnchor | ItemAnchor;

/**
 * Renders `items[renderedLowerIndex..tailIndex]` and restores either the tail
 * anchor or the visually lowest visible item after layout changes.
 */
export interface BottomAnchoredListProps<T> {
  items: readonly T[];
  renderItem: (item: T, index: number) => ReactNode;
  getItemKey?: (item: T, index: number) => Key;
  initialRenderedCount?: number;
  revealBatchSize?: number;
  aboveViewportBufferPx?: number;
  className?: string;
  contentClassName?: string;
  itemClassName?: string;
  style?: CSSProperties;
}

const EPSILON_PX = 0.5;

const joinClassNames = (...values: Array<string | undefined>): string =>
  values.filter(Boolean).join(' ');

const clampRenderedLowerIndex = (value: number, itemCount: number): number => {
  if (itemCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(value, itemCount - 1));
};

const getInitialRenderedLowerIndex = (
  itemCount: number,
  initialRenderedCount: number,
): number => {
  if (itemCount <= initialRenderedCount) {
    return 0;
  }

  return itemCount - initialRenderedCount;
};

export function BottomAnchoredList<T>({
  items,
  renderItem,
  getItemKey,
  initialRenderedCount = 24,
  revealBatchSize = initialRenderedCount,
  aboveViewportBufferPx = 240,
  className,
  contentClassName,
  itemClassName,
  style,
}: BottomAnchoredListProps<T>) {
  const [renderedLowerIndex, setRenderedLowerIndex] = useState(() =>
    getInitialRenderedLowerIndex(items.length, initialRenderedCount),
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const itemElementsRef = useRef(new Map<number, HTMLDivElement>());
  const anchorRef = useRef<Anchor>({ mode: 'end' });
  const previousItemCountRef = useRef(items.length);
  const restoreAnimationFrameRef = useRef<number | null>(null);
  const renderedLowerIndexRef = useRef(renderedLowerIndex);
  const isRestoringRef = useRef(false);

  renderedLowerIndexRef.current = renderedLowerIndex;

  const tailIndex = items.length - 1;

  const getViewportRect = (): DOMRect | null => {
    const viewportElement = viewportRef.current;

    return viewportElement?.getBoundingClientRect() ?? null;
  };

  const captureAnchor = (): Anchor => {
    if (tailIndex < 0) {
      return { mode: 'end' };
    }

    const viewportRect = getViewportRect();

    if (!viewportRect) {
      return { mode: 'end' };
    }

    const tailElement = itemElementsRef.current.get(tailIndex);

    if (tailElement) {
      const tailRect = tailElement.getBoundingClientRect();

      if (tailRect.bottom <= viewportRect.bottom + EPSILON_PX) {
        return { mode: 'end' };
      }
    }

    for (
      let index = tailIndex;
      index >= renderedLowerIndexRef.current;
      index -= 1
    ) {
      const itemElement = itemElementsRef.current.get(index);

      if (!itemElement) {
        continue;
      }

      const itemRect = itemElement.getBoundingClientRect();
      const isVisibleInViewport =
        itemRect.top < viewportRect.bottom && itemRect.bottom > viewportRect.top;

      if (!isVisibleInViewport) {
        continue;
      }

      return {
        mode: 'item',
        index,
        itemKey: getItemKey ? getItemKey(items[index], index) : index,
        bottomOffsetPx: Math.max(0, itemRect.bottom - viewportRect.bottom),
      };
    }

    return { mode: 'end' };
  };

  const restoreAnchor = (): void => {
    const viewportElement = viewportRef.current;

    if (!viewportElement || tailIndex < 0) {
      return;
    }

    const viewportRect = getViewportRect();

    if (!viewportRect) {
      return;
    }

    const anchor = anchorRef.current;
    const targetIndex =
      anchor.mode === 'end'
        ? tailIndex
        : (() => {
            if (getItemKey) {
              const resolvedIndex = items.findIndex(
                (item, index) => getItemKey(item, index) === anchor.itemKey,
              );

              if (resolvedIndex !== -1) {
                return resolvedIndex;
              }
            }

            return Math.min(anchor.index, tailIndex);
          })();
    const targetElement = itemElementsRef.current.get(targetIndex);

    if (!targetElement) {
      return;
    }

    const targetRect = targetElement.getBoundingClientRect();
    const desiredBottom =
      anchor.mode === 'end'
        ? viewportRect.bottom
        : viewportRect.bottom + anchor.bottomOffsetPx;
    const deltaPx = targetRect.bottom - desiredBottom;

    if (Math.abs(deltaPx) <= EPSILON_PX) {
      return;
    }

    isRestoringRef.current = true;
    viewportElement.scrollTop += deltaPx;
    isRestoringRef.current = false;
  };

  const scheduleAnchorRestore = (): void => {
    if (restoreAnimationFrameRef.current !== null) {
      return;
    }

    restoreAnimationFrameRef.current = window.requestAnimationFrame(() => {
      restoreAnimationFrameRef.current = null;
      restoreAnchor();
      anchorRef.current = captureAnchor();
    });
  };

  const revealOlderItemsIfNeeded = (): void => {
    if (renderedLowerIndexRef.current === 0) {
      return;
    }

    const oldestRenderedItem = itemElementsRef.current.get(renderedLowerIndexRef.current);
    const viewportRect = getViewportRect();

    if (!oldestRenderedItem || !viewportRect) {
      return;
    }

    const oldestRect = oldestRenderedItem.getBoundingClientRect();
    const renderedContentAboveViewportPx = viewportRect.top - oldestRect.top;

    if (renderedContentAboveViewportPx >= aboveViewportBufferPx) {
      return;
    }

    setRenderedLowerIndex((previousLowerIndex) => {
      if (previousLowerIndex === 0) {
        return 0;
      }

      return Math.max(0, previousLowerIndex - revealBatchSize);
    });
  };

  const handleScroll = (): void => {
    if (isRestoringRef.current) {
      return;
    }

    anchorRef.current = captureAnchor();

    if (anchorRef.current.mode === 'end') {
      // When the tail becomes visible below, snap it flush to the viewport bottom.
      restoreAnchor();
      anchorRef.current = captureAnchor();
    }

    revealOlderItemsIfNeeded();
  };

  useLayoutEffect(() => {
    const previousItemCount = previousItemCountRef.current;
    previousItemCountRef.current = items.length;

    setRenderedLowerIndex((currentRenderedLowerIndex) => {
      if (items.length === 0) {
        return 0;
      }

      if (previousItemCount === 0 && currentRenderedLowerIndex === 0) {
        return getInitialRenderedLowerIndex(items.length, initialRenderedCount);
      }

      return clampRenderedLowerIndex(currentRenderedLowerIndex, items.length);
    });
  }, [initialRenderedCount, items.length]);

  useLayoutEffect(() => {
    restoreAnchor();
    anchorRef.current = captureAnchor();
    revealOlderItemsIfNeeded();
  });

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(() => {
      scheduleAnchorRestore();
      revealOlderItemsIfNeeded();
    });

    const viewportElement = viewportRef.current;
    const contentElement = contentRef.current;

    if (viewportElement) {
      resizeObserver.observe(viewportElement);
    }

    if (contentElement) {
      resizeObserver.observe(contentElement);
    }

    for (const itemElement of itemElementsRef.current.values()) {
      resizeObserver.observe(itemElement);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [items, renderedLowerIndex]);

  useEffect(() => () => {
    if (restoreAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreAnimationFrameRef.current);
    }
  }, []);

  const renderedItems = items
    .slice(renderedLowerIndex)
    .map((item, offset) => ({
      index: renderedLowerIndex + offset,
      item,
    }))
    .reverse();

  return (
    <div
      ref={viewportRef}
      className={joinClassNames('bottom-anchored-list', className)}
      onScroll={handleScroll}
      style={style}
    >
      <div
        ref={contentRef}
        className={joinClassNames('bottom-anchored-list__content', contentClassName)}
      >
        {renderedItems.map(({ item, index }) => (
          <div
            key={getItemKey ? getItemKey(item, index) : index}
            ref={(element) => {
              if (element) {
                itemElementsRef.current.set(index, element);
                return;
              }

              itemElementsRef.current.delete(index);
            }}
            className={joinClassNames('bottom-anchored-list__item', itemClassName)}
            data-index={index}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}
