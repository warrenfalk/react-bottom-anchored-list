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

export type BottomAnchoredListPosition = {
  anchoredToEnd: boolean;
  renderedLowerIndex: number;
  tailIndex: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

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
  onPositionChange?: (position: BottomAnchoredListPosition) => void;
  className?: string;
  contentClassName?: string;
  itemClassName?: string;
  style?: CSSProperties;
}

const EPSILON_PX = 0.5;
const MIN_END_APPEND_ANIMATION_MS = 140;
const MAX_END_APPEND_ANIMATION_MS = 280;

const joinClassNames = (...values: Array<string | undefined>): string =>
  values.filter(Boolean).join(' ');

const viewportBaseStyle: CSSProperties = {
  minHeight: 0,
  overflowY: 'auto',
  position: 'relative',
  overflowAnchor: 'none',
};

const contentBaseStyle: CSSProperties = {
  minHeight: '100%',
  display: 'flex',
  flexDirection: 'column-reverse',
};

const itemBaseStyle: CSSProperties = {
  flex: '0 0 auto',
};

const arePositionsEqual = (
  previous: BottomAnchoredListPosition,
  next: BottomAnchoredListPosition,
): boolean =>
  previous.anchoredToEnd === next.anchoredToEnd &&
  previous.renderedLowerIndex === next.renderedLowerIndex &&
  previous.tailIndex === next.tailIndex &&
  previous.scrollTop === next.scrollTop &&
  previous.scrollHeight === next.scrollHeight &&
  previous.clientHeight === next.clientHeight;

const easeOutCubic = (progress: number): number => 1 - (1 - progress) ** 3;

const didAppendNewerItems = <T,>(
  previousItems: readonly T[],
  nextItems: readonly T[],
  getItemKey?: (item: T, index: number) => Key,
): boolean => {
  if (previousItems.length === 0 || nextItems.length <= previousItems.length) {
    return false;
  }

  for (let index = 0; index < previousItems.length; index += 1) {
    const previousIdentity = getItemKey
      ? getItemKey(previousItems[index], index)
      : previousItems[index];
    const nextIdentity = getItemKey
      ? getItemKey(nextItems[index], index)
      : nextItems[index];

    if (previousIdentity !== nextIdentity) {
      return false;
    }
  }

  return true;
};

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
  onPositionChange,
  className,
  contentClassName,
  itemClassName,
  style,
}: BottomAnchoredListProps<T>) {
  const [renderedLowerIndex, setRenderedLowerIndex] = useState(() =>
    getInitialRenderedLowerIndex(items.length, initialRenderedCount),
  );

  const tailIndex = items.length - 1;

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const itemElementsRef = useRef(new Map<number, HTMLDivElement>());
  const anchorRef = useRef<Anchor>({ mode: 'end' });
  const previousItemCountRef = useRef(items.length);
  const previousItemsRef = useRef(items);
  const pendingAnimatedEndRestoreRef = useRef(false);
  const restoreAnimationFrameRef = useRef<number | null>(null);
  const animatedEndRestoreFrameRef = useRef<number | null>(null);
  const renderedLowerIndexRef = useRef(renderedLowerIndex);
  const isRestoringRef = useRef(false);
  const isAnimatingToEndRef = useRef(false);
  const tailIndexRef = useRef(tailIndex);
  const onPositionChangeRef = useRef(onPositionChange);
  const positionAnimationFrameRef = useRef<number | null>(null);
  const lastPublishedPositionRef =
    useRef<BottomAnchoredListPosition | null>(null);

  renderedLowerIndexRef.current = renderedLowerIndex;
  tailIndexRef.current = tailIndex;
  onPositionChangeRef.current = onPositionChange;

  const getViewportRect = (): DOMRect | null => {
    const viewportElement = viewportRef.current;

    return viewportElement?.getBoundingClientRect() ?? null;
  };

  const publishPositionChange = (): void => {
    const viewportElement = viewportRef.current;
    const handlePositionChange = onPositionChangeRef.current;

    if (!viewportElement || !handlePositionChange) {
      return;
    }

    const nextPosition: BottomAnchoredListPosition = {
      anchoredToEnd: anchorRef.current.mode === 'end',
      renderedLowerIndex: renderedLowerIndexRef.current,
      tailIndex: tailIndexRef.current,
      scrollTop: viewportElement.scrollTop,
      scrollHeight: viewportElement.scrollHeight,
      clientHeight: viewportElement.clientHeight,
    };
    const previousPosition = lastPublishedPositionRef.current;

    if (previousPosition && arePositionsEqual(previousPosition, nextPosition)) {
      return;
    }

    lastPublishedPositionRef.current = nextPosition;
    handlePositionChange(nextPosition);
  };

  const schedulePositionChange = (): void => {
    if (!onPositionChangeRef.current) {
      return;
    }

    if (positionAnimationFrameRef.current !== null) {
      return;
    }

    positionAnimationFrameRef.current = window.requestAnimationFrame(() => {
      positionAnimationFrameRef.current = null;
      publishPositionChange();
    });
  };

  const cancelAnimatedEndRestore = (): void => {
    if (animatedEndRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(animatedEndRestoreFrameRef.current);
      animatedEndRestoreFrameRef.current = null;
    }

    isAnimatingToEndRef.current = false;
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

  const animateEndRestore = (): void => {
    const viewportElement = viewportRef.current;

    if (!viewportElement || tailIndex < 0) {
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      restoreAnchor();
      anchorRef.current = captureAnchor();
      schedulePositionChange();
      return;
    }

    const viewportRect = getViewportRect();
    const tailElement = itemElementsRef.current.get(tailIndex);

    if (!viewportRect || !tailElement) {
      return;
    }

    const tailRect = tailElement.getBoundingClientRect();
    const deltaPx = tailRect.bottom - viewportRect.bottom;

    if (Math.abs(deltaPx) <= EPSILON_PX) {
      anchorRef.current = captureAnchor();
      schedulePositionChange();
      return;
    }

    cancelAnimatedEndRestore();

    const startScrollTop = viewportElement.scrollTop;
    const targetScrollTop = startScrollTop + deltaPx;
    const durationMs = Math.max(
      MIN_END_APPEND_ANIMATION_MS,
      Math.min(MAX_END_APPEND_ANIMATION_MS, Math.abs(deltaPx) * 0.6),
    );

    anchorRef.current = { mode: 'end' };
    isAnimatingToEndRef.current = true;

    let animationStartTime: number | null = null;

    const step = (timestamp: number): void => {
      if (animationStartTime === null) {
        animationStartTime = timestamp;
      }

      const elapsedMs = timestamp - animationStartTime;
      const progress = Math.min(1, elapsedMs / durationMs);
      const easedProgress = easeOutCubic(progress);

      isRestoringRef.current = true;
      viewportElement.scrollTop =
        startScrollTop + (targetScrollTop - startScrollTop) * easedProgress;
      isRestoringRef.current = false;
      publishPositionChange();

      if (progress < 1) {
        animatedEndRestoreFrameRef.current = window.requestAnimationFrame(step);
        return;
      }

      animatedEndRestoreFrameRef.current = null;
      isAnimatingToEndRef.current = false;
      anchorRef.current = captureAnchor();
      publishPositionChange();
    };

    animatedEndRestoreFrameRef.current = window.requestAnimationFrame(step);
  };

  const scheduleAnchorRestore = (): void => {
    if (isAnimatingToEndRef.current) {
      return;
    }

    if (restoreAnimationFrameRef.current !== null) {
      return;
    }

    restoreAnimationFrameRef.current = window.requestAnimationFrame(() => {
      restoreAnimationFrameRef.current = null;
      restoreAnchor();
      anchorRef.current = captureAnchor();
      schedulePositionChange();
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
    if (isRestoringRef.current || isAnimatingToEndRef.current) {
      return;
    }

    anchorRef.current = captureAnchor();

    if (anchorRef.current.mode === 'end') {
      // When the tail becomes visible below, snap it flush to the viewport bottom.
      restoreAnchor();
      anchorRef.current = captureAnchor();
    }

    revealOlderItemsIfNeeded();
    schedulePositionChange();
  };

  useLayoutEffect(() => {
    pendingAnimatedEndRestoreRef.current =
      anchorRef.current.mode === 'end' &&
      didAppendNewerItems(previousItemsRef.current, items, getItemKey);
    previousItemsRef.current = items;
  }, [getItemKey, items]);

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
    if (pendingAnimatedEndRestoreRef.current) {
      revealOlderItemsIfNeeded();
      return;
    }

    cancelAnimatedEndRestore();
    restoreAnchor();
    anchorRef.current = captureAnchor();
    revealOlderItemsIfNeeded();
    schedulePositionChange();
  });

  useEffect(() => {
    if (!pendingAnimatedEndRestoreRef.current) {
      return;
    }

    pendingAnimatedEndRestoreRef.current = false;
    animateEndRestore();
  }, [items]);

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

    if (positionAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(positionAnimationFrameRef.current);
    }

    cancelAnimatedEndRestore();
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
      style={{ ...viewportBaseStyle, ...style }}
    >
      <div
        ref={contentRef}
        className={joinClassNames('bottom-anchored-list__content', contentClassName)}
        style={contentBaseStyle}
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
            style={itemBaseStyle}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}
