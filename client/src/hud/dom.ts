/**
 * Small typed helpers for building the HUD. The HUD updates every frame, so every write goes
 * through a setter that remembers the last value and leaves the DOM alone when nothing changed.
 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

export function textSetter(node: HTMLElement): (value: string) => void {
  let last: string | null = node.textContent;
  return (value) => {
    if (value === last) return;
    last = value;
    node.textContent = value;
  };
}

export function classSetter(node: HTMLElement, name: string): (on: boolean) => void {
  let last = node.classList.contains(name);
  return (on) => {
    if (on === last) return;
    last = on;
    node.classList.toggle(name, on);
  };
}

export function hiddenSetter(node: HTMLElement): (hidden: boolean) => void {
  let last = node.hidden;
  return (hidden) => {
    if (hidden === last) return;
    last = hidden;
    node.hidden = hidden;
  };
}

export function attrSetter(node: HTMLElement, name: string): (value: string | null) => void {
  let last = node.getAttribute(name);
  return (value) => {
    if (value === last) return;
    last = value;
    if (value === null) node.removeAttribute(name);
    else node.setAttribute(name, value);
  };
}
