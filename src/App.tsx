import { useRef, useState } from 'react';
import {
  BottomAnchoredList,
  type BottomAnchoredListHandle,
  type BottomAnchoredListPosition,
} from './index';

type DemoMessage = {
  id: string;
  label: string;
  body: string;
  emphasis: boolean;
};

const createMessage = (sequence: number): DemoMessage => ({
  id: `message-${sequence}`,
  label: `Row ${sequence}`,
  body: Array.from(
    { length: (sequence % 4) + 1 },
    (_, lineIndex) =>
      `This row expands and contracts when nearby content changes. Line ${lineIndex + 1}.`,
  ).join(' '),
  emphasis: sequence % 6 === 0,
});

const buildMessageRange = (firstSequence: number, count: number): DemoMessage[] =>
  Array.from({ length: count }, (_, offset) => createMessage(firstSequence + offset));

const INITIAL_OLDER_SEQUENCE = 101;
const INITIAL_COUNT = 80;
const INITIAL_NEWER_SEQUENCE = INITIAL_OLDER_SEQUENCE + INITIAL_COUNT;

export default function App() {
  const listRef = useRef<BottomAnchoredListHandle>(null);
  const [messages, setMessages] = useState<DemoMessage[]>(() =>
    buildMessageRange(INITIAL_OLDER_SEQUENCE, INITIAL_COUNT),
  );
  const [nextOlderSequence, setNextOlderSequence] = useState(
    INITIAL_OLDER_SEQUENCE - 1,
  );
  const [nextNewerSequence, setNextNewerSequence] = useState(
    INITIAL_NEWER_SEQUENCE,
  );
  const [anchoredToEnd, setAnchoredToEnd] = useState(true);

  const prependOlder = () => {
    const olderCount = 8;
    const firstOlderSequence = nextOlderSequence - olderCount + 1;
    const olderMessages = buildMessageRange(firstOlderSequence, olderCount);

    setMessages((currentMessages) => [...olderMessages, ...currentMessages]);
    setNextOlderSequence(firstOlderSequence - 1);
  };

  const appendNewer = () => {
    const sequence = nextNewerSequence;

    setMessages((currentMessages) => [...currentMessages, createMessage(sequence)]);
    setNextNewerSequence(sequence + 1);
  };

  const mutateExistingRow = () => {
    setMessages((currentMessages) =>
      currentMessages.map((message, index) => {
        if (index !== Math.floor(currentMessages.length / 2)) {
          return message;
        }

        return {
          ...message,
          emphasis: !message.emphasis,
          body: message.emphasis
            ? message.body.slice(0, Math.max(message.body.length / 2, 40))
            : `${message.body} Extra detail expands this row to force a layout change and verify anchor restoration.`,
        };
      }),
    );
  };

  const handlePositionChange = (position: BottomAnchoredListPosition) => {
    setAnchoredToEnd(position.anchoredToEnd);
  };

  const scrollToTail = () => {
    listRef.current?.scrollToEnd({ behavior: 'smooth' });
  };

  const scrollToMiddleRow = () => {
    listRef.current?.scrollToItem(Math.floor(messages.length / 2));
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">React + TypeScript</p>
        <h1>BottomAnchoredList</h1>
        <p className="hero-copy">
          The list renders only a tail window, reveals more older rows when the
          rendered content no longer extends far enough above the viewport, and
          restores its anchor after item or container layout changes.
        </p>

        <div className="controls">
          <button type="button" onClick={prependOlder}>
            Prepend 8 older rows
          </button>
          <button type="button" onClick={appendNewer}>
            Append 1 newer row
          </button>
          <button type="button" onClick={mutateExistingRow}>
            Mutate 1 existing row
          </button>
          <button type="button" onClick={scrollToTail}>
            Scroll to tail
          </button>
          <button type="button" onClick={scrollToMiddleRow}>
            Scroll to middle row
          </button>
        </div>
        <p className="position-status">
          Scroll position: {anchoredToEnd ? 'anchored to tail' : 'away from tail'}
        </p>
      </section>

      <section className="demo-panel">
        <BottomAnchoredList
          ref={listRef}
          items={messages}
          getItemKey={(message) => message.id}
          initialRenderedCount={18}
          revealBatchSize={12}
          aboveViewportBufferPx={320}
          onPositionChange={handlePositionChange}
          className="demo-list"
          itemClassName="demo-list__item"
          renderItem={(message) => (
            <article className={`message-card${message.emphasis ? ' is-emphasis' : ''}`}>
              <div className="message-card__label">{message.label}</div>
              <p>{message.body}</p>
            </article>
          )}
        />
      </section>
    </main>
  );
}
