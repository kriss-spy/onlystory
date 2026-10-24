import { createContext, useContext } from 'react';

export type ReaderCommand =
  | 'previous'
  | 'next'
  | 'next-repeat'
  | `choice-${number}`
  | 'auto'
  | 'skip'
  | 'history'
  | 'bookmark'
  | 'chapters'
  | 'hide'
  | 'fullscreen'
  | 'language-zh-CN'
  | 'language-ja'
  | 'language-en'
  | 'checkpoint'
  | 'saves'
  | 'information';
export type GlobalPanel = 'settings' | 'commands';
export const readerCommand = (command: ReaderCommand) =>
  window.dispatchEvent(
    new CustomEvent('onlystory:reader-command', { detail: command }),
  );
export const UiContext = createContext<{
  open: (panel: GlobalPanel) => void;
  active: GlobalPanel | null;
}>({ open: () => {}, active: null });
export const useUi = () => useContext(UiContext);
