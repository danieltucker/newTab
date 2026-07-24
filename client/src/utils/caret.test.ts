// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { getCaretPath, setCaretPath } from './caret';

function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

function placeCaret(node: Node, offset: number) {
  const sel = document.getSelection()!;
  const r = document.createRange();
  r.setStart(node, offset);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

afterEach(() => { document.body.innerHTML = ''; });

describe('getCaretPath / setCaretPath', () => {
  it('round-trips a caret position deep in the tree', () => {
    const root = mount('<p>hello</p><p>world</p>');
    placeCaret(root.children[1].firstChild!, 3);   // inside "world"

    const caret = getCaretPath(root);
    expect(caret).toEqual({ path: [1, 0], offset: 3 });

    document.getSelection()!.removeAllRanges();
    setCaretPath(root, caret);
    expect(getCaretPath(root)).toEqual({ path: [1, 0], offset: 3 });
  });

  it('returns null when the selection is outside the root', () => {
    const root = mount('<p>hi</p>');
    const other = mount('<p>elsewhere</p>');
    placeCaret(other.firstChild!.firstChild!, 1);
    expect(getCaretPath(root)).toBeNull();
  });

  it('clamps to a valid offset when the path resolves to a shorter node', () => {
    const root = mount('<p>hi</p>');
    setCaretPath(root, { path: [0, 0], offset: 99 });
    expect(getCaretPath(root)).toEqual({ path: [0, 0], offset: 2 });   // "hi".length
  });

  it('ignores a null caret without throwing', () => {
    const root = mount('<p>hi</p>');
    expect(() => setCaretPath(root, null)).not.toThrow();
  });
});
