interface ObsidianWindow extends Window {
  createFragment(callback?: (fragment: DocumentFragment) => void): DocumentFragment;
}

export function createObsidianFragment(document: Document): DocumentFragment {
  return (document.win as ObsidianWindow).createFragment();
}
