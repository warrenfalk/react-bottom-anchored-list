# react-bottom-anchored-list

A React component for lists whose newest item should stay at the visual bottom,
such as chat transcripts, logs, feeds, and event streams.

## Install

```sh
pnpm add react-bottom-anchored-list
```

Use `pnpm`, not `npm`, when working in this repository.

## Basic Usage

`items` should be ordered from older to newer. The tail is the most recent item
and has the highest index.

```tsx
import { BottomAnchoredList } from 'react-bottom-anchored-list';

type Message = {
  id: string;
  body: string;
};

export function Messages({ messages }: { messages: Message[] }) {
  return (
    <BottomAnchoredList
      items={messages}
      getItemKey={(message) => message.id}
      className="messages"
      renderItem={(message) => <article>{message.body}</article>}
    />
  );
}
```

Give the viewport a stable height in CSS:

```css
.messages {
  height: 480px;
}
```

## Position Changes

Use `onPositionChange` when the owning component needs to react to scroll
position. The main signal is `anchoredToEnd`, which tells you whether the tail
is currently anchored at the bottom.

```tsx
import { useState } from 'react';
import {
  BottomAnchoredList,
  type BottomAnchoredListPosition,
} from 'react-bottom-anchored-list';

export function Messages({ messages }: { messages: Message[] }) {
  const [anchoredToEnd, setAnchoredToEnd] = useState(true);

  const handlePositionChange = (position: BottomAnchoredListPosition) => {
    setAnchoredToEnd(position.anchoredToEnd);
  };

  return (
    <>
      {!anchoredToEnd && <button type="button">New messages</button>}
      <BottomAnchoredList
        items={messages}
        getItemKey={(message) => message.id}
        onPositionChange={handlePositionChange}
        renderItem={(message) => <article>{message.body}</article>}
      />
    </>
  );
}
```

The callback receives:

| Field | Meaning |
| --- | --- |
| `anchoredToEnd` | `true` when the tail is anchored at the viewport bottom. |
| `renderedLowerIndex` | The lower index of the currently rendered tail window. |
| `tailIndex` | The highest source-array index, or `-1` for an empty list. |
| `scrollTop` | Current viewport `scrollTop`. |
| `scrollHeight` | Current viewport `scrollHeight`. |
| `clientHeight` | Current viewport `clientHeight`. |

Position notifications are coalesced to animation frames, and unchanged
snapshots are not emitted repeatedly.

## Imperative Control

Use a ref when the owning component needs to command the list to return to the
tail.

```tsx
import { useRef } from 'react';
import {
  BottomAnchoredList,
  type BottomAnchoredListHandle,
} from 'react-bottom-anchored-list';

export function Messages({ messages }: { messages: Message[] }) {
  const listRef = useRef<BottomAnchoredListHandle>(null);

  const scrollToTail = () => {
    listRef.current?.scrollToEnd({ behavior: 'smooth' });
  };

  return (
    <>
      <button type="button" onClick={scrollToTail}>
        Jump to newest
      </button>
      <BottomAnchoredList
        ref={listRef}
        items={messages}
        getItemKey={(message) => message.id}
        renderItem={(message) => <article>{message.body}</article>}
      />
    </>
  );
}
```

The imperative handle currently exposes:

| Method | Description |
| --- | --- |
| `scrollToEnd()` | Immediately restores the end anchor. |
| `scrollToEnd({ behavior: 'smooth' })` | Smoothly animates back to the end anchor. |

## Behavior Model

- The source array runs from older items at lower indexes to newer items at
  higher indexes.
- The component renders only `items[renderedLowerIndex..tailIndex]`.
- Items are placed in reverse DOM order with `column-reverse`, so the tail stays
  visually lowest.
- The current anchor is either the end or the visually lowest visible item.
- When the tail becomes visible below the viewport bottom, the list snaps back
  to the end.
- When rendered content does not extend far enough above the viewport, older
  items are revealed by decreasing `renderedLowerIndex`.
- After layout-affecting changes, the component restores the current anchor.

## Props

| Prop | Default | Description |
| --- | --- | --- |
| `items` | required | Source items ordered older to newer. |
| `renderItem` | required | Renders an item and receives `(item, index)`. |
| `getItemKey` | `index` | Returns a stable React key for an item. |
| `initialRenderedCount` | `24` | Initial number of tail items to render. |
| `revealBatchSize` | `initialRenderedCount` | Number of older items to reveal per batch. |
| `aboveViewportBufferPx` | `240` | Minimum rendered content above the viewport before revealing more older items. |
| `onPositionChange` | none | Receives position snapshots after scroll or layout position changes. |
| `className` | none | Class for the scroll viewport. |
| `contentClassName` | none | Class for the internal reverse-column content wrapper. |
| `itemClassName` | none | Class for each rendered item wrapper. |
| `style` | none | Inline style for the scroll viewport. |

## Development

```sh
pnpm install
pnpm dev
pnpm build
pnpm test:e2e
```

`pnpm build` builds the library into `dist/` and the demo into `demo-dist/`.
Both output directories are ignored by git.

For browser tests, use `nix develop` so Playwright can pick up the Nix-managed
browser bundle exposed by the shell.
